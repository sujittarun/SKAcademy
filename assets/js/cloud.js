/* ============================================================
   SUPER KINGS ACADEMY — cloud adapter (window.LT_CLOUD)
   Tenant 'ska'. Supabase over fetch — no SDK, no build step.

   Same shape as the Academy Manager demo adapter, deliberately, so page
   code ports across. FIVE things are different, and each one is a defect
   the demo has that would be a live bug here:

   1. STORAGE PREFIX IS 'ska-', NOT 'amd-'.
      GitHub Pages serves every one of these apps from the SAME ORIGIN
      (sujittarun.github.io). localStorage is per-origin, so two tenants
      sharing a prefix overwrite each other's session and preferences.
      Every key below is prefixed once, from PREFIX, so this cannot drift.

      TO BE CLEAR ABOUT WHAT THIS DOES NOT DO: a prefix prevents
      COLLISION, not access. localStorage has no per-path isolation, so
      any script running on that origin — including one on another
      tenant's page — can read every key regardless of its prefix. The
      real protection is that nothing hostile runs on the origin, which
      is why LT.esc() on every innerHTML path is not optional.

   2. SIGN-IN CHECKS THE TENANT, not just the role.
      The demo checks am_role and stops. A staff user of another academy
      therefore signs in successfully, lands on the dashboard, and sees
      RLS return nothing — which paints as an empty academy rather than
      an error. Here a tenant mismatch is a hard failure at sign-in.

   3. READS THROW, THEY DO NOT FAIL SOFT TO A SEED.
      The demo's soft() swallows every error and returns null, so an auth
      failure, an RLS denial and a genuinely empty database are the same
      value — and the seeded dataset stays on screen looking like real
      bookings. This is exactly PLATFORM.md's "assert on content, not on
      length" trap. Here req() rejects and attaches err.status, and the UI
      renders "could not load". A brand-new academy MUST be allowed to
      look empty, because for its first week it is.

   4. NO CLIENT-SIDE MONEY, AT ALL.
      No rate table, no renewal amount, no UPI rotation, no reminder
      ladder. Every figure comes from a Postgres function. The demo does
      all four in JavaScript and its own CLAUDE.md lists them as debt.
      The write RPCs RETURN the amount they charged; use that, never a
      locally computed one. bookings.html in the demo fabricates an amount
      for its local mirror and that mirror then wins over the database
      row — so the board can display a price that was never charged.

   5. NO LOCAL LEDGER.
      localStorage holds the session and UI preferences. It does not hold
      members, payments, bookings or attendance. The demo keeps all of
      those in localStorage as the system of record, with a write path
      that swallows quota errors silently.
   ============================================================ */
