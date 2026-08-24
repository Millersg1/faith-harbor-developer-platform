/**
 * Server-rendered, accessible platform-admin page for the redacted cross-tenant
 * domain SUPPORT QUEUE. Self-contained (inline CSS + vanilla JS, no external
 * assets); talks only to `/platform/admin/api/domain-ops/*`. It shows coarse,
 * redacted rows — never a domain name, price, contact, EPP code, or payment id —
 * and states plainly that support cannot change any customer's domain from here.
 * All client-side string interpolation is XSS-safe (textContent / an esc()
 * helper), inputs are `<label for>`-bound, and the layout never overflows
 * horizontally (the wide table scrolls inside its own container).
 */

export function domainSupportQueuePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Domain Support Queue - All Elite Cloud</title>
<style>
  :root {
    --bg: #0f1420; --panel: #172033; --panel2: #1e293f; --line: #2b3855;
    --ink: #e7ecf6; --muted: #93a1bf; --accent: #6ea8fe; --warn: #f2b45a; --bad: #f2726e; --ok: #6cd08a;
    --focus: #ffd166;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  a { color: var(--accent); }
  header.bar { display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: baseline; padding: 1rem 1.25rem; border-bottom: 1px solid var(--line); background: var(--panel); }
  header.bar h1 { font-size: 1.15rem; margin: 0; }
  header.bar .sub { color: var(--muted); font-size: .85rem; }
  main { max-width: 1100px; margin: 0 auto; padding: 1.25rem; }
  .notice { background: var(--panel2); border: 1px solid var(--line); border-left: 3px solid var(--warn); border-radius: 8px; padding: .75rem 1rem; margin: 0 0 1.25rem; color: var(--muted); }
  section { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 1rem 1.1rem; margin-bottom: 1.25rem; }
  h2 { font-size: 1rem; margin: 0 0 .75rem; }
  .counts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: .6rem; }
  .chip { background: var(--panel2); border: 1px solid var(--line); border-radius: 8px; padding: .55rem .65rem; }
  .chip .n { font-size: 1.35rem; font-weight: 650; font-variant-numeric: tabular-nums; }
  .chip .k { color: var(--muted); font-size: .78rem; word-break: break-word; }
  .controls { display: flex; flex-wrap: wrap; gap: .75rem; align-items: end; margin-bottom: .75rem; }
  label { display: block; font-size: .8rem; color: var(--muted); margin-bottom: .2rem; }
  select, input, textarea, button { font: inherit; color: var(--ink); background: var(--panel2); border: 1px solid var(--line); border-radius: 7px; padding: .45rem .55rem; }
  textarea { width: 100%; min-height: 3.2rem; resize: vertical; }
  button { background: var(--accent); color: #0b1220; border: 0; font-weight: 600; cursor: pointer; }
  button.secondary { background: var(--panel2); color: var(--ink); border: 1px solid var(--line); }
  :focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
  .tablewrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; min-width: 560px; }
  th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
  th { color: var(--muted); font-weight: 600; font-size: .8rem; }
  td.ref { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem; word-break: break-all; }
  tr.row { cursor: pointer; }
  tr.row:hover td, tr.row:focus-within td { background: var(--panel2); }
  .empty { color: var(--muted); padding: .75rem .2rem; }
  .detail dl { display: grid; grid-template-columns: max-content 1fr; gap: .3rem .8rem; margin: 0 0 1rem; }
  .detail dt { color: var(--muted); }
  .detail dd { margin: 0; word-break: break-word; }
  ul.history { list-style: none; margin: 0 0 1rem; padding: 0; }
  ul.history li { border-bottom: 1px solid var(--line); padding: .5rem 0; }
  ul.history .verb { font-weight: 600; }
  ul.history .meta { color: var(--muted); font-size: .8rem; }
  .field { margin-bottom: .7rem; }
  .msg { margin: .5rem 0; padding: .5rem .7rem; border-radius: 7px; display: none; }
  .msg.ok { display: block; background: rgba(108,208,138,.14); border: 1px solid var(--ok); }
  .msg.err { display: block; background: rgba(242,114,110,.14); border: 1px solid var(--bad); }
  .hidden { display: none; }
  @media (max-width: 640px) { main { padding: 1rem .8rem; } .detail dl { grid-template-columns: 1fr; } }
