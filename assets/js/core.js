/* ============================================================
   SUPER KINGS ACADEMY — app shell (window.LT)
   Tenant 'ska'. ES5, one IIFE, no build step.

   A faithful port of the Academy Manager demo shell — same namespace,
   same class names, same glass components — so page markup ports across
   unchanged. FIVE differences, each of them a defect in the original that
   would be a live bug in a paying academy:

   1. STORAGE PREFIX 'ska-'. GitHub Pages serves every tenant app from the
      same origin (sujittarun.github.io), and localStorage is per-origin.
      Two apps sharing the 'amd-' prefix read each other's session and
      theme. Every key here comes from PREFIX so it cannot drift.

   2. LT.auth.require() ACTUALLY GUARDS. The demo's seats an anonymous
      visitor as a read-only "viewer" and never redirects — deliberate,
      because a sales prospect must never meet a password. This is not a
      demo; an unauthenticated visitor goes to login.html.

   3. THE LOGOUT BADGE IS NULL-SAFE. The original does
      nav.querySelector("[data-logout]").title = s.email but only renders
      those buttons when the visitor is not a viewer — so a session with
      an email and no token throws and aborts the rest of the page's boot
      script.

   4. THE MODAL SCROLL LOCK OBSERVES document.body, subtree. The original
      observes only the .lt-modal-backdrop elements present at
      DOMContentLoaded, so a modal injected later never locks the page and
      the background scrolls under it on touch. This app builds modals
      dynamically.

   5. NO VENUE SWITCHER. One centre, VAKAMAN FE. The demo's switcher
      labels the same key two different ways on one screen and forces a
      full location.reload() that destroys unsaved form state.

   LOAD ORDER MATTERS: this file must sit at the END of <body>, never in
   <head>. The ink-filter IIFE below returns early if document.body does
   not exist yet and never retries. Every page also needs the blocking
   theme script in <head> (see any page's <head>) or it renders dark and
   flashes.
   ============================================================ */
