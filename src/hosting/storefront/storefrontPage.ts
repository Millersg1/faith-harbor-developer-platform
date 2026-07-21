/**
 * Renders the public hosting storefront: a self-contained page (inline
 * CSS + JS, no build step) that lists active plans from the public API
 * and submits a signup. Brand is read from the ?brand= (brand id) and
 * ?name= (display name) query parameters, so one page serves every
 * hosting brand.
 */
export function renderStorefrontPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Web Hosting Plans</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    background: #0b0b0f; color: #f4f4f6; line-height: 1.5; }
  header { text-align: center; padding: 56px 20px 12px; }
  header h1 { font-size: 2.2rem; margin: 0 0 6px; }
  header p { color: #a9a9b6; margin: 0; }
  .cycle { display: flex; gap: 8px; justify-content: center; margin: 22px 0 8px; }
  .cycle button { background: #17171f; color: #c9c9d4; border: 1px solid #24242e;
    padding: 8px 18px; border-radius: 999px; cursor: pointer; font-size: .95rem; }
  .cycle button.active { background: #e5342a; color: #fff; border-color: #e5342a; }
  .grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    max-width: 1120px; margin: 24px auto 60px; padding: 0 20px; }
  .plan { background: #121218; border: 1px solid #23232d; border-radius: 16px; padding: 26px; position: relative; }
  .plan.popular { border-color: #e5342a; box-shadow: 0 0 0 1px #e5342a inset; }
  .badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
    background: #e5342a; color: #fff; font-size: .72rem; padding: 4px 12px; border-radius: 999px; }
  .plan h3 { margin: 0 0 4px; font-size: 1.3rem; }
  .plan .desc { color: #9a9aa6; font-size: .9rem; min-height: 40px; }
  .price { font-size: 2rem; font-weight: 700; margin: 10px 0 2px; }
  .price span { font-size: .95rem; color: #9a9aa6; font-weight: 400; }
  .plan ul { list-style: none; padding: 0; margin: 16px 0; font-size: .9rem; }
  .plan li { padding: 4px 0; color: #d4d4de; }
  .plan li::before { content: "✓"; color: #e5342a; font-weight: 700; margin-right: 8px; }
  .btn { display: block; width: 100%; text-align: center; background: #1d1d27; color: #fff;
    border: none; padding: 12px; border-radius: 10px; cursor: pointer; font-size: 1rem; }
  .plan.popular .btn { background: #e5342a; }
  .btn:hover { filter: brightness(1.1); }
  dialog { background: #121218; color: #f4f4f6; border: 1px solid #2a2a35; border-radius: 16px;
    padding: 28px; max-width: 440px; width: 92%; }
  dialog::backdrop { background: rgba(0,0,0,.6); }
  label { display: block; font-size: .85rem; margin: 12px 0 4px; color: #c9c9d4; }
  input { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #2a2a35;
    background: #0e0e13; color: #fff; font-size: 1rem; }
  .row { display: flex; gap: 10px; }
  .row > div { flex: 1; }
  .actions { display: flex; gap: 10px; margin-top: 20px; }
  .actions .primary { flex: 1; background: #e5342a; }
  .actions .ghost { background: #1d1d27; }
  .msg { margin-top: 14px; font-size: .9rem; }
  .msg.ok { color: #34d399; } .msg.err { color: #f87171; }
  footer { text-align: center; color: #6b6b78; padding: 30px; font-size: .8rem; }
</style>
</head>
<body>
<header>
  <h1 id="brandTitle">Web Hosting Plans</h1>
  <p>Choose the perfect plan for your website. Free SSL, cPanel, and free migration on every plan.</p>
  <div class="cycle">
    <button id="cyMonthly" class="active" type="button">Monthly</button>
    <button id="cyYearly" type="button">Yearly &mdash; save 20%</button>
  </div>
</header>

<main class="grid" id="grid">Loading plans&hellip;</main>

<dialog id="signup">
  <h3 id="dlgTitle">Get started</h3>
  <form id="form" method="dialog">
    <label>Your domain</label>
    <input name="domain" placeholder="yoursite.com" required />
    <div class="row">
      <div><label>First name</label><input name="firstName" /></div>
      <div><label>Last name</label><input name="lastName" /></div>
    </div>
    <label>Email</label>
    <input name="email" type="email" placeholder="you@yoursite.com" required />
    <div class="msg" id="msg"></div>
    <div class="actions">
      <button class="primary" id="submitBtn" type="submit">Continue</button>
      <button class="ghost" id="cancelBtn" type="button" value="cancel">Cancel</button>
    </div>
  </form>
</dialog>

<footer id="foot"></footer>

<script src="/store.js"></script>
</body>
</html>`;
}

/**
 * The storefront's client script, served as an external file at
 * /store.js. It must be external (not inline) because the app's
 * Content-Security-Policy allows scripts only from 'self' — inline
 * scripts are blocked.
 */
export function storefrontScript(): string {
  return `(function () {
  var params = new URLSearchParams(location.search);
  var brandId = params.get("brand") || "";
  var brandName = params.get("name") || "";
  var cycle = "monthly";
  var selected = null;

  if (brandName) {
    document.getElementById("brandTitle").textContent = brandName + " — Web Hosting";
    document.title = brandName + " — Web Hosting Plans";
  }
  document.getElementById("foot").textContent = brandName || "";

  function money(cents) { return "$" + (cents / 100).toFixed(2); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(n) { return Number(n) || 0; }

  function render(plans) {
    var grid = document.getElementById("grid");
    if (!plans.length) { grid.textContent = "No plans are available right now."; return; }
    grid.innerHTML = "";
    plans.forEach(function (p) {
      var price = cycle === "yearly" ? num(p.priceYearlyCents) : num(p.priceMonthlyCents);
      var per = cycle === "yearly" ? "/yr" : "/mo";
      var specs = p.specs || {};
      var el = document.createElement("div");
      el.className = "plan" + (p.popular ? " popular" : "");
      var feats = (p.features || []).map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("");
      el.innerHTML =
        (p.popular ? '<div class="badge">Most Popular</div>' : "") +
        "<h3>" + esc(p.name) + "</h3>" +
        '<div class="desc">' + esc(p.description || "") + "</div>" +
        '<div class="price">' + money(price) + '<span>' + per + '</span></div>' +
        "<ul>" +
        "<li>" + Math.round(num(specs.storageMb) / 1024) + " GB NVMe storage</li>" +
        "<li>" + num(specs.bandwidthGb) + " GB bandwidth</li>" +
        "<li>" + (num(specs.websites) < 0 ? "Unlimited" : num(specs.websites)) + " website(s)</li>" +
        "<li>" + num(specs.emailAccounts) + " email accounts</li>" +
        feats +
        "</ul>" +
        '<button class="btn" type="button">Get Started</button>';
      el.querySelector("button").addEventListener("click", function () { openSignup(p); });
      grid.appendChild(el);
    });
  }

  function openSignup(plan) {
    selected = plan;
    document.getElementById("dlgTitle").textContent = "Get started — " + plan.name;
    document.getElementById("msg").textContent = "";
    document.getElementById("signup").showModal();
  }

  function load() {
    fetch("/api/public/hosting/plans?kind=shared")
      .then(function (r) { return r.json(); })
      .then(function (d) { render(d.plans || []); })
      .catch(function () { document.getElementById("grid").textContent = "Could not load plans."; });
  }

  document.getElementById("cyMonthly").addEventListener("click", function () {
    cycle = "monthly"; this.classList.add("active");
    document.getElementById("cyYearly").classList.remove("active"); load();
  });
  document.getElementById("cyYearly").addEventListener("click", function () {
    cycle = "yearly"; this.classList.add("active");
    document.getElementById("cyMonthly").classList.remove("active"); load();
  });
  document.getElementById("cancelBtn").addEventListener("click", function () {
    document.getElementById("signup").close();
  });

  document.getElementById("form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, msg = document.getElementById("msg"), btn = document.getElementById("submitBtn");
    msg.className = "msg"; msg.textContent = "Submitting…"; btn.disabled = true;
    fetch("/api/public/hosting/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planSlug: selected.slug,
        domain: f.domain.value.trim(),
        firstName: f.firstName.value.trim(),
        lastName: f.lastName.value.trim(),
        email: f.email.value.trim(),
        brandId: brandId || undefined,
        billingCycle: cycle
      })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok) { msg.className = "msg err"; msg.textContent = (res.d.error && res.d.error.message) || "Something went wrong."; return; }
        if (res.d.checkoutUrl) { window.location = res.d.checkoutUrl; return; }
        msg.className = "msg ok"; msg.textContent = res.d.message || "Order received!";
      })
      .catch(function () { btn.disabled = false; msg.className = "msg err"; msg.textContent = "Network error."; });
  });

  load();
})();`;
}