</style>
</head>
<body>
  <header class="bar">
    <h1>Domain Support Queue</h1>
    <span class="sub">Redacted, cross-tenant &mdash; platform staff only</span>
  </header>
  <main>
    <p class="notice" role="note">
      This is a <strong>read-only support surface</strong>. Rows are redacted: no domain names, contacts,
      EPP codes, prices, or payment details are shown. You <strong>cannot</strong> change any customer's
      domain, nameservers, contacts, privacy, consent, or payment from here &mdash; owners keep those rights.
      Support records findings only; every action is logged and requires you to re-enter your password.
    </p>

    <section aria-labelledby="counts-h">
      <h2 id="counts-h">Open items by category</h2>
      <div class="counts" id="counts" aria-live="polite"></div>
    </section>

    <section aria-labelledby="queue-h">
      <h2 id="queue-h">Queue</h2>
      <div class="controls">
        <div>
          <label for="category">Filter by category</label>
          <select id="category">
            <option value="">All categories</option>
          </select>
        </div>
        <button type="button" id="refresh" class="secondary">Refresh</button>
      </div>
      <div class="tablewrap">
        <table>
          <thead><tr><th scope="col">Category</th><th scope="col">Organization</th><th scope="col">Item reference</th><th scope="col">State</th><th scope="col">Since</th></tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
      <p class="empty hidden" id="empty">Nothing needs attention right now.</p>
    </section>

    <section aria-labelledby="detail-h" id="detail" class="detail hidden">
      <h2 id="detail-h">Item detail</h2>
      <dl id="detail-fields"></dl>
      <h3 style="font-size:.9rem;">Action history (append-only)</h3>
      <ul class="history" id="history"></ul>

      <form id="action-form" aria-labelledby="action-h">
        <h3 id="action-h" style="font-size:.9rem;">Record a support action</h3>
        <div class="field">
          <label for="action">Action</label>
          <select id="action">
            <option value="acknowledge">Acknowledge (I am looking into this)</option>
            <option value="record_reconciliation">Record read-only reconciliation finding</option>
            <option value="escalate">Escalate</option>
            <option value="mark_resolved">Mark resolved (requires a prior reconciliation)</option>
          </select>
        </div>
        <div class="field">
          <label for="note">Finding / note</label>
          <textarea id="note" placeholder="What did the read-only reconciliation show? Required for reconciliation and escalation."></textarea>
        </div>
        <div class="field">
          <label for="evidence">Evidence (required to resolve)</label>
          <textarea id="evidence" placeholder="Evidence of the confirmed outcome. Required to mark resolved."></textarea>
        </div>
        <div class="field">
          <label for="reauthEmail">Your admin email (re-enter to confirm)</label>
          <input id="reauthEmail" type="email" autocomplete="off"/>
        </div>
        <div class="field">
          <label for="reauthPassword">Your admin password</label>
          <input id="reauthPassword" type="password" autocomplete="off"/>
        </div>
        <div class="msg" id="action-msg" role="status" aria-live="polite"></div>
        <button type="submit">Record action</button>
      </form>
    </section>
  </main>