(function () {
  "use strict";

  var LT = (window.LT = window.LT || {});
  var PREFIX = "ska-";

  var ACADEMY = "Super Kings Academy";
  var VENUE = "VAKAMAN FE";   // all capitals, always. Not title case.

  var MANAGER_TABS = [
    ["dashboard.html", "Dashboard", '<path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z"/>'],
    ["bookings.html", "Bookings", '<path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14zM5 8V6h14v2zm4 6H7v-2h2zm4 0h-2v-2h2zm4 0h-2v-2h2zm-8 4H7v-2h2zm4 0h-2v-2h2z"/>'],
    ["attendance.html", "Attendance", '<path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>'],
    /* NO Admissions tab. Applications arrive a few times a week, so a
       permanent tab is a tab that is almost always empty — and a sixth
       one crowds the dock on a phone. They are handled inline on the
       dashboard, which is the screen already open. */
    ["players.html", "Members", '<path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>'],
    ["fees.html", "Finance", '<path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1H6.32c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>']
  ];

  /* ---------- Brand mark ----------
     A RELATIVE src, so a page served from a subdirectory would break it —
     every page in this app is at the repo root, which is what keeps it
     working on GitHub Pages under /SKAcademy/.

     The client is a CSK franchisee and will supply their own licensed
     mark. Until it lands, this renders a typographic monogram rather than
     an <img> to a file that does not exist (a broken-image icon in the
     nav of a client demo is worse than no image), and NO CSK or IPL
     artwork is reproduced anywhere in this repo. Drop the real file in as
     assets/img/ska-mark.png and this picks it up. */
  /* null  = try the file, fall back to the monogram via onerror
     false = do not even request it

     Held at FALSE until the client supplies their licensed Super Kings
     mark, because the file genuinely is not there yet and the <img>
     fallback fires one 404 per call, per page load. A client opening
     devtools on their own new site and seeing failed requests is a poor
     first impression for exactly the reason the fallback exists.
     Drop assets/img/ska-mark.png in, change this to null, done. */
  /* ---------- the mark ----------
     Drawn here rather than loaded, for two reasons. assets/img/ska-mark.png
     was referenced from day one and never existed, so every screen quietly
     fell through to a text monogram — a gold square with "SKA" in it, which
     is what "plain and boring" was. And an inline SVG cannot 404, scales to
     any size, and needs no second request.

     WHAT IT IS: a crown sitting on three stumps, with a seamed ball.
     "Super Kings" gives the crown, cricket gives the stumps and the ball,
     and the two share one silhouette rather than sitting side by side.

     WHAT IT DELIBERATELY IS NOT: anything resembling the CSK lion. The
     brief was CSK-themed colours without copying the mark, so the palette
     is the borrowed part and the drawing is ours.

     Built from four solid shapes and no strokes under 2px, because the
     nav renders it at 40px and hairlines disappear there. */
  LT.logoSVG = function (size) {
    var w = size || 40;
    /* The gradient id is suffixed so two marks on one page (nav + a card)
       cannot both answer to the same id — the second would inherit the
       first's stops and, if the first is ever removed, lose its fill. */
    var gid = "skaMark" + (LT._markN = (LT._markN || 0) + 1);
    return '' +
      '<svg viewBox="0 0 48 48" width="' + w + '" height="' + w + '" role="img" ' +
           'aria-label="' + ACADEMY + '" style="display:block">' +
        '<defs>' +
          '<linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="#ffe07a"/>' +
            '<stop offset=".55" stop-color="#f2c220"/>' +
            '<stop offset="1" stop-color="#d99a00"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<rect width="48" height="48" rx="12" fill="url(#' + gid + ')"/>' +
        /* one specular sweep across the top, so the badge belongs to the
           same material as the glass surfaces around it */
        '<path d="M0 12A12 12 0 0 1 12 0h24a12 12 0 0 1 12 12v5H0z" fill="#fff" opacity=".14"/>' +
        /* ONE SHAPE. A crown, drawn as a single continuous stroke.
           The previous mark was a crown plus three stumps plus two bails
           plus a ball — six things competing inside 40 pixels, which is why
           it read as a dark smudge. A logo at this size gets one idea.
           "Super Kings" is the idea, so: the crown, and nothing else.
           Stroked rather than filled — the open counters keep it light
           instead of a solid block of navy, which is what makes it feel
           drawn rather than stamped. */
        '<path d="M11 33V16.5l6.5 5.5L24 12l6.5 10 6.5-5.5V33z" fill="none" stroke="#101f38" ' +
              'stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>' +
        /* the band, a single line — a crown without one is a zigzag */
        '<path d="M13 37h22" stroke="#101f38" stroke-width="3.4" stroke-linecap="round"/>' +
      "</svg>";
  };

  /* Kept because older markup still calls it, and because a mark that
     cannot draw should still leave the academy's initials behind. */
  function monogram(w) {
    var f = Math.round(w * 0.42);
    return '<span aria-label="' + ACADEMY + '" style="display:grid;place-items:center;' +
      'width:' + w + 'px;height:' + w + 'px;border-radius:9px;' +
      'background:var(--gold-grad);color:#231d00;font-weight:800;' +
      'font-size:' + f + 'px;letter-spacing:-.5px;line-height:1">SKA</span>';
  }
  LT._monogram = function (w) { return monogram(w); };

  /* ---------- Theme (dark-first, persisted) ---------- */
  LT.theme = {
    get: function () { return document.documentElement.dataset.theme || "dark"; },
    set: function (t) {
      document.documentElement.dataset.theme = t;
      /* Stored as a RAW string, matching the blocking <head> script that
         reads it. Do NOT route this through LT.store — that JSON-parses
         and would throw on every load, silently falling back forever. */
      try { localStorage.setItem(PREFIX + "theme", t); } catch (e) {}
      document.querySelectorAll(".theme-toggle").forEach(LT.theme.paint);
    },
    toggle: function () { LT.theme.set(LT.theme.get() === "dark" ? "light" : "dark"); },
    paint: function (btn) {
      var dark = LT.theme.get() === "dark";
      btn.innerHTML = dark
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    }
  };

  /* ---------- Toast ---------- */
  var toastEl, toastTimer;
  LT.toast = function (msg, kind, ms) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "lt-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.dataset.kind = kind || "";
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, ms || 3200);
  };

  /* ---------- Small preference store ----------
     UI PREFERENCES ONLY. No members, no payments, no bookings, no
     attendance. The demo keeps all of those here as the system of record
     with a write path that swallows quota errors, so a recorded payment
     can vanish with no toast and no console warning. Postgres is the
     store; this is for which tab you had open. */
  LT.store = {
    read: function (key, fallback) {
      try { var v = localStorage.getItem(PREFIX + key); return v ? JSON.parse(v) : fallback; }
      catch (e) { return fallback; }
    },
    write: function (key, val) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); return true; }
      catch (e) { return false; }          // returns false — callers can react
    },
    drop: function (key) { try { localStorage.removeItem(PREFIX + key); } catch (e) {} }
  };

  /* ---------- Auth ----------
     Thin wrapper over LT_CLOUD so pages never touch the session directly.
     cloud.js may not be loaded on a purely public page, hence the guards. */
  LT.auth = {
    cloud: function () { return window.LT_CLOUD || null; },
    session: function () { var c = LT.auth.cloud(); return c ? c.session() : null; },
    signedIn: function () { var c = LT.auth.cloud(); return !!(c && c.signedIn()); },
    role: function () { var c = LT.auth.cloud(); return c ? c.role() : ""; },
    isCoach: function () { return LT.auth.role() === "coach"; },
    isDev: function () { var s = LT.auth.session(); return !!(s && s.dev); },

    logout: function () {
      var c = LT.auth.cloud();
      if (c) c.signOut();
      /* Clear UI state too. The demo's logout clears none of it. */
      LT.store.drop("last-tab");
      location.href = "login.html";
    },

    /* Where this role belongs. A coach sent to a manager page sees a wall
       of empty lists, because a coach passes no RLS policy at all. */
    homeFor: function (role) {
      return role === "coach" ? "coach.html" : "dashboard.html";
    },

    /* THE GUARD. Redirects, unlike the demo's.
       Returns true when the caller may continue rendering. */
    require: function (opts) {
      opts = opts || {};
      if (!LT.auth.signedIn()) {
        var here = (location.pathname.split("/").pop() || "dashboard.html");
        location.replace("login.html?next=" + encodeURIComponent(here));
        return false;
      }
      if (opts.staffOnly && LT.auth.isCoach()) {
        location.replace("coach.html");
        return false;
      }
      return true;
    }
  };

  /* ---------- Formatters ---------- */
  LT.fmtINR = function (n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); };

  LT.esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  /* Two initials, not one. Written out rather than as one expression:
     `+` binds tighter than `||`, so the compact form parses as
     `first || ("" + second)` and short-circuits the moment a first name
     exists — silently rendering "A" for "Aarav Krishnamurthy" on every
     avatar in the app, where initials collide constantly across a roster. */
  LT.initials = function (name) {
    var p = String(name || "").trim().split(/\s+/);
    var a = (p[0] || "")[0] || "";
    var b = (p[1] || "")[0] || "";
    return (a + b).toUpperCase() || "?";
  };

  /* LOCAL date, never toISOString(). IST is UTC+5:30, so before 05:30 IST
     toISOString() reports YESTERDAY — and the attendance ladder and every
     "today" filter are built on IST calendar days. */
  LT.isoDate = function (d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1), day = String(d.getDate());
    return d.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (day.length < 2 ? "0" + day : day);
  };
  LT.today = function () { return LT.isoDate(new Date()); };

  LT.dayName = function (iso) {
    var d = new Date(iso + "T00:00:00");
    return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
  };
  LT.shortDate = function (iso) {
    var d = new Date(iso + "T00:00:00");
    return d.getDate() + " " + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  };
  LT.hourLabel = function (h) {
    function t(x) { var ap = x >= 12 ? "PM" : "AM", hh = x % 12; return (hh === 0 ? 12 : hh) + " " + ap; }
    return t(h) + " – " + t((h + 1) % 24);
  };

  LT.phone10 = function (s) { return String(s || "").replace(/\D/g, "").slice(-10); };
  LT.waLink = function (phone, text) {
    return "https://wa.me/91" + LT.phone10(phone) + (text ? "?text=" + encodeURIComponent(text) : "");
  };

  /* ---------- DOM helpers ---------- */
  LT.$  = function (sel, root) { return (root || document).querySelector(sel); };
  LT.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  LT.skeleton = function (host, rows) {
    if (!host) return;
    var h = "";
    for (var i = 0; i < (rows || 3); i++) h += '<div class="lt-skel"></div>';
    host.innerHTML = h;
  };

  LT.empty = function (host, title, sub) {
    if (!host) return;
    host.innerHTML =
      '<div class="lt-empty"><div class="lt-empty-t">' + LT.esc(title) + "</div>" +
      (sub ? '<div class="lt-empty-s">' + LT.esc(sub) + "</div>" : "") + "</div>";
  };

  /* A failed read says so. It never leaves stale or invented rows on
     screen — an empty academy and a broken one must not look alike. */
  LT.fail = function (host, err) {
    if (!host) return;
    var msg = (err && err.message) || "Could not load.";
    host.innerHTML =
      '<div class="lt-empty"><div class="lt-empty-t">Could not load</div>' +
      '<div class="lt-empty-s">' + LT.esc(msg) + "</div></div>";
  };

  LT.courtLabel = function (code) {
    return (LT._courtLabels && LT._courtLabels[code]) || code || "";
  };
  LT.setCourtLabels = function (map) { LT._courtLabels = map || {}; };

  /* ---------- phone and number inputs, everywhere ----------
     Delegated on the document, so it covers inputs that did not exist when
     the page loaded (the add-booking form, the member sheet) and any page
     added later without anyone remembering this rule.

     DIGITS ONLY, CAPPED AT maxlength. The cap is read from the element
     rather than hardcoded to ten, because Aadhaar is also type="tel" and
     is twelve — a blanket slice(0,10) would have silently truncated every
     Aadhaar number to its first ten digits, which is the kind of bug that
     shows up months later as "the number is wrong".

     Stripping as they type also means a pasted "+91 99515 97567" becomes
     9951597567 instead of being rejected at submit, which is the same
     number and a worse experience to argue with. */
  document.addEventListener("input", function (e) {
    var el = e.target;
    if (!el || el.tagName !== "INPUT") return;
    if (el.type !== "tel" && el.inputMode !== "numeric") return;
    if (el.dataset && el.dataset.rawInput === "1") return;   /* opt out if ever needed */

    var cap = Number(el.getAttribute("maxlength")) || 10;
    var digits = String(el.value || "").replace(/\D/g, "");

    /* A pasted "+91 99515 97567" is eleven or twelve digits, and slicing
       the FIRST ten off it keeps the country code and throws away the end
       of the number — "9199515975", a real-looking number belonging to
       nobody. The server has always taken the LAST ten (right(phone, 10)),
       so drop a leading 91 when that is what makes it fit. Only for
       ten-digit fields: an Aadhaar may legitimately start with 91. */
    if (cap === 10 && digits.length > 10 && digits.indexOf("91") === 0 &&
        digits.length - 2 <= 10) {
      digits = digits.slice(2);
    }
    var cleaned = digits.slice(0, cap);
    if (el.value === cleaned) return;

    /* Keep the caret where the typist expects it: count the digits before
       it, then put it back after that many digits in the cleaned value.
       Without this, editing the middle of a number throws the caret to the
       end on every keystroke. */
    var pos = el.selectionStart;
    var before = String(el.value || "").slice(0, pos).replace(/\D/g, "").length;
    el.value = cleaned;
    try { el.setSelectionRange(before, before); } catch (err) {}
  });

  /* ---------- Count-up ----------
     Cancellable, unlike the original. A page that re-renders its stats
     after a cloud fetch otherwise leaves two rAF loops writing the same
     element, and the numbers visibly fight. */
  LT.countUp = function (el, target, opts) {
    if (!el) return;
    /* A direct call is the authority on this element, and it retires the
       observer below for good.

       Without this the same tile animates TWICE on every load: a page
       fetches its data, calls this to paint the real number, and then the
       1200ms safety net at the foot of this file finds the element still
       unvisited and counts it up from zero all over again. The two runs
       never overlap, so the rAF cancel above does not catch it — it reads
       as the number counting, settling, then counting again. Reported on
       the dashboard's "Collected today", but it was every stat on every
       page that paints from a fetch. */
    el._cuDone = true;
    opts = opts || {};
    target = Number(target) || 0;

    function paint(v) {
      el.textContent = (opts.prefix || "") + Number(v).toLocaleString("en-IN") + (opts.suffix || "");
    }

    if (el._cuRaf) cancelAnimationFrame(el._cuRaf);
    if (el._cuFail) clearTimeout(el._cuFail);

    /* Jump straight to the answer when motion is not wanted, or when the
       number is too small for a count to read as anything but a glitch.
       Animating 1 renders a visible "0" first, which on a hero stat says
       the academy has no ground. */
    var reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    if (reduce || Math.abs(target) < 5) { paint(target); return; }

    var dur = opts.ms || 900, from = 0, t0 = null;

    function frame(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      paint(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) { el._cuRaf = requestAnimationFrame(frame); }
      else { el._cuRaf = null; clearTimeout(el._cuFail); paint(target); }
    }

    /* SAFETY NET, and the reason it exists: requestAnimationFrame stops
       being called when the tab is not actively rendering — background
       tab, low-power mode, an inactive window. Without this the counter
       freezes at whatever fraction it reached and STAYS there, so the
       hero reads "2 practice nets" when there are 4. Observed exactly
       that, stuck at ~50%, which is worse than no animation because it
       looks deliberate. The final value is never left to the animation. */
    el._cuFail = setTimeout(function () {
      if (el._cuRaf) { cancelAnimationFrame(el._cuRaf); el._cuRaf = null; }
      paint(target);
    }, dur + 400);

    el._cuRaf = requestAnimationFrame(frame);
  };

  /* ---------- Manager shell ---------- */
  /* ---------- LT.ask — an in-app confirm, and an in-app prompt ----------
     window.confirm and window.prompt are NOT available everywhere this app
     runs. Measured in the app's own browser on 2026-08-18:

         window.prompt(...)   ->  throws "prompt() is not supported."
         window.confirm(...)  ->  returns false, no dialog shown

     A throw stops the handler; a false reads as "the operator said no". So
     every action gated on one of them does nothing, and three of the five
     did it SILENTLY — no toast, no error, the row just sits there. On a
     phone that was: decline a booking, approve an admission, decline an
     admission, and mark the rest of a register present.

     bookings.html already knew ("window.prompt is suppressed on iOS") and
     built a reason sheet for its cancel path. This is that sheet, moved
     into the design system so a page cannot forget it exists.

     Resolves with a STRING when confirmed (the note, "" when there is no
     note field) and with NULL when dismissed — so it drops into a
     `if (x === null) return;` prompt site unchanged, and a confirm site
     reads it as truthy/falsy. */
  LT.ask = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var back = document.createElement("div");
      back.className = "lt-modal-backdrop";
      back.style.zIndex = "200";
      back.innerHTML =
        '<div class="glass lt-modal" role="dialog" aria-modal="true" style="width:min(430px,100%);">' +
          '<div class="modal-head">' +
            "<div>" +
              (opts.kicker ? '<div class="kicker">' + LT.esc(opts.kicker) + "</div>" : "") +
              '<h2 style="font-size:19px;">' + LT.esc(opts.title || "Are you sure?") + "</h2>" +
            "</div>" +
            '<button class="btn btn-icon btn-ghost" data-x aria-label="Close">✕</button>' +
          "</div>" +
          (opts.sub ? '<p style="color:var(--ink-mid);font-size:13.5px;margin-bottom:14px;">' +
                      LT.esc(opts.sub) + "</p>" : "") +
          (opts.note
            ? '<input type="text" data-note maxlength="80" placeholder="' +
              LT.esc(opts.notePlaceholder || "Add a note (optional)") +
              '" style="margin-bottom:16px;" />'
            : "") +
          '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">' +
            '<button class="btn btn-glass" data-no>' + LT.esc(opts.cancelLabel || "Cancel") + "</button>" +
            '<button class="btn ' + (opts.danger ? "" : "btn-primary") + '" data-yes' +
              (opts.danger
                ? ' style="background:linear-gradient(135deg,#e5484d,#c2383f);color:#fff;"'
                : "") + ">" +
              LT.esc(opts.confirmLabel || "Confirm") + "</button>" +
          "</div>" +
        "</div>";
      document.body.appendChild(back);

      var noteEl = back.querySelector("[data-note]");
      var done = false;
      function finish(val) {
        if (done) return;
        done = true;
        back.classList.remove("open");
        document.removeEventListener("keydown", onKey);
        /* Let the close transition run before the node goes, or the sheet
           vanishes instead of leaving. */
        setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 220);
        resolve(val);
      }
      function onKey(e) {
        if (e.key === "Escape") finish(null);
        else if (e.key === "Enter" && !e.shiftKey) finish(noteEl ? String(noteEl.value || "").trim() : "");
      }
      back.addEventListener("click", function (e) {
        if (e.target === back || e.target.closest("[data-x]") || e.target.closest("[data-no]")) return finish(null);
        if (e.target.closest("[data-yes]")) return finish(noteEl ? String(noteEl.value || "").trim() : "");
      });
      document.addEventListener("keydown", onKey);

      /* Force layout so the transition has a "from" state, then open in the
         same tick.

         NOT requestAnimationFrame. rAF does not fire while a tab is hidden
         or backgrounded, so the sheet was appended and never given .open —
         it sat at opacity 0 forever. An operator who taps Approve, switches
         to WhatsApp to check something and comes back would find nothing
         had happened, which is the exact failure this function exists to
         remove. Reading offsetHeight is synchronous and always runs.

         Same lesson the reveal and count-up observers already carry: never
         let a visual step depend on a frame that may never come. */
      void back.offsetHeight;
      back.classList.add("open");
      var f = noteEl || back.querySelector("[data-yes]");
      if (f) { try { f.focus(); } catch (e) {} }
    });
  };

  LT.managerShell = function (activeHref, opts) {
    opts = opts || {};
    var s = LT.auth.session();

    var tabsHtml = MANAGER_TABS.map(function (t) {
      var act = t[0] === activeHref ? " active" : "";
      return '<a class="nav-tab' + act + '" href="' + t[0] + '"><svg viewBox="0 0 24 24" fill="currentColor">' + t[2] + "</svg><span>" + t[1] + "</span></a>";
    }).join("");
    var dockHtml = MANAGER_TABS.map(function (t) {
      var act = t[0] === activeHref ? " active" : "";
      return '<a class="dock-tab' + act + '" href="' + t[0] + '"><svg viewBox="0 0 24 24" fill="currentColor">' + t[2] + "</svg>" + t[1] + "</a>";
    }).join("");

    var nav = document.createElement("nav");
    nav.className = "lt-nav glass";
    nav.innerHTML =
      '<a class="nav-brand" href="dashboard.html"><span class="mark">' + LT.logoSVG(40) + "</span>" +
      '<span class="t"><strong>' + ACADEMY + "</strong><span>" + VENUE + "</span></span></a>" +
      (opts.minimal ? "" : '<div class="nav-tabs">' + tabsHtml + "</div>") +
      '<div class="nav-actions">' +
      '<button type="button" class="theme-toggle"></button>' +
      '<button type="button" class="btn btn-icon btn-glass only-mobile" data-logout aria-label="Sign out" title="Sign out">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>' +
      "</button>" +
      '<button type="button" class="btn btn-ghost btn-sm hide-mobile" data-logout>Sign out</button>' +
      "</div>";
    document.body.prepend(nav);

    if (!opts.minimal) {
      var dock = document.createElement("nav");
      dock.className = "lt-dock glass";
      dock.innerHTML = dockHtml;
      document.body.appendChild(dock);
    }

    /* Null-safe: the original assumes the button exists. */
    if (s && s.email) {
      var badge = nav.querySelector("[data-logout]");
      if (badge) badge.title = s.email;
    }

    if (window.LT_CLOUD && LT_CLOUD.DEV) LT.devBanner();
  };

  /* ---------- DEV banner ----------
     Loud on purpose. Sample data on screen that a manager mistakes for
     their academy is the worst outcome this app can produce, and this
     platform has already shipped a dashboard showing an academy that had
     never taken a rupee. */
  LT.devBanner = function () {
    if (document.querySelector(".lt-devbar")) return;
    var b = document.createElement("div");
    b.className = "lt-devbar";
    b.textContent = "SAMPLE DATA — nothing here is from the live academy, and nothing you enter is saved.";
    document.body.prepend(b);
    document.body.classList.add("has-devbar");

    /* MEASURE the banner instead of guessing its height. The text wraps to
       two or three lines on a phone, so a fixed 52px offset left the
       floating nav sitting ON TOP of the page heading — which is what it
       was doing on every coach and manager screen. Re-measured on resize
       and on orientation change, because that is when the wrap changes. */
    function sizeDevbar() {
      var h = b.getBoundingClientRect().height || 34;
      document.documentElement.style.setProperty("--devbar-h", Math.round(h) + "px");
    }
    sizeDevbar();
    window.addEventListener("resize", sizeDevbar);
    window.addEventListener("orientationchange", sizeDevbar);
  };

  /* ---------- Emblem ink filter (light theme) ---------- */
  (function injectInkFilter() {
    if (!document.body || document.getElementById("mxInk")) return;
    var host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    host.setAttribute("width", "0");
    host.setAttribute("height", "0");
    host.setAttribute("aria-hidden", "true");
    host.style.position = "absolute";
    host.innerHTML =
      '<filter id="mxInk" color-interpolation-filters="sRGB">' +
      '<feColorMatrix type="matrix" values="1 0 -0.87 0 0  0 1 -0.85 0 0  0 0 0.2 0 0  0 0 0 1 0"/>' +
      "</filter>";
    document.body.appendChild(host);
  })();

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    LT.$$("[data-logo]").forEach(function (el) {
      el.innerHTML = LT.logoSVG(el.dataset.logo || 30);
    });

    LT.$$(".theme-toggle").forEach(function (btn) {
      LT.theme.paint(btn);
      btn.addEventListener("click", LT.theme.toggle);
    });

    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("[data-logout]")) LT.auth.logout();
    });

    /* Scroll reveal + the Safari safety net. .reveal markup, html.lt-js
       and this observer are a three-part unit: ship the class without the
       observer and every card stays permanently invisible. */
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
        });
      }, { threshold: 0.12 });
      LT.$$(".reveal").forEach(function (el) { io.observe(el); });
      setTimeout(function () {
        LT.$$(".reveal").forEach(function (el) {
          if (getComputedStyle(el).opacity !== "1") {
            el.style.transition = "none";
            el.style.opacity = "1";
            el.style.transform = "none";
          }
          el.classList.add("in");
        });
      }, 1000);
    } else {
      LT.$$(".reveal").forEach(function (el) { el.classList.add("in"); });
    }

    LT.$$(".glass-hover").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
        card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
      });
    });

    /* Observe the whole body, subtree. Modals in this app are built after
       load, and the original's element-scoped observer would never see
       them — the page then scrolls behind an open modal on touch. */
    if ("MutationObserver" in window) {
      var lockSync = function () {
        document.body.classList.toggle("lt-noscroll", !!document.querySelector(".lt-modal-backdrop.open"));
      };
      new MutationObserver(lockSync).observe(document.body, {
        attributes: true, attributeFilter: ["class"], childList: true, subtree: true
      });
    }

    /* Count-up stats.

       THE MARKUP SHIPS "0" AND RELIES ON JS TO MAKE IT TRUE, so anything
       that stops the observer firing leaves a stat reading zero — and a
       hero tile saying "0 practice nets" is not a missing animation, it
       is a false statement about the academy. The observer does not fire
       when the element never reaches the threshold: a short window, a
       zero-height viewport, a hidden tab, a print. So the same safety net
       the reveal system uses applies here, for the same reason.

       Verified the hard way: with the strip below a viewport that never
       scrolled, all four tiles sat at 0 indefinitely. */
    var seen = new WeakSet();
    function runCount(el) {
      if (seen.has(el) || el._cuDone) return;
      seen.add(el);
      LT.countUp(el, Number(el.dataset.countup || 0), {
        prefix: el.dataset.prefix || "", suffix: el.dataset.suffix || ""
      });
    }

    if ("IntersectionObserver" in window) {
      var cu = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { runCount(en.target); cu.unobserve(en.target); }
        });
      }, { threshold: 0.4 });
      LT.$$("[data-countup]").forEach(function (el) { cu.observe(el); });

      /* Whatever has not counted by now gets its real value, animation or
         not. Correct beats animated. */
      setTimeout(function () {
        LT.$$("[data-countup]").forEach(runCount);
      }, 1200);
    } else {
      LT.$$("[data-countup]").forEach(runCount);
    }
  });
})();