(function () {
  "use strict";

  var APP_VER = "1.0.0";
  var PROJECT = "https://ugsklcipzyiogxynshnh.supabase.co";
  var BASE = PROJECT + "/rest/v1";
  var AUTH = PROJECT + "/auth/v1";
  var FILES = PROJECT + "/storage/v1";

  /* The anon key is PUBLIC BY DESIGN and belongs in this repo — it is the
     key every browser must present. service_role must never appear here. */
  var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnc2tsY2lwenlpb2d4eW5zaG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTUyMzksImV4cCI6MjA5ODQ3MTIzOX0.w7xkjdTkYN2qA0oxMKLUNtua0ScKVHKQzfEyIayh9eo";

  var TENANT = "ska";
  var PREFIX = "ska-";                 // see note 1 above
  var SESSION_KEY = PREFIX + "cloud-session";

  /* ------------------------------------------------------------
     DEV MODE — stand-in for authentication, on purpose and temporarily.

     There is no ska staff auth user yet. Creating one means creating an
     account and setting a password, which is not something this code (or
     the person who wrote it) should do — and a password written into a
     client file is a live credential on a public static site that stays
     in git history after you remove it. That has already happened four
     times on this platform.

     So DEV mode carries NO CREDENTIAL. It seats a local staff-shaped
     session with no Supabase token, purely so every screen is reachable
     and reviewable. Consequences, all deliberate:

       · every cloud READ returns nothing (there is no token, and RLS
         correctly refuses the anon key), so pages render from DEV_DATA,
         which is clearly-marked synthetic sample data;
       · every cloud WRITE IS BLOCKED and says so, loudly. It does not
         silently no-op. A dev mode where "record payment" appears to
         succeed and does nothing is the single most dangerous thing this
         file could contain;
       · a banner is shown on every page.

     GO-LIVE: create the staff user in the Supabase dashboard and set its
     App Metadata claims by migration. Nothing else changes — the real
     paths are what the app already calls.

     DEV IS DERIVED FROM THE HOST, NOT HARDCODED, so it fails SAFE.
     A committed `var DEV = true` in a public repo is one forgotten edit
     away from publishing an "Open as manager" button on the live site;
     deriving it means a deploy to github.io is production by
     construction and nobody has to remember anything. Set
     localStorage['ska-force-dev'] to preview the DEV shell on a real
     host deliberately.
     ------------------------------------------------------------ */
  var DEV = (function () {
    try {
      if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return true;
      if (location.protocol === "file:") return true;
      return localStorage.getItem("ska-force-dev") === "1";
    } catch (e) { return false; }
  })();

  /* ---------- session ----------
     WHERE THE SESSION LIVES IS THE USER'S CHOICE, and the default is to
     stay signed in.

     It used to be sessionStorage only, on the reasoning that the manager's
     screen is a shared front-desk device and a token in localStorage stays
     signed in through the evening and through whoever sits down next.
     Sound for a counter PC; wrong for the phone this is actually used on.

     sessionStorage dies with the TAB, and a phone kills tabs for reasons
     the user never sees: switching apps, memory pressure, and — the common
     one — opening the app from a home-screen shortcut, which is a brand
     new tab every single time. The owner reported being asked to sign in
     again and again on their own phone, which is exactly this.

     So: "Keep me signed in on this device" on the sign-in page, default
     ON, localStorage when ticked and sessionStorage when not. The shared
     counter still has its answer; the phone stops nagging.

     The access token still expires on its own hour-long clock either way,
     and bearer() refreshes it and saves the result — so a kept session
     survives indefinitely rather than for an hour.

     The theme stays in localStorage regardless — a preference is not a
     credential. */
  function stores() {
    var out = [];
    try { out.push(localStorage); } catch (e) {}
    try { out.push(sessionStorage); } catch (e) {}
    return out;
  }

  function session() {
    /* Read whichever store has it. localStorage first, because a kept
       session is the common case once the box has been ticked. */
    var s = null, i, raw;
    var all = stores();
    for (i = 0; i < all.length && !s; i++) {
      try {
        raw = all[i].getItem(SESSION_KEY);
        if (raw) s = JSON.parse(raw);
      } catch (e) { /* try the next one */ }
    }
    /* EVICT A STALE PREVIEW SESSION. devSignIn() is gated on DEV, so no
       NEW preview session can be minted once DEV is false — but one
       already sitting in a browser would otherwise keep satisfying
       LT.auth.require() forever, because nothing re-validates it. That
       would mean anyone who clicked "Open as manager" during the preview
       window still walks past the login redirect on go-live day. */
    if (s && s.dev && !DEV) { clearSession(); return null; }
    return s;
  }
  /* `keep` is only meaningful at SIGN-IN. A token refresh an hour later
     must not silently move the session to the other store, so it is
     written back to wherever it already lives. */
  function saveSession(s, keep) {
    var target;
    if (keep === undefined) {
      var inLocal = false;
      try { inLocal = !!localStorage.getItem(SESSION_KEY); } catch (e) {}
      target = inLocal ? "local" : "session";
    } else {
      target = keep ? "local" : "session";
    }
    /* Write one, clear the other, so the two can never disagree about who
       is signed in. */
    try {
      if (target === "local") {
        localStorage.setItem(SESSION_KEY, JSON.stringify(s));
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
        localStorage.removeItem(SESSION_KEY);
      }
    } catch (e) {}
  }

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  function tokenRequest(body, keep) {
    var grant = body.refresh_token ? "refresh_token" : "password";
    return fetch(AUTH + "/token?grant_type=" + grant, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error_description || j.msg || "sign-in failed");
        var meta = (j.user && j.user.app_metadata) || {};
        var s = {
          access_token: j.access_token,
          refresh_token: j.refresh_token,
          expires_at: Date.now() + (j.expires_in || 3600) * 1000,
          email: j.user && j.user.email,
          role: meta.am_role || "",
          tenant: meta.tenant_id || ""
        };

        /* NOTE 2. The claims must be in APP metadata — a user can edit
           their own User Metadata, which is why RLS does not trust it. An
           account with no claims signs in perfectly and then sees nothing
           at all, which looks identical to a broken app. Say which. */
        if (!s.role) {
          throw new Error("This account has no role set. Ask for am_role and tenant_id in its App Metadata.");
        }
        if (s.role !== "operator" && s.tenant !== TENANT) {
          throw new Error("This login belongs to another academy (" + (s.tenant || "none") + "), not Super Kings.");
        }
        /* keep is undefined on a refresh, and saveSession then leaves the
           session where it already is. */
        saveSession(s, keep);
        return s;
      });
    });
  }

  /* Resolves to the bearer to use. Unlike the demo's, this does NOT
     silently downgrade to the anon key when a session is missing — the
     caller is told, so a signed-out staff member sees "session expired"
     rather than an academy that appears to have no members. */
  function bearer(allowAnon) {
    var s = session();
    if (!s || !s.access_token) {
      if (allowAnon) return Promise.resolve(KEY);
      return Promise.reject(authError());
    }
    if (s.expires_at - Date.now() > 90 * 1000) return Promise.resolve(s.access_token);
    return tokenRequest({ refresh_token: s.refresh_token })
      .then(function (n) { return n.access_token; })
      .catch(function () {
        clearSession();
        if (allowAnon) return KEY;
        throw authError();
      });
  }

  function authError() {
    var e = new Error(DEV
      ? "DEV MODE: no live session, so nothing was read from the database."
      : "Your session has expired. Please sign in again.");
    e.status = 401;
    e.noSession = true;
    return e;
  }

  /* ---------- transport ----------
     One request function. Rejects on any non-2xx and attaches the status,
     so callers can tell 401 (sign in again) from 403 (not yours) from 409
     (already taken) from a network failure. */
  function req(path, opts, allowAnon) {
    opts = opts || {};
    return bearer(allowAnon).then(function (tok) {
      var headers = {
        apikey: KEY,
        Authorization: "Bearer " + tok,
        "Content-Type": "application/json"
      };
      if (opts.headers) for (var k in opts.headers) headers[k] = opts.headers[k];
      return fetch(BASE + path, {
        method: opts.method || "GET",
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      }).then(function (r) {
        return r.text().then(function (txt) {
          var body = null;
          if (txt) { try { body = JSON.parse(txt); } catch (e) { body = txt; } }
          if (!r.ok) {
            var msg = (body && (body.message || body.hint || body.error_description)) || ("request failed (" + r.status + ")");
            var err = new Error(friendly(msg));
            err.status = r.status;
            err.raw = body;
            report(path, err);
            throw err;
          }
          return body;
        });
      });
    });
  }

  /* Postgres speaks in constraint names; staff do not. */
  function friendly(msg) {
    var m = String(msg || "");
    if (/duplicate key|unique_violation|bookings_slot_unique/i.test(m)) return "That slot has just been taken.";
    if (/all courts taken/i.test(m))       return "Every court is booked for that slot.";
    if (/not authorised/i.test(m))         return "You do not have access to that.";
    if (/unknown sport/i.test(m))          return "That facility has no rate configured.";
    if (/already collected/i.test(m))      return "This booking was already collected.";
    if (/future date/i.test(m))            return "Attendance cannot be taken for a future date.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "No connection.";
    return m;
  }

  /* One member can hold more than one enrolment over time. The roster
     shows a person, so it needs ONE — the active one, else the newest.
     Flattened here rather than in each page, so every screen agrees on
     which enrolment it is talking about. */
  function flattenMember(m) {
    var list = (m && m.enrollments) || [];
    var pick = null, i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].status === "active") { pick = list[i]; break; }
    }
    if (!pick && list.length) pick = list[list.length - 1];
    m.enrollment_id = pick ? pick.id : null;
    m.centre_id     = pick ? pick.centre_id : null;
    /* The roster displays a batch NAME and filters on the id, so carry
       both. It used to derive the batch by calling attendance_roster()
       once per batch — which only answers for a date that has a session,
       so on a non-class day every member showed no batch at all. The
       enrolment knows this without a register existing. */
    m.batch_id      = pick ? pick.batch_id : null;
    m.batch         = pick && pick.batches ? pick.batches.name : null;
    m.batch_time    = pick && pick.batches && pick.batches.start_time
                        ? String(pick.batches.start_time).slice(0, 5) : null;
    m.renews_on     = pick ? pick.renewal_on : null;
    /* members.program is the roster's "sport"; fall back to the
       enrolment's when the application never carried one. */
    if (!m.sport && pick) m.sport = pick.sport;
    m.enrolled      = !!pick;
    return m;
  }

  function get(path)        { return req(path, {}, false); }
  function getPublic(path)  { return req(path, {}, true); }
  function post(path, body) { return req(path, { method: "POST", body: body }, false); }

  /* An RPC that must reject on failure — every money path is one of these. */
  function rpc(fn, args, allowAnon) {
    return req("/rpc/" + fn, { method: "POST", body: args || {} }, !!allowAnon);
  }

  /* ---------- dev guard ---------- */
  function devBlocked(what) {
    var e = new Error("DEV MODE — " + what + " was not saved. Sign-in is not wired yet.");
    e.dev = true;
    return Promise.reject(e);
  }

  /* ---------- telemetry ----------
     The operator console derives a tenant's status from the newest row in
     events. A tenant that sends nothing reads as "Onboarding" forever.
     No names, no phone numbers, no amounts ever go in an event. */
  function sid() {
    try {
      var k = PREFIX + "sid", v = sessionStorage.getItem(k);
      if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem(k, v); }
      return v;
    } catch (e) { return "nosession"; }
  }

  /* A visit is not a visitor. sid() lives in sessionStorage, so closing
     the tab makes the same person look new — which is the difference
     between "six people opened the link" and "one person opened it six
     times", and that is the only thing worth knowing about a link you
     have just sent out.

     localStorage, so it survives the tab and the day. Random and opaque:
     it identifies a browser profile, not a person, and carries no name,
     no phone and nothing derived from either. The server pairs it with
     the IP and user-agent it can see for itself; the page is not trusted
     for those and is not allowed to send them. */
  function vid() {
    try {
      var k = PREFIX + "vid", v = localStorage.getItem(k);
      if (!v) { v = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(k, v); }
      return v;
    } catch (e) { return null; }        // private mode: server falls back to a fingerprint
  }

  function page() {
    return location.pathname.split("/").pop() || "index.html";
  }

  /* COLUMN NAMES VERIFIED against the live table, and against what the
     other five tenants actually send. events is:
       tenant_id  not null
       name       not null   <- the event name. NOT "kind".
       page       a real column, not a props key
       level      not null, default 'info'
       session_id
       props      jsonb, everything else
       at         not null, default now()

     This was wrong in the first cut — it posted {kind, props:{page}} and
     PostgREST answered 400 PGRST204 "Could not find the 'kind' column",
     silently, on every page load. Telemetry failing silently is the worst
     shape of this bug: the operator console derives a tenant's status
     from the newest events row, so the academy would have read as
     "Onboarding" forever while looking perfectly healthy on screen.
     Caught by watching the live site's network tab, not by reading. */
  /* ---------- what device, without identifying the person ----------
     Enough to answer "is the client actually opening this, and on what?"
     — phone or laptop, which browser, how wide the screen, and whether
     they are running it as an installed app. Recorded once per event
     alongside the version.

     WHAT IS DELIBERATELY NOT HERE: no full user-agent string, no IP, no
     screen fingerprint, nothing that identifies a PERSON. events is
     insertable by anon — the public key is in this repo — so anything put
     here is effectively public, and the same reasoning that keeps names
     and phone numbers out of federated rollups applies. Buckets, not
     identifiers. */
  function device() {
    var ua = "";
    try { ua = String(navigator.userAgent || ""); } catch (e) {}
    var w = 0;
    try { w = window.innerWidth || 0; } catch (e) {}

    var kind = /iPad|Tablet/i.test(ua) || (w >= 700 && w < 1100) ? "tablet"
             : /Mobi|Android|iPhone/i.test(ua) || w < 700 ? "phone"
             : "desktop";

    /* Order matters: Edge and Chrome both say "Chrome", Chrome says
       "Safari". Test the most specific first. */
    var br = /Edg\//.test(ua) ? "edge"
           : /OPR\//.test(ua) ? "opera"
           : /Firefox\//.test(ua) ? "firefox"
           : /Chrome\//.test(ua) ? "chrome"
           : /Safari\//.test(ua) ? "safari"
           : "other";

    var os = /Android/i.test(ua) ? "android"
           : /iPhone|iPad|iPod/i.test(ua) ? "ios"
           : /Mac OS X/i.test(ua) ? "mac"
           : /Windows/i.test(ua) ? "windows"
           : "other";

    var standalone = false;
    try {
      standalone = !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
                   !!(navigator.standalone);
    } catch (e) {}

    /* Bucketed, not exact: a precise width is a fingerprint, a bucket is
       an answer to "does the layout they see match the one I tested". */
    var vw = w < 400 ? "<400" : w < 700 ? "400-699" : w < 1100 ? "700-1099" : "1100+";

    return { dev: kind, br: br, os: os, vw: vw, app: standalone };
  }

  function track(name, props) {
    var body = {
      tenant_id: TENANT,
      name: name || "page_view",
      page: page(),
      level: "info",
      session_id: sid(),
      props: Object.assign({ ver: APP_VER, vid: vid() }, device(), props || {})
    };
    /* Fire-and-forget, and anon-allowed: the events insert policy accepts
       a registered tenant_id from anon. A telemetry failure must never
       break a page, so this is the one call that swallows. */
    return req("/events", { method: "POST", body: body }, true).catch(function () { return null; });
  }

  var reported = {};
  function report(where, err) {
    /* Handled failures are reported too, not just crashes — a silent
       handled failure is how a broken screen looks healthy in the console. */
    if (err && err.noSession) return;          // expected in DEV, not a defect
    var key = where + "|" + (err && err.message);
    if (reported[key]) return;                 // once per page load, per message
    reported[key] = 1;
    /* props keys follow what the other tenants already write —
       msg / src / kind / ver — so platform_errors(), which groups by
       message + version, sees one vocabulary across all six academies
       instead of a sixth private one. */
    track("client_error", {
      msg:    String((err && err.message) || err).slice(0, 200),
      src:    where,
      kind:   (err && err.status) ? "http" : "crash",
      status: (err && err.status) || 0
    });
  }

  window.addEventListener("error", function (e) {
    report("window", e.error || new Error(e.message));
  });
  window.addEventListener("unhandledrejection", function (e) {
    report("promise", e.reason || new Error("unhandled rejection"));
  });

  /* ============================================================
     PUBLIC API
     ============================================================ */
  var API = {
    TENANT: TENANT,
    APP_VER: APP_VER,
    DEV: DEV,
    KEY: KEY,

    /* ---------- auth ---------- */
    session: session,
    /* A dev session only counts while DEV is on. Belt and braces with the
       eviction in session() above — the guard must not depend on the
       eviction having run. */
    signedIn: function () { var s = session(); return !!(s && (s.access_token || (DEV && s.dev))); },
    role: function () { var s = session(); return (s && s.role) || ""; },
    isCoach: function () { return API.role() === "coach"; },
    isStaff: function () { var r = API.role(); return r === "staff" || r === "operator"; },

    /* `keep` decides where the session is stored: true (the default) keeps
       it on the device through tab closes and phone restarts; false ties
       it to the tab, for a shared counter machine. */
    /* Ask the academy for a login. Creates a REQUEST, never an account —
       open sign-up is off on this project on purpose, so the only thing
       that can mint a login is an operator approving one. */
    requestAccess: function (o) {
      return rpc("request_staff_access", {
        p_tenant: TENANT,
        p_name:  o.name,
        p_email: o.email,
        p_role:  o.role || "coach",
        p_phone: o.phone || null,
        p_note:  o.note || null
      }, true);
    },

    /* ---------- forgot password ----------
       Asks Supabase to email a one-time recovery link. Deliberately
       resolves the SAME WAY whether or not the address has an account:
       telling a stranger "no such user" turns this box into a way to
       discover who works at the academy. The person who owns the address
       gets the mail; anyone guessing learns nothing.

       redirectTo must be on the project's allow-list or Supabase falls
       back to the Site URL — see the note in reset.html. */
    sendRecovery: function (email, redirectTo) {
      var to = String(email || "").trim();
      if (!to) return Promise.reject(new Error("Enter your email address first."));
      var url = AUTH + "/recover" +
        (redirectTo ? "?redirect_to=" + encodeURIComponent(redirectTo) : "");
      return fetch(url, {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: to })
      }).then(function (r) {
        /* 429 is the one failure worth surfacing: it means "you already
           asked", and silently swallowing it would have someone press the
           button ten more times. */
        if (r.status === 429) throw new Error("A link was just sent. Check your email, or try again in a minute.");
        return true;   /* every other outcome is reported the same way */
      });
    },

    signIn: function (email, password, keep) {
      return tokenRequest({ email: email, password: password },
                          keep === undefined ? true : !!keep);
    },

    /* DEV only. Seats a local staff-shaped session. No token, no
       credential, no database access — see the DEV note at the top. */
    devSignIn: function (role) {
      if (!DEV) return Promise.reject(new Error("Dev sign-in is disabled."));
      var s = {
        dev: true,
        email: "dev@local",
        role: role === "coach" ? "coach" : "staff",
        tenant: TENANT,
        expires_at: Date.now() + 12 * 3600 * 1000
      };
      saveSession(s);
      return Promise.resolve(s);
    },

    signOut: function () { clearSession(); },

    /* Who am I and what may I reach. NOTE: my_access() returns the key
       'tenant', NOT 'tenant_id'. Reading access.tenant_id gets undefined. */
    myAccess: function () { return rpc("my_access", {}); },

    /* ---------- tenant config ----------
       Narrow projection, deliberately. Callers want the court inventory
       and the court labels; the same jsonb also holds billing (UPI
       collection ids) and the WhatsApp settings, and this is called from
       booking.html, a page with no session.

       Verified 2026-08-17: as anon this returns [] — RLS refuses the
       tenants table outright, so nothing is exposed today. The narrowing
       is defence in depth against a future policy widening, not a fix
       for a live leak. Public pages must therefore cope with null. */
    tenantConfig: function () {
      return getPublic("/tenants?id=eq." + TENANT +
                       "&select=id,name,courts:config->courts,courtLabels:config->courtLabels")
        .then(function (rows) {
          var r = rows && rows[0];
          if (!r) return null;
          /* Re-wrap as { config: { … } }. Five pages already read
             row.config.courts / row.config.courtLabels, and the narrowing
             above is a transport detail — it should not force an edit in
             every caller, nor leave two shapes in circulation. */
          return {
            id: r.id,
            name: r.name,
            config: { courts: r.courts || null, courtLabels: r.courtLabels || null }
          };
        });
    },

    /* ---------- pricing (server-side, always) ---------- */
    slotPrice: function (sport, date, hour) {
      return rpc("slot_price", { p_tenant: TENANT, p_sport: sport, p_date: date, p_hour: hour });
    },
    isFullDay: function (sport) {
      return rpc("is_full_day", { p_tenant: TENANT, p_sport: sport });
    },

    /* ---------- bookings ----------
       recordBooking is THE operator write path, and it is the one that
       fixes the two-screen problem: amount and collection are arguments
       here, so a counter sale is one call.

       amount === null  → the server prices it (weekday ground rate, or
                          the hourly net rate). Pass a number only when the
                          operator deliberately overrode it.
       The response carries the amount actually charged. Use it. Never
       re-derive a price in this file. */
    recordBooking: function (o) {
      if (DEV) return devBlocked("the booking");
      return rpc("record_booking_v2", {
        p_tenant: TENANT,
        p_sport: o.sport,
        p_date: o.date,
        p_hour: o.hour,
        p_name: o.name,
        p_phone: o.phone || null,
        p_source: o.source || "Counter",
        p_court: o.court || null,
        p_amount: (o.amount === "" || o.amount == null) ? null : Number(o.amount),
        p_paid: !!o.paid,
        p_mode: o.mode || null,
        p_collected_by: o.collectedBy || null
      });
    },

    collectBooking: function (id, mode, by, amount) {
      if (DEV) return devBlocked("the payment");
      return rpc("collect_booking", {
        p_id: id,
        p_mode: mode || null,
        p_collected_by: by || null,
        p_amount: (amount === "" || amount == null) ? null : Number(amount)
      });
    },

    confirmBooking: function (id) {
      if (DEV) return devBlocked("the confirmation");
      return rpc("confirm_booking", { p_id: id });
    },
    cancelBooking: function (id, reason) {
      if (DEV) return devBlocked("the cancellation");
      return rpc("cancel_booking", { p_id: id, p_reason: reason || null });
    },
    blockMaintenance: function (o) {
      if (DEV) return devBlocked("the block");
      return rpc("block_maintenance", {
        p_tenant: TENANT, p_sport: o.sport, p_date: o.date,
        p_hour: o.hour, p_court: o.court, p_reason: o.reason || "Maintenance"
      });
    },

    /* EVERY pending request, whatever date it is for.

       The board's request tray used to be filled from bookingsOn(date),
       so a request only appeared if the operator happened to be looking
       at the day it was for. A request made on Tuesday for Saturday was
       invisible on Tuesday — which is how a confirmation gets missed, and
       the customer hears nothing.

       Oldest first: the person who has waited longest is the one to
       answer next. Past dates are included deliberately — a request that
       was never answered before its date passed is not resolved, it is a
       failure, and hiding it would hide the failure too. */
    pendingBookings: function () {
      return get("/bookings?tenant_id=eq." + TENANT +
                 "&status=eq.pending" +
                 "&select=id,name,phone,sport,court,date,hour,amount,status,source,created_at,paid_claim_at,paid_claim_ref,paid_attempt_at,paid_proof_path" +
                 "&order=created_at.asc");
    },

    /* Operator view of a day. Includes hour 0, which is where a full-day
       ground booking lives — the demo's board renders 6..22 only and would
       drop it entirely. */
    bookingsOn: function (date) {
      return get("/bookings?tenant_id=eq." + TENANT +
                 "&date=eq." + date +
                 "&select=id,name,phone,sport,court,date,hour,amount,status,source,paid_at,paid_mode,collected_by,paid_claim_at,paid_claim_ref,paid_attempt_at,paid_proof_path" +
                 "&order=hour.asc,court.asc");
    },
    bookingsBetween: function (from, to) {
      return get("/bookings?tenant_id=eq." + TENANT +
                 "&date=gte." + from + "&date=lte." + to +
                 "&select=id,name,phone,sport,court,date,hour,amount,status,source,paid_at,paid_mode,collected_by,paid_claim_at,paid_claim_ref,paid_attempt_at,paid_proof_path" +
                 "&order=date.asc,hour.asc");
    },

    /* ---------- public booking ----------
       request_booking is the ONLY booking entry point anon may call —
       record_booking_v2 and friends are revoked from public and anon, and
       correctly so. A public request lands as 'pending' with no court and
       is confirmed by staff. */
    /* What a MIXED selection costs — several surfaces, several nets, one
       total, all added in Postgres. The page prints it; it never works it
       out. Quoted at list price on purpose: discounting here would mean
       checking a typed phone against the roll before anything is booked,
       which turns the quote box into an oracle for "is this number one of
       your students?". */
    publicQuoteMulti: function (date, items, hours) {
      return rpc("public_quote_multi", {
        p_tenant: TENANT, p_date: date, p_items: items, p_hours: hours || []
      }, true);
    },
    /* The customer saying they have paid. A CLAIM — it writes
       paid_claim_at, never paid_at, so nothing a customer taps can put
       money in the books. The academy still has to see it in their account.
       Phone-guarded, so a caller can only speak for their own bookings. */
    claimBookingPayment: function (ids, phone, o) {
      o = o || {};
      return rpc("claim_booking_payment", {
        p_tenant: TENANT, p_ids: ids, p_phone: phone,
        p_ref: o.ref || null,
        p_proof_path: o.proofPath || null,
        /* true records only "they opened the UPI app" — not a claim, and
           never money. */
        p_attempt: !!o.attempt
      }, true);
    },

    /* What was ACTUALLY charged, once the rows exist — the only figure that
       knows about the student rate, because request_booking applied it. The
       phone is required: it stops the sum being readable by anyone who can
       guess a booking id. */
    publicBookingTotal: function (ids, phone) {
      return rpc("public_booking_total", {
        p_tenant: TENANT, p_ids: ids, p_phone: phone
      }, true);
    },

    /* `student` is a CLAIM, not a price. request_booking() checks the
       phone against the academy's own roll and discounts only a match, so
       ticking the box on a number nobody recognises changes nothing. The
       reply carries list_amount, student and discount_pct so the page can
       say which of those happened instead of quietly charging full price. */
    requestBooking: function (o) {
      return rpc("request_booking", {
        p_tenant: TENANT, p_sport: o.sport, p_date: o.date,
        p_hour: o.hour, p_name: o.name, p_phone: o.phone,
        p_is_student: !!o.student
      }, true);
    },

    /* Anonymous availability. public_slots is opt-in per tenant and 'ska'
       is opted in (config.features.publicSlots). Anon cannot read the
       bookings table itself. */
    /* What a selection COSTS, before anything is submitted.
       Anon-callable by design (migration 2026-08-18b) and the figure is
       computed in Postgres — the page never multiplies hours by a rate,
       and never holds one. Returns { currency, full_day, unit, count,
       total, note }. */
    publicQuote: function (sport, date, hours) {
      return rpc("public_quote", {
        p_tenant: TENANT, p_sport: sport, p_date: date,
        p_hours: hours && hours.length ? hours : null
      }, true);
    },

    publicSlots: function (from, to) {
      var q = "/public_slots?tenant_id=eq." + TENANT + "&date=gte." + from;
      if (to) q += "&date=lte." + to;
      return getPublic(q + "&select=*&order=date.asc");
    },

    /* ---------- admissions ---------- */
    submitApplication: function (o) {
      return rpc("submit_application", o, true);
    },

    /* ---------- documents ----------
       Uploads one file to the private `member-docs` bucket and returns the
       OBJECT NAME, which is what the application row stores. Never a URL:
       the bucket is private, so a URL would either be useless or, if it
       worked, would be a document readable by anyone who saw the link.

       THE PATH STARTS WITH THE TENANT, and that is load-bearing rather
       than tidy. The storage policy admits an anonymous upload only into a
       folder named for a real academy, and submit_application refuses a
       path that does not begin with its own tenant — so a form cannot file
       a family's Aadhaar under another academy's name even if it tried.

       `ref` groups one family's files together so a half-finished form
       leaves an identifiable orphan rather than loose objects.

       Anonymous callers may INSERT here and nothing else — no list, no
       read, no overwrite — so one family can never reach another's
       documents. The upload is x-upsert:false for the same reason: a
       chosen path must not be able to replace an existing object. */
    uploadDoc: function (file, kind, ref) {
      if (DEV) return devBlocked("the upload");
      if (!file) return Promise.reject(new Error("No file."));
      if (file.size > 5 * 1024 * 1024) {
        return Promise.reject(new Error("That file is larger than 5 MB. Please pick a smaller one."));
      }
      var ok = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (ok.indexOf(file.type) < 0) {
        return Promise.reject(new Error("Please upload a JPG, PNG or PDF."));
      }
      var ext = file.type === "application/pdf" ? "pdf"
              : file.type === "image/png" ? "png"
              : file.type === "image/webp" ? "webp" : "jpg";
      var path = TENANT + "/adm/" + ref + "/" + kind + "." + ext;

      /* allowAnon: a family filling the public form has no session, and
         must not be told to sign in. Staff uploading from inside the app
         pass their own token through the same call. */
      return bearer(true).then(function (tok) {
        return fetch(FILES + "/object/member-docs/" + encodeURI(path), {
          method: "POST",
          headers: {
            apikey: KEY,
            Authorization: "Bearer " + tok,
            "Content-Type": file.type,
            "x-upsert": "false"
          },
          body: file
        });
      }).then(function (res) {
        if (res.ok) return path;
        return res.text().then(function (t) {
          throw new Error("The upload was refused" + (t ? " — " + t.slice(0, 120) : "."));
        });
      });
    },
    /* ---------- the payment screenshot ----------
       Same shape as uploadDoc and for the same reason: the customer is
       anonymous, so the tenant folder is the only thing separating one
       academy's proofs from another's, and the bucket admits INSERT alone
       — no read, no list, no overwrite. A screenshot is bigger than a
       document scan and phones produce HEIC, so the ceiling and the type
       list differ from member-docs. */
    uploadPaymentProof: function (file, ref) {
      if (DEV) return devBlocked("the screenshot");
      if (!file) return Promise.reject(new Error("No file."));
      if (file.size > 10 * 1024 * 1024) {
        return Promise.reject(new Error("That image is larger than 10 MB. Please send a smaller one."));
      }
      var ok = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
      if (ok.indexOf(file.type) < 0) {
        return Promise.reject(new Error("Please send a screenshot — JPG, PNG or PDF."));
      }
      var ext = file.type === "application/pdf" ? "pdf"
              : file.type === "image/png"  ? "png"
              : file.type === "image/webp" ? "webp"
              : file.type === "image/heic" ? "heic" : "jpg";
      /* Stamped, so a second screenshot never collides with the first —
         the bucket refuses an overwrite by design. */
      var path = TENANT + "/pay/" + ref + "/" + Date.now().toString(36) + "." + ext;

      return bearer(true).then(function (tok) {
        return fetch(FILES + "/object/payment-proofs/" + encodeURI(path), {
          method: "POST",
          headers: {
            apikey: KEY,
            Authorization: "Bearer " + tok,
            "Content-Type": file.type,
            "x-upsert": "false"
          },
          body: file
        });
      }).then(function (res) {
        if (!res.ok) return res.text().then(function (t) {
          throw new Error("Could not send that image. " + (t || res.status));
        });
        return path;
      });
    },

    /* Staff only — the bucket gives anon no read at all, so this is how the
       desk sees what was sent. Short-lived by design. */
    signedProofUrl: function (path, seconds) {
      if (!path) return Promise.resolve(null);
      return bearer(false).then(function (tok) {
        return fetch(FILES + "/object/sign/payment-proofs/" + encodeURI(path), {
          method: "POST",
          headers: {
            apikey: KEY,
            Authorization: "Bearer " + tok,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ expiresIn: seconds || 300 })
        });
      }).then(function (res) {
        if (!res.ok) return null;
        return res.json();
      }).then(function (j) {
        return j && j.signedURL ? PROJECT + "/storage/v1" + j.signedURL : null;
      }).catch(function () { return null; });
    },


    /* A private object is read through a short-lived signed URL, minted by
       the server for a caller the storage policy already trusts. Staff
       only — the policy refuses anon, which is the point. */
    signedDocUrl: function (path, seconds) {
      if (!path) return Promise.resolve(null);
      return bearer(false).then(function (tok) {
        return fetch(FILES + "/object/sign/member-docs/" + encodeURI(path), {
          method: "POST",
          headers: {
            apikey: KEY,
            Authorization: "Bearer " + tok,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ expiresIn: seconds || 300 })
        });
      }).then(function (res) {
        if (!res.ok) throw new Error("Could not open that document.");
        return res.json();
      }).then(function (j) {
        return j && j.signedURL ? PROJECT + "/storage/v1" + j.signedURL : null;
      });
    },

    /* ---------- admissions ----------
       submitApplication has existed since day one; these three did not,
       which meant a family could apply and NOBODY could see it. The row
       landed in `applications` with status 'pending' and no screen in the
       app read that table — an inbox with no inbox. Found when a real
       submission did not appear anywhere.

       An application is not a member. approve_application() is what turns
       one into a member + enrolment; until then it is an enquiry. */
    applications: function (status) {
      var q = "/applications?tenant_id=eq." + TENANT +
              "&select=id,name,phone,email,age,dob,gender,parent_name,parent_phone," +
              "centre_id,batch_id,sport,program,slot,trial_date,status,member_id," +
              "consent_accepted,terms_accepted,consent_accepted_at,review_notes," +
              "reviewed_at,reviewed_by,source_channel,created_at," +
              "student_photo_path,parent_aadhaar_path,parent_aadhaar";
      if (status) q += "&status=eq." + encodeURIComponent(status);
      return get(q + "&order=created_at.desc");
    },

    /* Creates the member, the enrolment and the fee rule in one call, and
       stamps member_id back onto the application. Not reversible from
       here — reject BEFORE approving, not after. */
    approveApplication: function (id, by) {
      if (DEV) return devBlocked("the approval");
      return rpc("approve_application", {
        p_tenant: TENANT, p_application: id, p_by: by || null
      });
    },

    /* Marks it declined. Does NOT delete: a declined enquiry is still the
       record of someone who asked, and the per-phone rate limit counts
       rows, so removing one silently grants another attempt. */
    rejectApplication: function (id, by, reason) {
      if (DEV) return devBlocked("the decision");
      return rpc("reject_application", {
        p_tenant: TENANT, p_application: id,
        p_by: by || null, p_reason: reason || null
      });
    },

    /* Correct an application BEFORE approving it. Approving is one-way:
       it writes a member, an enrolment and a fee rule from this row, so a
       typo becomes the academy's permanent record of a family.

       Every field is optional — null means "leave it alone" — so a caller
       can send one correction without resending, and accidentally
       blanking, everything else. Refused once approved. */
    updateApplication: function (id, o) {
      if (DEV) return devBlocked("the change");
      o = o || {};
      return rpc("update_application", {
        p_tenant: TENANT, p_application: id,
        p_name: o.name || null,
        p_phone: o.phone || null,
        p_parent_name: o.parentName || null,
        p_parent_phone: o.parentPhone || null,
        p_dob: o.dob || null,
        p_gender: o.gender || null,
        p_sport: o.sport || null,
        p_centre: o.centre || null,
        p_batch: o.batch || null,
        p_by: o.by || null
      });
    },

    /* Puts an EXISTING student on the roll: one call, one transaction,
       member + enrolment together. Two inserts from here could half-fail
       and leave someone on the roster in no batch — invisible to every
       register and to the fee chase, and looking perfectly healthy. */
    addStudent: function (o) {
      if (DEV) return devBlocked("the student");
      /* An empty fee box is null, NEVER 0. The chain reads them as
         opposites — null defers to the batch rule, 0 is a scholarship that
         overrides it — and Number("") is 0, so the usual `|| null` would
         quietly enrol a paying student at nothing. */
      var fee = o.fee;
      fee = (fee === "" || fee === null || fee === undefined) ? null : Number(fee);
      if (fee !== null && !isFinite(fee)) fee = null;
      return rpc("add_student", {
        p_tenant: TENANT,
        p_name: o.name,
        p_phone: o.phone,
        p_batch: o.batch || null,
        p_parent_name: o.parentName || null,
        p_dob: o.dob || null,
        p_joined_on: o.joinedOn || null,
        p_centre: o.centre || null,
        p_by: o.by || null,
        p_custom_amount: fee
      });
    },

    /* ---------- members / roster ---------- */
    /* THE ROSTER. Two columns in the first version of this did not exist:
       `sport` and `centre_id`. members has neither — it has `program`, and
       the centre lives on the ENROLMENT, because a member is a person and
       an enrolment is what they signed up to. The read failed outright
       with "column members.sport does not exist", and it had been broken
       since it was written; it only surfaced the day there was a member to
       load.

       So: real columns only, `program` aliased to the `sport` the roster
       screen reads, and the enrolment embedded through the
       enrollments.member_id foreign key. The embed is what carries the
       centre, the batch and the renewal date — and enrollment_id, which
       record_fee_payment() needs to take money at all. */
    members: function () {
      return get("/members?tenant_id=eq." + TENANT +
                 "&select=id,name,phone,status,created_at,joined,parent_name,parent_phone,dob," +
                 "sport:program," +
                 "enrollments(id,centre_id,batch_id,sport,status,renewal_on,plan_months,batches(name,start_time,end_time))" +
                 "&order=name.asc")
        .then(function (rows) { return (rows || []).map(flattenMember); });
    },
    member: function (id) {
      return get("/members?tenant_id=eq." + TENANT + "&id=eq." + encodeURIComponent(id) + "&select=*")
        .then(function (r) { return (r && r[0]) || null; });
    },

    /* ---------- money in ----------
       record_fee_payment is the ONE write path for fees. It rolls the
       renewal date forward, writes the timeline and closes the reminder —
       a raw POST /payments does none of that, which is what the demo does. */
    /* record_fee_payment(p_tenant, p_enrollment, p_amount, p_months, p_mode,
         p_kind, p_on_date, p_ref, p_status, p_collected_by, p_note) */
    recordFeePayment: function (o) {
      if (DEV) return devBlocked("the fee payment");
      return rpc("record_fee_payment", {
        p_tenant: TENANT, p_enrollment: o.enrollment, p_amount: o.amount,
        p_months: o.months || 1, p_mode: o.mode || null, p_kind: o.kind || "renewal",
        p_on_date: o.onDate || null, p_ref: o.ref || null,
        p_status: o.status || "paid", p_collected_by: o.collectedBy || null,
        p_note: o.note || null
      });
    },
    /* resolve_fee(p_tenant, p_member, p_centre, p_sport, p_batch, p_months, p_custom)
       The 7-level chain. Never substitute a plan constant for this. */
    resolveFee: function (o) {
      o = o || {};
      return rpc("resolve_fee", {
        p_tenant: TENANT, p_member: o.member || null, p_centre: o.centre || null,
        p_sport: o.sport || null, p_batch: o.batch || null,
        p_months: o.months || 1,
        /* `|| null` here would turn a scholarship's 0 into "no override"
           and quote the batch fee back for a student who pays nothing. */
        p_custom: (o.custom === 0 || o.custom) ? o.custom : null
      });
    },
    /* reminder_queue(p_tenant, p_on). Owns the ladder including the +15
       stop. Never re-derive it. */
    reminderQueue: function (on) {
      return rpc("reminder_queue", { p_tenant: TENANT, p_on: on || null });
    },
    /* ---------- what the academy charges ----------
       fee_rules is the table resolve_fee() reads. These three edit it;
       none of them price anything. The board's per-rule "students" figure
       is resolve_fee() run over every active enrolment server-side — the
       client must never count matching rows itself, because two rules can
       cover one student and only the chain knows which wins. */
    feeRulesBoard: function () {
      return rpc("fee_rules_board", { p_tenant: TENANT });
    },
    /* Scope is a FULL replace: send every field, including the ones the
       form did not change, or the rule silently starts pricing a different
       group. Dates are the exception and are preserved when omitted. */
    saveFeeRule: function (o) {
      o = o || {};
      return rpc("save_fee_rule", {
        p_tenant: TENANT,
        p_id:        o.id || null,
        p_label:     o.label,
        p_monthly:   o.monthly,
        p_admission: (o.admission === 0 || o.admission) ? o.admission : 0,
        p_batch:     o.batch  || null,
        p_centre:    o.centre || null,
        p_sport:     o.sport  || null,
        p_member:    o.member || null,
        p_from:      o.from || null,
        p_to:        o.to || null,
        p_active:    o.active === false ? false : true,
        p_note:      o.note || null,
        p_by:        o.by || null
      });
    },
    /* Deactivates. There is no delete — a fee rule is the reason a family
       was charged what they were charged. */
    retireFeeRule: function (id, by) {
      return rpc("retire_fee_rule", { p_tenant: TENANT, p_id: id, p_by: by || null });
    },

    /* resolve_upi(p_tenant, p_centre, p_batch) — batch → centre → tenant. */
    resolveUpi: function (o) {
      o = o || {};
      return rpc("resolve_upi", {
        p_tenant: TENANT, p_centre: o.centre || null, p_batch: o.batch || null
      });
    },

    /* ---------- money in / money out, for Finance ----------
       fees.html calls these by name. They were missing until the review
       found it, and the gap was invisible because DEV routed every one of
       them to a fixture — so go-live would have been the first time
       anyone saw the Finance page lose its fee rows, its expenses and its
       net figure.

       READ-ONLY on payments: writing a fee goes through
       record_fee_payment() and nowhere else, because that is what rolls
       the renewal date forward, writes the timeline and closes the
       reminder. A raw insert here would look like it worked. */
    payments: function (from, to) {
      var q = "/payments?tenant_id=eq." + TENANT + "&status=eq.paid";
      if (from) q += "&on_date=gte." + from;
      if (to)   q += "&on_date=lte." + to;
      return get(q + "&select=id,name,type,kind,amount,mode,on_date,collected_by,member_id,enrollment_id" +
                 "&order=on_date.desc,id.desc");
    },

    expenses: function (from, to) {
      var q = "/expenses?tenant_id=eq." + TENANT;
      if (from) q += "&on_date=gte." + from;
      if (to)   q += "&on_date=lte." + to;
      return get(q + "&select=*&order=on_date.desc,id.desc");
    },

    /* An expense is not money the platform computes — it is a figure the
       academy states — so a direct insert is correct here, unlike a fee.
       tenant_id is set from the constant, never from the caller.

       COLUMNS VERIFIED against the live catalogue: the table has
       category (NOT NULL), payee, detail, amount (NOT NULL), mode,
       on_date, ref. There is no `name` and no `note` column — an insert
       shaped around those fails on category's not-null. */
    recordExpense: function (o) {
      if (DEV) return devBlocked("the expense");
      if (!o.category) return Promise.reject(new Error("A category is required."));
      return post("/expenses", {
        tenant_id: TENANT,
        category: o.category,
        payee:    o.payee  || null,
        detail:   o.detail || null,
        amount:   Number(o.amount),
        mode:     o.mode   || null,
        on_date:  o.onDate || null
      });
    },

    /* ---------- attendance ----------
       The SESSION model (batches → sessions → attendance_records), which
       is what attendance_roster/_history/_dashboard read. The demo writes
       the flat footfall table instead, and the shared reporting functions
       are blind to it. */
    /* Signatures verified against the live catalogue on 2026-08-17:
         attendance_roster(p_tenant, p_batch, p_date)
         mark_attendance(p_tenant, p_batch, p_date, p_enrollment, p_status, p_reason)
       p_batch is bigint — pass a number, not a name. */
    attendanceRoster: function (batch, date) {
      return rpc("attendance_roster", {
        p_tenant: TENANT, p_batch: batch, p_date: date || null
      });
    },
    markAttendance: function (o) {
      if (DEV) return devBlocked("the register");
      return rpc("mark_attendance", {
        p_tenant: TENANT, p_batch: o.batch, p_date: o.date,
        p_enrollment: o.enrollment, p_status: o.status, p_reason: o.reason || null
      });
    },
    /* p_batch here is an optional FILTER, not a target — which is why
       these keep the staff guard and a coach cannot call them. */
    attendanceHistory: function (o) {
      o = o || {};
      return rpc("attendance_history", {
        p_tenant: TENANT, p_from: o.from || null, p_to: o.to || null,
        p_centre: o.centre || null, p_batch: o.batch || null,
        p_member: o.member || null, p_sport: o.sport || null
      });
    },
    attendanceDashboard: function (o) {
      o = o || {};
      return rpc("attendance_dashboard", {
        p_tenant: TENANT, p_from: o.from || null, p_to: o.to || null,
        p_centre: o.centre || null, p_batch: o.batch || null,
        p_member: o.member || null, p_sport: o.sport || null
      });
    },

    /* Coach-scoped. A coach passes NO RLS policy — every policy tests for
       'staff' — so these SECURITY DEFINER functions are a coach's entire
       reach. Querying /members as a coach returns [] with HTTP 200, not an
       error, which is why a coach screen must use these and nothing else. */
    myCentres: function () {
      return rpc("my_centres", { p_tenant: TENANT });
    },
    myAttendanceBatches: function (date) {
      return rpc("my_attendance_batches", { p_tenant: TENANT, p_date: date || null });
    },
    /* p_batch is REQUIRED and is a TARGET, not a filter — that is exactly
       what lets a coach call this at all. Passing null would widen the
       query to the whole academy, so it is refused here rather than sent. */
    myAttendanceInsights: function (batch, from, to) {
      if (batch == null) return Promise.reject(new Error("A batch is required."));
      return rpc("my_attendance_insights", {
        p_tenant: TENANT, p_batch: batch, p_from: from || null, p_to: to || null
      });
    },

    /* ---------- structure ---------- */
    centres: function () {
      return get("/centres?tenant_id=eq." + TENANT + "&select=*&order=sort.asc");
    },
    batches: function () {
      return get("/batches?tenant_id=eq." + TENANT + "&select=*&order=id.asc");
    },
    coaches: function () {
      return get("/coaches?tenant_id=eq." + TENANT + "&select=*&order=name.asc");
    },

    /* ---------- telemetry ---------- */
    track: track,
    report: report
  };

  window.LT_CLOUD = API;

  /* Every page reports that it opened. Fired at load, unconditionally, so
     the tenant stays visible in the operator console from day one. */
  try { track("page_view"); } catch (e) {}
})();