<script>
(function () {
  var API = "/platform/admin/api/domain-ops";
  var esc = function (s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };
  var selected = null;

  function getJson(url) { return fetch(url, { credentials: "include" }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); }); }

  function loadCounts() {
    getJson(API + "/queue/counts").then(function (r) {
      var el = document.getElementById("counts");
      el.innerHTML = "";
      var counts = (r.body && r.body.counts) || {};
      var sel = document.getElementById("category");
      var have = sel.options.length > 1;
      Object.keys(counts).forEach(function (k) {
        var chip = document.createElement("div");
        chip.className = "chip";
        chip.innerHTML = '<div class="n">' + esc(counts[k]) + '</div><div class="k">' + esc(k.replace(/_/g, " ")) + "</div>";
        el.appendChild(chip);
        if (!have) { var o = document.createElement("option"); o.value = k; o.textContent = k.replace(/_/g, " "); sel.appendChild(o); }
      });
    });
  }

  function loadQueue() {
    var cat = document.getElementById("category").value;
    var url = API + "/queue" + (cat ? "?category=" + encodeURIComponent(cat) : "");
    getJson(url).then(function (r) {
      var tb = document.getElementById("rows"); tb.innerHTML = "";
      var items = (r.body && r.body.items) || [];
      document.getElementById("empty").classList.toggle("hidden", items.length > 0);
      items.forEach(function (it) {
        var tr = document.createElement("tr"); tr.className = "row"; tr.tabIndex = 0; tr.setAttribute("role", "button");
        tr.innerHTML = "<td>" + esc(it.category.replace(/_/g, " ")) + "</td><td>" + esc(it.organizationId) + '</td><td class="ref">' + esc(it.itemRef) + "</td><td>" + esc(it.state) + "</td><td>" + esc(it.since || "-") + "</td>";
        var open = function () { openDetail(it); };
        tr.addEventListener("click", open);
        tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
        tb.appendChild(tr);
      });
    });
  }

  function openDetail(it) {
    selected = it;
    getJson(API + "/queue/" + encodeURIComponent(it.category) + "/" + encodeURIComponent(it.itemRef)).then(function (r) {
      var d = document.getElementById("detail"); d.classList.remove("hidden");
      var fields = document.getElementById("detail-fields");
      var item = (r.body && r.body.item) || it;
      fields.innerHTML =
        "<dt>Category</dt><dd>" + esc(item.category.replace(/_/g, " ")) + "</dd>" +
        "<dt>Organization</dt><dd>" + esc(item.organizationId) + "</dd>" +
        '<dt>Item reference</dt><dd class="ref">' + esc(item.itemRef) + "</dd>" +
        "<dt>State</dt><dd>" + esc(item.state) + "</dd>" +
        "<dt>Since</dt><dd>" + esc(item.since || "-") + "</dd>";
      var hist = document.getElementById("history"); hist.innerHTML = "";
      var actions = (r.body && r.body.actions) || [];
      if (!actions.length) { var li = document.createElement("li"); li.className = "meta"; li.textContent = "No actions recorded yet."; hist.appendChild(li); }
      actions.forEach(function (a) {
        var li = document.createElement("li");
        li.innerHTML = '<span class="verb">' + esc(a.action.replace(/_/g, " ")) + '</span> <span class="meta">' + esc(a.createdAt) + " &middot; admin " + esc(a.adminId) + "</span>" +
          (a.note ? "<div>" + esc(a.note) + "</div>" : "") + (a.evidence ? "<div><em>evidence:</em> " + esc(a.evidence) + "</div>" : "");
        hist.appendChild(li);
      });
      document.getElementById("detail").scrollIntoView({ block: "nearest" });
    });
  }

  document.getElementById("action-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = document.getElementById("action-msg"); msg.className = "msg"; msg.textContent = "";
    if (!selected) { msg.className = "msg err"; msg.textContent = "Select an item first."; return; }
    var payload = {
      action: document.getElementById("action").value,
      note: document.getElementById("note").value,
      evidence: document.getElementById("evidence").value,
      reauthEmail: document.getElementById("reauthEmail").value,
      reauthPassword: document.getElementById("reauthPassword").value
    };
    fetch(API + "/queue/" + encodeURIComponent(selected.category) + "/" + encodeURIComponent(selected.itemRef) + "/actions",
      { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (r) {
        if (r.ok) {
          msg.className = "msg ok"; msg.textContent = "Action recorded.";
          document.getElementById("note").value = ""; document.getElementById("evidence").value = "";
          document.getElementById("reauthPassword").value = "";
          openDetail(selected); loadCounts(); loadQueue();
        } else {
          msg.className = "msg err"; msg.textContent = (r.body && r.body.error && r.body.error.message) || "Could not record action.";
        }
      })
      .catch(function () { msg.className = "msg err"; msg.textContent = "Network error."; });
  });

  document.getElementById("refresh").addEventListener("click", function () { loadCounts(); loadQueue(); });
  document.getElementById("category").addEventListener("change", loadQueue);
  loadCounts(); loadQueue();
})();
</script>
</body>
</html>`;
}
