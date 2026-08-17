/* ============================================================
   SUPER KINGS ACADEMY — DEV sample data (window.SKA_DEV)

   Shown ONLY while LT_CLOUD.DEV is true, always behind the striped
   banner, and never mixed with a live read: a page either renders real
   rows from Postgres or renders these, never both. The demo app blends
   the two — its reads fail soft to null and the seed stays on screen —
   which is how a dashboard can show an academy that has never taken a
   rupee.

   EVERY NAME HERE IS SYNTHETIC AND WAS CHECKED, not assumed. All 18 were
   run against members and coaches across every tenant on 2026-08-17 and
   returned zero collisions. This matters because the demo repo shipped
   five REAL member names in its public fixtures for months — inherited
   from the app it was forked from, where only the git history had been
   cleaned and the file contents were never audited.

   If you add a name, check it:
     select name, tenant_id from members
      where lower(btrim(name)) = lower(btrim('<the name>'));

   Phones are the platform's synthetic 90000 block, so no real handset is
   reachable from this data.

   This file must NOT grow into a local ledger. It is a picture of a
   working academy for review purposes. Postgres is the store.
   ============================================================ */
(function () {
  "use strict";

  function d(offset) {
    var x = new Date();
    x.setDate(x.getDate() + offset);
    var m = String(x.getMonth() + 1), day = String(x.getDate());
    return x.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (day.length < 2 ? "0" + day : day);
  }

  var members = [
    { id: 1,  name: "Aarav Krishnamurthy",      phone: "9000000101", sport: "cricket", status: "active",  batch: "Sub-Junior AM",  renews_on: d(4),   fee: 2500 },
    { id: 2,  name: "Dhruv Sundaravel",         phone: "9000000102", sport: "cricket", status: "active",  batch: "Sub-Junior AM",  renews_on: d(-1),  fee: 2500 },
    { id: 3,  name: "Kavin Rajasekar",          phone: "9000000103", sport: "cricket", status: "active",  batch: "Junior PM",      renews_on: d(11),  fee: 3000 },
    { id: 4,  name: "Nithin Balachandar",       phone: "9000000104", sport: "cricket", status: "active",  batch: "Junior PM",      renews_on: d(-6),  fee: 3000 },
    { id: 5,  name: "Pranav Meenakshisundaram", phone: "9000000105", sport: "cricket", status: "active",  batch: "Senior AM",      renews_on: d(2),   fee: 3500 },
    { id: 6,  name: "Rithvik Chidambaram",      phone: "9000000106", sport: "cricket", status: "active",  batch: "Senior AM",      renews_on: d(-17), fee: 3500 },
    { id: 7,  name: "Sanjay Ponnusamy",         phone: "9000000107", sport: "cricket", status: "active",  batch: "Junior PM",      renews_on: d(19),  fee: 3000 },
    { id: 8,  name: "Tharun Vaidyanathan",      phone: "9000000108", sport: "cricket", status: "active",  batch: "Sub-Junior AM",  renews_on: d(7),   fee: 2500 },
    { id: 9,  name: "Vishal Kandaswamy",        phone: "9000000109", sport: "cricket", status: "paused",  batch: "Senior AM",      renews_on: d(23),  fee: 3500 },
    { id: 10, name: "Yuvan Thirumalai",         phone: "9000000110", sport: "cricket", status: "active",  batch: "Junior PM",      renews_on: d(-3),  fee: 3000 },
    { id: 11, name: "Adhya Venkataraman",       phone: "9000000111", sport: "cricket", status: "active",  batch: "Sub-Junior AM",  renews_on: d(9),   fee: 2500 },
    { id: 12, name: "Ishani Muthukumar",        phone: "9000000112", sport: "cricket", status: "active",  batch: "Junior PM",      renews_on: d(-9),  fee: 3000 },
    { id: 13, name: "Keerthana Sivaprakash",    phone: "9000000113", sport: "cricket", status: "active",  batch: "Senior AM",      renews_on: d(14),  fee: 3500 },
    { id: 14, name: "Nivedha Ramanujam",        phone: "9000000114", sport: "cricket", status: "active",  batch: "Sub-Junior AM",  renews_on: d(1),   fee: 2500 },
    { id: 15, name: "Swetha Alagappan",         phone: "9000000115", sport: "cricket", status: "active",  batch: "Junior PM",      renews_on: d(-20), fee: 3000 }
  ];

  var coaches = [
    { id: 1, name: "Coach Bhaskar Rajendran",  phone: "9000000201", role: "coach" },
    { id: 2, name: "Coach Manoj Selvakumar",   phone: "9000000202", role: "coach" },
    { id: 3, name: "Coach Ramesh Anbazhagan",  phone: "9000000203", role: "coach" }
  ];

  var batches = [
    { id: 1, name: "Sub-Junior AM", sport: "cricket", days: "Mon, Wed, Fri", start_time: "06:00", end_time: "07:30", coach: "Coach Bhaskar Rajendran" },
    { id: 2, name: "Junior PM",     sport: "cricket", days: "Tue, Thu, Sat", start_time: "16:30", end_time: "18:00", coach: "Coach Manoj Selvakumar" },
    { id: 3, name: "Senior AM",     sport: "cricket", days: "Mon to Sat",    start_time: "07:30", end_time: "09:00", coach: "Coach Ramesh Anbazhagan" }
  ];

  /* Bookings deliberately include:
       · a FULL-DAY ground booking at hour 0 — the case the demo's board
         cannot render at all, because it draws hours 6..22 only;
       · paid and unpaid rows, so the collection state is visible;
       · an overridden amount, so the override path shows on screen. */
  var bookings = [
    { id: "B-D001", name: "Kongu Cricket Club",   phone: "9000000301", sport: "ground", court: "G1", date: d(0), hour: 0,  amount: 25000, status: "confirmed", source: "Counter", paid_at: d(0), paid_mode: "upi",  collected_by: "Front desk" },
    { id: "B-D002", name: "Aarav Krishnamurthy",  phone: "9000000101", sport: "nets",   court: "N1", date: d(0), hour: 7,  amount: 500,   status: "confirmed", source: "Counter", paid_at: d(0), paid_mode: "cash", collected_by: "Front desk" },
    { id: "B-D003", name: "Dhruv Sundaravel",     phone: "9000000102", sport: "nets",   court: "N2", date: d(0), hour: 7,  amount: 500,   status: "confirmed", source: "Website", paid_at: null,  paid_mode: null,   collected_by: null },
    { id: "B-D004", name: "Walk-in",              phone: "9000000302", sport: "nets",   court: "N3", date: d(0), hour: 18, amount: 400,   status: "confirmed", source: "Counter", paid_at: d(0), paid_mode: "cash", collected_by: "Front desk" },
    { id: "B-D005", name: "Rithvik Chidambaram",  phone: "9000000106", sport: "nets",   court: "N4", date: d(0), hour: 18, amount: 500,   status: "pending",   source: "Website", paid_at: null,  paid_mode: null,   collected_by: null },
    { id: "B-D006", name: "Coimbatore XI",        phone: "9000000303", sport: "ground", court: "G1", date: d(1), hour: 0,  amount: 10000, status: "confirmed", source: "Counter", paid_at: null,  paid_mode: null,   collected_by: null },
    { id: "B-D007", name: "Sanjay Ponnusamy",     phone: "9000000107", sport: "nets",   court: "N1", date: d(1), hour: 17, amount: 500,   status: "confirmed", source: "Counter", paid_at: d(1), paid_mode: "upi",  collected_by: "Front desk" },
    { id: "B-D008", name: "Yuvan Thirumalai",     phone: "9000000110", sport: "nets",   court: "N2", date: d(2), hour: 6,  amount: 500,   status: "confirmed", source: "Website", paid_at: null,  paid_mode: null,   collected_by: null }
  ];

  var payments = [
    { id: 1, name: "Aarav Krishnamurthy",  type: "Fee", kind: "renewal",   amount: 2500, mode: "upi",  on_date: d(-2) },
    { id: 2, name: "Kavin Rajasekar",      type: "Fee", kind: "renewal",   amount: 3000, mode: "cash", on_date: d(-3) },
    { id: 3, name: "Nivedha Ramanujam",    type: "Fee", kind: "admission", amount: 2500, mode: "upi",  on_date: d(-5) },
    { id: 4, name: "Keerthana Sivaprakash",type: "Fee", kind: "renewal",   amount: 3500, mode: "upi",  on_date: d(-8) },
    { id: 5, name: "Tharun Vaidyanathan",  type: "Fee", kind: "renewal",   amount: 2500, mode: "cash", on_date: d(-11) }
  ];

  /* Shaped like the REAL expenses table — category (not null), payee,
     detail — not like a convenient {name, amount}. A fixture whose shape
     differs from the table is how a page renders perfectly in DEV and
     breaks on the first live read. */
  var expenses = [
    { id: 1, category: "Ground",    payee: "Murugan Turf Care", detail: "Outfield mowing + rolling", amount: 8000,  mode: "upi",  on_date: d(-4) },
    { id: 2, category: "Salaries",  payee: "Coaching staff",    detail: "August coaching fees",      amount: 42000, mode: "bank", on_date: d(-6) },
    { id: 3, category: "Equipment", payee: "SG Sports",         detail: "Leather balls (2 dozen)",   amount: 6500,  mode: "cash", on_date: d(-9) }
  ];

  window.SKA_DEV = {
    members: members,
    coaches: coaches,
    batches: batches,
    bookings: bookings,
    payments: payments,
    expenses: expenses,
    /* Sample only. The live board reads config.courtLabels so app and SQL
       cannot disagree about which net is which. */
    courtLabels: {
      N1: "Astro Net 1", N2: "Astro Net 2",
      N3: "Matting Net 1", N4: "Matting Net 2",
      G1: "Main Ground"
    },
    date: d
  };
})();
