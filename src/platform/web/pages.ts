/**
 * Self-contained HTML for the All Elite Cloud web UI.
 *
 * These pages are served directly by the platform Express app and talk to
 * the same JSON API over fetch. They have no build step and no external
 * assets, so they deploy with the server. Data is rendered client-side
 * with textContent (never innerHTML from API data), so tenant data can't
 * inject markup.
 */

import { landingHtml } from "./landing";

const STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --accent: #2dd4bf;
    --bg: #0b1220;
    --surface: #131f33;
    --surface-2: #172740;
    --border: rgba(255,255,255,0.09);
    --text: #e6edf5;
    --muted: #9fb0c3;
    --danger: #f26d6d;
    --ok: #4ade80;
    --radius: 14px;
  }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--text);
    background:
      radial-gradient(1100px 500px at 15% -10%, rgba(45,212,191,0.10), transparent 60%),
      radial-gradient(900px 500px at 110% 10%, rgba(99,102,241,0.10), transparent 55%),
      var(--bg);
    min-height: 100vh;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--accent); text-decoration: none; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; letter-spacing: -0.01em; }
  .logo {
    width: 30px; height: 30px; border-radius: 9px; flex: none;
    background: linear-gradient(135deg, var(--accent), #6366f1);
    box-shadow: 0 6px 18px rgba(45,212,191,0.35);
  }
  .muted { color: var(--muted); }
  .wrap { width: 100%; max-width: 1000px; margin: 0 auto; padding: 22px; }

  /* Centered auth cards */
  .center { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
  .card {
    width: 100%; max-width: 420px;
    background: linear-gradient(180deg, var(--surface-2), var(--surface));
    border: 1px solid var(--border); border-radius: 20px;
    padding: 34px; box-shadow: 0 30px 60px rgba(0,0,0,0.45);
  }
  .card h1 { font-size: 1.5rem; margin: 18px 0 4px; letter-spacing: -0.02em; }
  .card .sub { color: var(--muted); font-size: 0.9rem; margin-bottom: 22px; }
  label { display: block; font-size: 0.74rem; font-weight: 700; letter-spacing: 0.03em;
    text-transform: uppercase; color: var(--muted); margin: 14px 0 6px; }
  input, select {
    width: 100%; padding: 12px 14px; font-size: 0.95rem;
    color: var(--text); background: rgba(0,0,0,0.25);
    border: 1px solid var(--border); border-radius: 11px; outline: none;
  }
  select { appearance: none; }
  input:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,212,191,0.18); }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; margin-top: 20px; padding: 12px 16px; font-size: 0.95rem; font-weight: 700;
    color: #06231f; background: var(--accent); border: 0; border-radius: 11px; cursor: pointer;
  }
  .btn:hover { filter: brightness(1.06); }
  .btn.sec { background: transparent; color: var(--text); border: 1px solid var(--border); }
  .btn.ghost { width: auto; margin: 0; padding: 8px 14px; background: rgba(255,255,255,0.06); color: var(--text); }
  .row { display: flex; gap: 10px; }
  .alt { margin-top: 18px; font-size: 0.88rem; color: var(--muted); text-align: center; }
  .msg { min-height: 1.2em; margin-top: 14px; font-size: 0.86rem; font-weight: 600; }
  .msg.err { color: var(--danger); }
  .msg.ok { color: var(--ok); }

  /* App shell */
  .topbar { border-bottom: 1px solid var(--border); background: rgba(11,18,32,0.7); backdrop-filter: blur(8px); position: sticky; top: 0; }
  .topbar .wrap { display: flex; align-items: center; justify-content: space-between; padding-top: 14px; padding-bottom: 14px; }
  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; margin-top: 18px; }
  .panel h2 { font-size: 1.05rem; margin-bottom: 4px; }
  .panel .hint { color: var(--muted); font-size: 0.85rem; margin-bottom: 16px; }
  .list { display: flex; flex-direction: column; gap: 8px; }
  .item { display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 12px 14px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 11px; font-size: 0.92rem; }
  .item .sub { color: var(--muted); font-size: 0.8rem; }
  .empty { color: var(--muted); font-size: 0.9rem; padding: 8px 0; }
  .inline { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; margin-top: 14px; }
  .inline .f { flex: 1; min-width: 160px; }
  .inline label { margin-top: 0; }
  .pill { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 3px 9px; border-radius: 999px; background: rgba(45,212,191,0.16); color: var(--accent); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  @media (max-width: 720px) { .grid2 { grid-template-columns: 1fr; } }
  .secnav { position: sticky; top: 0; z-index: 20; display: flex; gap: 8px; overflow-x: auto;
    padding: 10px; margin-bottom: 16px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 11px; }
  .secnav a { white-space: nowrap; font-size: 0.78rem; color: var(--muted); text-decoration: none;
    padding: 5px 11px; border: 1px solid var(--border); border-radius: 999px; }
  .secnav a:hover { color: var(--text); border-color: var(--accent); }
  [id^="sec_"] { scroll-margin-top: 64px; }
  .dns { margin-top: 10px; padding: 12px 14px; background: var(--surface); border: 1px dashed var(--border); border-radius: 10px; }
  .dns .hint { margin-bottom: 10px; }
  .dns .rec { display: flex; flex-direction: column; gap: 8px; }
  .dns .rec > div { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .dns .k { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); min-width: 42px; }
  .dns code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.82rem; color: var(--text);
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px; word-break: break-all; }
`;

function layout(opts: {
  title: string;
  body: string;
  script?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${opts.title}</title>
<style>${STYLES}</style>
</head>
<body>
${opts.body}
${opts.script ? `<script>${opts.script}</script>` : ""}
</body>
</html>`;
}

const LOGO = `<span class="logo"></span>`;

/**
 * The public marketing homepage (generated from the AllEliteCloud design
 * file into ./landing). The auth pages below stay lightweight and are
 * served at /login, /signup, /app.
 */
export function landingPage(): string {
  return landingHtml;
}

export function loginPage(): string {
  const body = `
  <div class="center"><form class="card" id="f">
    <div class="brand">${LOGO} All Elite Cloud</div>
    <h1>Sign in</h1>
    <p class="sub">Access your organization's workspace.</p>
    <label for="org">Organization</label>
    <input id="org" placeholder="your-organization" autocomplete="organization" required />
    <label for="email">Email</label>
    <input id="email" type="email" autocomplete="email" required />
    <label for="password">Password</label>
    <input id="password" type="password" autocomplete="current-password" required />
    <div class="msg" id="msg"></div>
    <button class="btn" type="submit">Sign in</button>
    <div class="alt">New here? <a href="/signup">Create an organization</a></div>
  </form></div>`;
  const script = `
  var f=document.getElementById('f'),msg=document.getElementById('msg');
  f.addEventListener('submit',async function(e){
    e.preventDefault(); msg.className='msg'; msg.textContent='Signing in…';
    try{
      var r=await fetch('/auth/login',{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json','X-Org-Slug':org.value.trim()},
        body:JSON.stringify({email:email.value.trim(),password:password.value})});
      var d=await r.json().catch(function(){return {};});
      if(r.ok){window.location='/app';}
      else{msg.className='msg err';msg.textContent=(d.error&&d.error.message)||'Sign in failed.';}
    }catch(_){msg.className='msg err';msg.textContent='Network error.';}
  });`;
  return layout({
    title: "Sign in · All Elite Cloud",
    body,
    script,
  });
}

export function signupPage(): string {
  const body = `
  <div class="center"><form class="card" id="f">
    <div class="brand">${LOGO} All Elite Cloud</div>
    <h1>Create your organization</h1>
    <p class="sub">You'll be the owner. It takes a few seconds.</p>
    <label for="org">Organization name</label>
    <input id="org" placeholder="Acme Inc" required />
    <label for="name">Your name</label>
    <input id="name" autocomplete="name" />
    <label for="email">Email</label>
    <input id="email" type="email" autocomplete="email" required />
    <label for="password">Password</label>
    <input id="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" required />
    <div class="msg" id="msg"></div>
    <button class="btn" type="submit">Create organization</button>
    <div class="alt">Already have one? <a href="/login">Sign in</a></div>
  </form></div>`;
  const script = `
  var f=document.getElementById('f'),msg=document.getElementById('msg');
  f.addEventListener('submit',async function(e){
    e.preventDefault(); msg.className='msg'; msg.textContent='Creating…';
    try{
      var r=await fetch('/auth/signup',{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({organizationName:org.value.trim(),name:name.value.trim(),
          email:email.value.trim(),password:password.value})});
      var d=await r.json().catch(function(){return {};});
      if(r.ok){window.location='/app';}
      else{msg.className='msg err';msg.textContent=(d.error&&d.error.message)||'Could not create organization.';}
    }catch(_){msg.className='msg err';msg.textContent='Network error.';}
  });`;
  return layout({
    title: "Create organization · All Elite Cloud",
    body,
    script,
  });
}

export function dashboardPage(): string {
  const body = `
  <div class="topbar"><div class="wrap">
    <div class="brand">${LOGO} <span id="orgName">All Elite Cloud</span></div>
    <div class="row" style="align-items:center; gap:14px;">
      <span class="muted" id="who" style="font-size:0.85rem;"></span>
      <button class="btn ghost" id="logout">Sign out</button>
    </div>
  </div></div>
  <div class="wrap">
    <div class="secnav" id="secnav"></div>
    <div class="panel" id="billingPanel" style="margin-bottom:18px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;">
        <div>
          <h2 style="margin-bottom:4px;">Plan <span class="pill" id="planStatus"></span></h2>
          <p class="hint" id="planSummary" style="margin-bottom:0;">Loading…</p>
        </div>
        <div id="planPickerWrap" style="display:none;gap:10px;align-items:flex-end;">
          <div class="f"><label for="planPicker">Change plan</label><select id="planPicker"></select></div>
          <button class="btn" id="changePlan" style="width:auto;">Update</button>
        </div>
      </div>
      <div class="msg" id="plmsg"></div>
    </div>
    <div class="grid2">
      <div class="panel">
        <h2>Clients</h2>
        <p class="hint">People and companies in your organization.</p>
        <div class="list" id="clients"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="cname">Name</label><input id="cname" placeholder="New client" /></div>
          <div class="f"><label for="cemail">Email (optional)</label><input id="cemail" type="email" /></div>
          <button class="btn" id="addClient" style="width:auto;">Add</button>
        </div>
        <div class="msg" id="cmsg"></div>
      </div>
      <div class="panel">
        <h2>Projects</h2>
        <p class="hint">Work you're delivering, optionally linked to a client.</p>
        <div class="list" id="projects"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="pname">Name</label><input id="pname" placeholder="New project" /></div>
          <div class="f"><label for="pclient">Client (optional)</label><select id="pclient" class="client-select"></select></div>
          <button class="btn" id="addProject" style="width:auto;">Add</button>
        </div>
        <div class="msg" id="pmsg"></div>
      </div>
      <div class="panel">
        <h2>Invoices</h2>
        <p class="hint">Bill a client. Numbered per organization.</p>
        <div class="list" id="invoices"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="iclient">Client</label><select id="iclient" class="client-select"></select></div>
          <div class="f"><label for="idesc">Description</label><input id="idesc" placeholder="Consulting" /></div>
          <div class="f" style="max-width:80px;"><label for="iqty">Qty</label><input id="iqty" type="number" value="1" min="1" /></div>
          <div class="f" style="max-width:110px;"><label for="iprice">Unit price</label><input id="iprice" type="number" value="0" min="0" step="0.01" /></div>
          <button class="btn" id="addInvoice" style="width:auto;">Add</button>
        </div>
        <div class="msg" id="imsg"></div>
      </div>
      <div class="panel">
        <h2>AI Website Builder <span class="pill">AI</span></h2>
        <p class="hint">Describe a business and generate a complete site. Build for yourself or for your clients on their own domains.</p>
        <div class="list" id="websites"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="wname">Site name</label><input id="wname" placeholder="Acme Bakery" /></div>
          <div class="f"><label for="wclient">Client (optional)</label><select id="wclient" class="client-select"></select></div>
        </div>
        <div class="f"><label for="wbrief">Describe the business</label><input id="wbrief" placeholder="A family bakery in Miami known for Cuban pastries and custom cakes." /></div>
        <button class="btn" id="addWebsite" style="width:auto;margin-top:12px;">Create site</button>
        <div class="msg" id="wmsg"></div>
      </div>
      <div class="panel">
        <h2>Hosting accounts <span class="pill">All Elite Hosting</span></h2>
        <p class="hint">Hosted sites in your organization. New accounts start pending until provisioned.</p>
        <div class="list" id="hosting"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="hdomain">Domain</label><input id="hdomain" placeholder="yoursite.com" /></div>
          <div class="f"><label for="hclient">Client (optional)</label><select id="hclient" class="client-select"></select></div>
          <button class="btn" id="addHosting" style="width:auto;">Add account</button>
        </div>
        <div class="msg" id="hmsg"></div>
      </div>
      <div class="panel">
        <h2>Support tickets</h2>
        <p class="hint">Track support requests for your organization.</p>
        <div class="list" id="tickets"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="tsubject">Subject</label><input id="tsubject" placeholder="Site is down" /></div>
          <div class="f"><label for="tclient">Client (optional)</label><select id="tclient" class="client-select"></select></div>
          <div class="f" style="max-width:120px;"><label for="tpriority">Priority</label><select id="tpriority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
          <button class="btn" id="addTicket" style="width:auto;">Add ticket</button>
        </div>
        <div class="msg" id="tmsg"></div>
      </div>
      <div class="panel">
        <h2>Sales pipeline <span class="pill">CRM</span></h2>
        <p class="hint">Track leads from new to won. Change a lead's stage from the dropdown.</p>
        <div class="list" id="leads"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="lname">Name</label><input id="lname" placeholder="Jane Doe" /></div>
          <div class="f"><label for="lcompany">Company</label><input id="lcompany" placeholder="Acme Co" /></div>
          <div class="f" style="max-width:120px;"><label for="lvalue">Est. value $</label><input id="lvalue" type="number" min="0" placeholder="5000" /></div>
          <div class="f" style="max-width:130px;"><label for="lstatus">Stage</label><select id="lstatus"><option value="new" selected>New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="proposal">Proposal</option><option value="won">Won</option><option value="lost">Lost</option></select></div>
          <button class="btn" id="addLead" style="width:auto;">Add lead</button>
        </div>
        <div class="msg" id="lmsg"></div>
      </div>
      <div class="panel">
        <h2>Proposals</h2>
        <p class="hint">Quotes from lead to accepted. Change stage from the dropdown.</p>
        <div class="list" id="proposals"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="prtitle">Title</label><input id="prtitle" placeholder="Website redesign" /></div>
          <div class="f"><label for="prclient">Client (optional)</label><select id="prclient" class="client-select"></select></div>
          <div class="f" style="max-width:120px;"><label for="pramount">Amount $</label><input id="pramount" type="number" min="0" placeholder="2500" /></div>
          <button class="btn" id="addProposal" style="width:auto;">Add proposal</button>
        </div>
        <div class="msg" id="prmsg"></div>
      </div>
      <div class="panel">
        <h2>Marketing campaigns</h2>
        <p class="hint">Plan and track campaigns. Change stage from the dropdown.</p>
        <div class="list" id="campaigns"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="mname">Name</label><input id="mname" placeholder="Spring promo" /></div>
          <div class="f"><label for="mchannel">Channel</label><input id="mchannel" placeholder="Email" /></div>
          <div class="f" style="max-width:120px;"><label for="mbudget">Budget $</label><input id="mbudget" type="number" min="0" placeholder="1000" /></div>
          <button class="btn" id="addCampaign" style="width:auto;">Add campaign</button>
        </div>
        <div class="msg" id="mmsg"></div>
      </div>
      <div class="panel">
        <h2>Reviews</h2>
        <p class="hint">Track customer reviews and your reputation.</p>
        <div class="list" id="reviews"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="rauthor">Author</label><input id="rauthor" placeholder="Happy Customer" /></div>
          <div class="f" style="max-width:90px;"><label for="rrating">Rating</label><select id="rrating"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></div>
          <div class="f"><label for="rsource">Source</label><input id="rsource" placeholder="Google" /></div>
          <div class="f"><label for="rcomment">Comment</label><input id="rcomment" placeholder="Great service!" /></div>
          <button class="btn" id="addReview" style="width:auto;">Add review</button>
        </div>
        <div class="msg" id="rmsg"></div>
      </div>
      <div class="panel">
        <h2>Products</h2>
        <p class="hint">Software products / repositories.</p>
        <div class="list" id="products"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="pdname">Name</label><input id="pdname" placeholder="My App" /></div>
          <div class="f"><label for="pdlang">Language</label><input id="pdlang" placeholder="TypeScript" /></div>
          <button class="btn" id="addProduct" style="width:auto;">Add product</button>
        </div>
        <div class="msg" id="pdmsg"></div>
      </div>
      <div class="panel">
        <h2>Books <span class="pill">Publishing</span></h2>
        <p class="hint">Titles in your publishing pipeline.</p>
        <div class="list" id="books"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="bktitle">Title</label><input id="bktitle" placeholder="My Book" /></div>
          <div class="f"><label for="bkauthor">Author</label><input id="bkauthor" placeholder="Author name" /></div>
          <button class="btn" id="addBook" style="width:auto;">Add book</button>
        </div>
        <div class="msg" id="bkmsg"></div>
      </div>
      <div class="panel">
        <h2>Programs <span class="pill">Ministry</span></h2>
        <p class="hint">Programs, classes, and recurring events.</p>
        <div class="list" id="programs"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="pgname">Name</label><input id="pgname" placeholder="Youth Group" /></div>
          <div class="f"><label for="pgleader">Leader</label><input id="pgleader" placeholder="Leader name" /></div>
          <button class="btn" id="addProgram" style="width:auto;">Add program</button>
        </div>
        <div class="msg" id="pgmsg"></div>
      </div>
      <div class="panel" id="brandsPanel" style="display:none;">
        <h2>Brands <span class="pill">owner/admin</span></h2>
        <p class="hint">Run several brands under one workspace, each with its own domain and email voice.</p>
        <div class="list" id="brands"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="bnname">Name</label><input id="bnname" placeholder="All Elite Hosting" /></div>
          <div class="f"><label for="bndomain">Domain</label><input id="bndomain" placeholder="allelitehosting.com" /></div>
          <div class="f"><label for="bnemail">From email</label><input id="bnemail" placeholder="hello@allelitehosting.com" /></div>
          <button class="btn" id="addBrand" style="width:auto;">Add brand</button>
        </div>
        <div class="msg" id="bnmsg"></div>
      </div>
      <div class="panel" id="teamPanel" style="display:none;">
        <h2>Team <span class="pill">owner/admin</span></h2>
        <p class="hint">Invite teammates. Seats are limited by your plan; owners manage roles.</p>
        <div class="list" id="team"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="tmemail">Email</label><input id="tmemail" type="email" placeholder="teammate@company.com" /></div>
          <div class="f"><label for="tmname">Name</label><input id="tmname" placeholder="Jane" /></div>
          <div class="f" style="max-width:120px;"><label for="tmrole">Role</label><select id="tmrole"><option value="member" selected>Member</option><option value="admin">Admin</option><option value="owner">Owner</option></select></div>
          <div class="f" style="max-width:150px;"><label for="tmpass">Temp password</label><input id="tmpass" type="text" placeholder="8+ chars" /></div>
          <button class="btn" id="addMember" style="width:auto;">Invite</button>
        </div>
        <div class="msg" id="tmmsg"></div>
      </div>
      <div class="panel" id="portalPanel" style="display:none;">
        <h2>Client portal logins <span class="pill">owner/admin</span></h2>
        <p class="hint">Give a client a login to your client portal (at <strong>/portal</strong>) to see their projects, invoices, tickets, and proposals.</p>
        <div class="list" id="portalUsers"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="puclient">Client</label><select id="puclient" class="client-select"></select></div>
          <div class="f"><label for="puemail">Email</label><input id="puemail" type="email" placeholder="client@company.com" /></div>
          <div class="f" style="max-width:150px;"><label for="pupass">Temp password</label><input id="pupass" type="text" placeholder="8+ chars" /></div>
          <button class="btn" id="addPortalUser" style="width:auto;">Create login</button>
        </div>
        <div class="msg" id="pumsg"></div>
      </div>
      <div class="panel">
        <h2>Account</h2>
        <p class="hint">Change your password.</p>
        <label for="cpcur">Current password</label>
        <input id="cpcur" type="password" autocomplete="current-password" />
        <label for="cpnew">New password</label>
        <input id="cpnew" type="password" autocomplete="new-password" placeholder="At least 8 characters" />
        <button class="btn" id="changePw" style="width:auto;margin-top:12px;">Change password</button>
        <div class="msg" id="cpmsg"></div>
      </div>
      <div class="panel" id="aiPanel" style="display:none;">
        <h2>AI settings <span class="pill">owner</span></h2>
        <p class="hint">Use your own AI key so generation runs on your account. Without one, the platform's included AI is used.</p>
        <div class="hint" id="aiCurrent">Loading…</div>
        <div class="hint" id="aiUsage"></div>
        <label for="aiProvider">Provider</label>
        <select id="aiProvider"><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option></select>
        <label for="aiKey">API key</label>
        <input id="aiKey" placeholder="sk-…" autocomplete="off" />
        <label for="aiModel">Model (optional)</label>
        <input id="aiModel" placeholder="gpt-4o-mini" />
        <div class="inline">
          <button class="btn" id="saveAi" style="width:auto;">Save key</button>
          <button class="btn ghost" id="removeAi" style="width:auto;">Use platform AI</button>
        </div>
        <div class="msg" id="aimsg"></div>
      </div>
      <div class="panel" id="brandPanel" style="display:none;">
        <h2>Branding <span class="pill">owner/admin</span></h2>
        <p class="hint">White-label your workspace. Changes are live instantly.</p>
        <label for="bname">Display name</label>
        <input id="bname" placeholder="Your organization" />
        <label for="bcolor">Primary color</label>
        <input id="bcolor" placeholder="#2dd4bf" />
        <button class="btn" id="saveBrand">Save branding</button>
        <div class="msg" id="bmsg"></div>
      </div>
      <div class="panel" id="domainPanel" style="display:none;">
        <h2>Custom domain <span class="pill">owner/admin</span></h2>
        <p class="hint">White-label: run your workspace on your own domain.</p>
        <div class="list" id="domains"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="dname">Domain</label><input id="dname" placeholder="cloud.yourbrand.com" /></div>
          <button class="btn" id="addDomain" style="width:auto;">Add</button>
        </div>
        <div class="msg" id="dmsg"></div>
        <p class="hint" style="margin-top:12px">Point your domain (A/CNAME record) at the platform; once it resolves, your workspace loads there and SSL is issued automatically.</p>
      </div>
    </div>
  </div>`;
  const script = `
  var slug='', clientsCache=[], myRole='';
  function esc(s){return s==null?'':String(s);}
  function money(n){return '$'+(Number(n||0)).toFixed(2);}
  function clear(el){while(el.firstChild){el.removeChild(el.firstChild);}}
  function emptyMsg(text){var d=document.createElement('div');d.className='empty';d.textContent=text;return d;}
  function item(title,subtext,pillText){
    var row=document.createElement('div');row.className='item';
    var left=document.createElement('div');
    var t=document.createElement('div');t.textContent=title;left.appendChild(t);
    if(subtext){var s=document.createElement('div');s.className='sub';s.textContent=subtext;left.appendChild(s);}
    row.appendChild(left);
    if(pillText){var p=document.createElement('span');p.className='pill';p.textContent=pillText;row.appendChild(p);}
    return row;
  }
  function renderList(id,list,map){
    var el=document.getElementById(id); clear(el);
    if(!list.length){el.appendChild(emptyMsg('Nothing yet.'));return;}
    list.forEach(function(x){el.appendChild(map(x));});
  }
  function setMsg(id,cls,text){var m=document.getElementById(id);m.className='msg'+(cls?' '+cls:'');m.textContent=text;}
  async function api(path,opts){return fetch(path,Object.assign({credentials:'include'},opts||{}));}

  function fillClientSelects(){
    var sels=document.querySelectorAll('.client-select');
    for(var i=0;i<sels.length;i++){
      var sel=sels[i]; var prev=sel.value; clear(sel);
      var none=document.createElement('option');none.value='';none.textContent='— No client —';sel.appendChild(none);
      clientsCache.forEach(function(c){var o=document.createElement('option');o.value=c.id;o.textContent=c.name;sel.appendChild(o);});
      sel.value=prev;
    }
  }
  async function loadClients(){
    var r=await api('/api/platform/clients'); if(!r.ok)return;
    var d=await r.json(); clientsCache=d.clients||[];
    renderList('clients',clientsCache,function(c){return item(esc(c.name),esc(c.email||''),esc(c.status));});
    fillClientSelects();
  }
  async function loadProjects(){
    var r=await api('/api/platform/projects'); if(!r.ok)return;
    var d=await r.json();
    renderList('projects',d.projects||[],function(p){return item(esc(p.name),p.clientId?'Linked to a client':'',esc(p.status));});
  }
  async function loadInvoices(){
    var r=await api('/api/platform/invoices'); if(!r.ok)return;
    var d=await r.json();
    renderList('invoices',d.invoices||[],function(v){return item(esc(v.number)+' · '+money(v.amount),'',esc(v.status));});
  }
  async function loadBranding(){
    if(!slug)return;
    var r=await fetch('/api/platform/branding',{headers:{'X-Org-Slug':slug}});
    if(!r.ok)return; var d=await r.json(); var b=d.branding||{};
    if(b.primaryColor){document.documentElement.style.setProperty('--accent',b.primaryColor);}
    if(b.displayName){document.getElementById('orgName').textContent=b.displayName;}
    document.getElementById('bname').value=b.displayName||'';
    document.getElementById('bcolor').value=b.primaryColor||'';
  }
  async function loadDomains(){
    var r=await api('/api/platform/domains'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('domains'); clear(el);
    var list=d.domains||[];
    if(!list.length){el.appendChild(emptyMsg('No custom domains yet.'));return;}
    list.forEach(function(dm){
      var wrap=document.createElement('div');wrap.className='item';wrap.style.flexDirection='column';wrap.style.alignItems='stretch';
      var row=document.createElement('div');row.style.display='flex';row.style.alignItems='center';row.style.justifyContent='space-between';row.style.gap='8px';
      var nm=document.createElement('div');nm.textContent=esc(dm.domain);nm.style.fontWeight='600';row.appendChild(nm);
      var actions=document.createElement('div');actions.style.display='flex';actions.style.alignItems='center';actions.style.gap='8px';
      var st=document.createElement('span');st.className='pill';st.textContent=dm.verified?'verified':'pending verification';actions.appendChild(st);
      if(!dm.verified){
        var vb=document.createElement('button');vb.className='btn';vb.style.width='auto';vb.style.padding='6px 12px';vb.textContent='Verify';
        vb.addEventListener('click',function(){verifyDomain(dm.id,vb);});actions.appendChild(vb);
      }
      var rm=document.createElement('button');rm.className='btn ghost';rm.style.padding='6px 12px';rm.textContent='Remove';
      rm.addEventListener('click',function(){removeDomain(dm.id);});actions.appendChild(rm);
      row.appendChild(actions);
      wrap.appendChild(row);
      if(!dm.verified){
        var dns=document.createElement('div');dns.className='dns';
        var h=document.createElement('div');h.className='hint';h.textContent='To prove you own this domain, add this DNS TXT record, then click Verify:';dns.appendChild(h);
        var t=document.createElement('div');t.className='rec';
        var hn=document.createElement('div');var hl=document.createElement('span');hl.className='k';hl.textContent='Host';var hv=document.createElement('code');hv.textContent='_aecloud-verify.'+dm.domain;hn.appendChild(hl);hn.appendChild(hv);
        var vn=document.createElement('div');var vl=document.createElement('span');vl.className='k';vl.textContent='Value';var vv=document.createElement('code');vv.textContent='aecloud-verify='+esc(dm.verificationToken);vn.appendChild(vl);vn.appendChild(vv);
        t.appendChild(hn);t.appendChild(vn);dns.appendChild(t);
        wrap.appendChild(dns);
      }
      el.appendChild(wrap);
    });
  }
  async function verifyDomain(id,btn){
    if(btn){btn.disabled=true;btn.textContent='Checking…';}
    var r=await api('/api/platform/domains/'+encodeURIComponent(id)+'/verify',{method:'POST'});
    if(r.ok){setMsg('dmsg','ok','Domain verified — it now routes to your workspace.');loadDomains();return;}
    var e=await r.json().catch(function(){return{};});
    setMsg('dmsg','err',(e.error&&e.error.message)||'Could not verify yet.');
    if(btn){btn.disabled=false;btn.textContent='Verify';}
  }
  async function removeDomain(id){
    var r=await api('/api/platform/domains/'+encodeURIComponent(id),{method:'DELETE'});
    if(r.ok)loadDomains();
  }
  async function loadHosting(){
    var r=await api('/api/platform/hosting'); if(!r.ok)return;
    var d=await r.json();
    renderList('hosting',d.hosting||[],function(h){return item(esc(h.domain),esc(h.plan||''),esc(h.status));});
  }
  async function loadTickets(){
    var r=await api('/api/platform/tickets'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('tickets'); clear(el);
    var list=d.tickets||[];
    if(!list.length){el.appendChild(emptyMsg('No tickets yet.'));return;}
    list.forEach(function(t){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var s=document.createElement('div');s.textContent=esc(t.subject);s.style.fontWeight='600';left.appendChild(s);
      var sub=document.createElement('div');sub.className='sub';sub.textContent=esc(t.priority)+' priority';left.appendChild(sub);
      row.appendChild(left);
      var actions=document.createElement('div');actions.style.display='flex';actions.style.alignItems='center';actions.style.gap='8px';
      var st=document.createElement('span');st.className='pill';st.textContent=esc(t.status);actions.appendChild(st);
      var closed=(t.status==='resolved'||t.status==='closed');
      var tog=document.createElement('button');tog.className='btn ghost';tog.style.padding='6px 12px';tog.textContent=closed?'Reopen':'Resolve';
      tog.addEventListener('click',function(){setTicketStatus(t.id,closed?'open':'resolved');});actions.appendChild(tog);
      row.appendChild(actions);el.appendChild(row);
    });
  }
  async function setTicketStatus(id,status){
    var r=await api('/api/platform/tickets/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:status})});
    if(r.ok)loadTickets();
  }
  async function loadLeads(){
    var r=await api('/api/platform/leads'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('leads'); clear(el);
    var list=d.leads||[];
    if(!list.length){el.appendChild(emptyMsg('No leads yet.'));return;}
    var STAGES=['new','contacted','qualified','proposal','won','lost'];
    list.forEach(function(l){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var nm=document.createElement('div');nm.textContent=esc(l.name);nm.style.fontWeight='600';left.appendChild(nm);
      var parts=[];if(l.company)parts.push(esc(l.company));if(l.estimatedValue)parts.push('$'+Number(l.estimatedValue).toLocaleString());
      if(parts.length){var sub=document.createElement('div');sub.className='sub';sub.textContent=parts.join(' \\u00b7 ');left.appendChild(sub);}
      row.appendChild(left);
      var sel=document.createElement('select');sel.style.width='auto';
      STAGES.forEach(function(s){var o=document.createElement('option');o.value=s;o.textContent=s;if(s===l.status)o.selected=true;sel.appendChild(o);});
      sel.addEventListener('change',function(){setLeadStatus(l.id,sel.value);});
      row.appendChild(sel);
      el.appendChild(row);
    });
  }
  async function setLeadStatus(id,status){
    var r=await api('/api/platform/leads/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:status})});
    if(r.ok)loadLeads();
  }
  async function loadProposals(){
    var r=await api('/api/platform/proposals'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('proposals'); clear(el);
    var list=d.proposals||[];
    if(!list.length){el.appendChild(emptyMsg('No proposals yet.'));return;}
    var STAGES=['draft','sent','accepted','declined'];
    list.forEach(function(p){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var t=document.createElement('div');t.textContent=esc(p.title);t.style.fontWeight='600';left.appendChild(t);
      if(p.amount){var s=document.createElement('div');s.className='sub';s.textContent='$'+Number(p.amount).toLocaleString();left.appendChild(s);}
      row.appendChild(left);
      var sel=document.createElement('select');sel.style.width='auto';
      STAGES.forEach(function(st){var o=document.createElement('option');o.value=st;o.textContent=st;if(st===p.status)o.selected=true;sel.appendChild(o);});
      sel.addEventListener('change',function(){setProposalStatus(p.id,sel.value);});
      row.appendChild(sel);el.appendChild(row);
    });
  }
  async function setProposalStatus(id,status){
    var r=await api('/api/platform/proposals/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:status})});
    if(r.ok)loadProposals();
  }
  async function loadCampaigns(){
    var r=await api('/api/platform/campaigns'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('campaigns'); clear(el);
    var list=d.campaigns||[];
    if(!list.length){el.appendChild(emptyMsg('No campaigns yet.'));return;}
    var STAGES=['planned','active','paused','completed'];
    list.forEach(function(cp){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var nm=document.createElement('div');nm.textContent=esc(cp.name);nm.style.fontWeight='600';left.appendChild(nm);
      var parts=[];if(cp.channel)parts.push(esc(cp.channel));if(cp.budget)parts.push('$'+Number(cp.budget).toLocaleString()+' budget');
      if(parts.length){var sub=document.createElement('div');sub.className='sub';sub.textContent=parts.join(' \\u00b7 ');left.appendChild(sub);}
      row.appendChild(left);
      var sel=document.createElement('select');sel.style.width='auto';
      STAGES.forEach(function(s){var o=document.createElement('option');o.value=s;o.textContent=s;if(s===cp.status)o.selected=true;sel.appendChild(o);});
      sel.addEventListener('change',function(){setCampaignStatus(cp.id,sel.value);});
      row.appendChild(sel);
      el.appendChild(row);
    });
  }
  async function setCampaignStatus(id,status){
    var r=await api('/api/platform/campaigns/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:status})});
    if(r.ok)loadCampaigns();
  }
  async function loadReviews(){
    var r=await api('/api/platform/reviews'); if(!r.ok)return;
    var d=await r.json();
    renderList('reviews',d.reviews||[],function(rv){
      var stars='';for(var i=0;i<(rv.rating||0);i++){stars+='\\u2605';}
      var title=stars+' '+esc(rv.author)+(rv.source?' ('+esc(rv.source)+')':'');
      return item(title,esc(rv.comment||''),rv.replied?'replied':'');
    });
  }
  function stageRows(elId,list,stages,mapFn,path,reload){
    var el=document.getElementById(elId); clear(el);
    if(!list.length){el.appendChild(emptyMsg('Nothing yet.'));return;}
    list.forEach(function(x){
      var m=mapFn(x);
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var t=document.createElement('div');t.textContent=m.title;t.style.fontWeight='600';left.appendChild(t);
      if(m.sub){var s=document.createElement('div');s.className='sub';s.textContent=m.sub;left.appendChild(s);}
      row.appendChild(left);
      var sel=document.createElement('select');sel.style.width='auto';
      stages.forEach(function(st){var o=document.createElement('option');o.value=st;o.textContent=st;if(st===m.status)o.selected=true;sel.appendChild(o);});
      sel.addEventListener('change',function(){api('/api/platform/'+path+'/'+encodeURIComponent(m.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:sel.value})}).then(function(){if(reload)reload();});});
      row.appendChild(sel);el.appendChild(row);
    });
  }
  async function loadProducts(){
    var r=await api('/api/platform/products'); if(!r.ok)return; var d=await r.json();
    stageRows('products',d.products||[],['planning','active','maintenance','archived'],function(p){return{title:esc(p.name),sub:esc(p.language||''),status:p.status,id:p.id};},'products',loadProducts);
  }
  async function loadBooks(){
    var r=await api('/api/platform/books'); if(!r.ok)return; var d=await r.json();
    stageRows('books',d.books||[],['draft','editing','design','proof','published','archived'],function(b){return{title:esc(b.title),sub:esc(b.author||''),status:b.status,id:b.id};},'books',loadBooks);
  }
  async function loadPrograms(){
    var r=await api('/api/platform/programs'); if(!r.ok)return; var d=await r.json();
    stageRows('programs',d.programs||[],['planned','active','paused','completed'],function(p){return{title:esc(p.name),sub:esc(p.leader||''),status:p.status,id:p.id};},'programs',loadPrograms);
  }
  async function loadBrands(){
    var r=await api('/api/platform/brands'); if(!r.ok)return;
    var d=await r.json();
    renderList('brands',d.brands||[],function(b){return item(esc(b.name),esc(b.domain||''),'');});
  }
  async function loadTeam(){
    var r=await api('/api/platform/team'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('team'); clear(el);
    var list=d.team||[];
    if(!list.length){el.appendChild(emptyMsg('No team members yet.'));return;}
    var ROLES=['owner','admin','member'];
    list.forEach(function(m){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var e=document.createElement('div');e.textContent=esc(m.email);e.style.fontWeight='600';left.appendChild(e);
      if(m.name){var nm=document.createElement('div');nm.className='sub';nm.textContent=esc(m.name);left.appendChild(nm);}
      row.appendChild(left);
      var actions=document.createElement('div');actions.style.display='flex';actions.style.gap='8px';actions.style.alignItems='center';
      if(myRole==='owner'){
        var sel=document.createElement('select');sel.style.width='auto';
        ROLES.forEach(function(rl){var o=document.createElement('option');o.value=rl;o.textContent=rl;if(rl===m.role)o.selected=true;sel.appendChild(o);});
        sel.addEventListener('change',function(){setMemberRole(m.id,sel.value);});actions.appendChild(sel);
        var rm=document.createElement('button');rm.className='btn ghost';rm.style.padding='6px 12px';rm.textContent='Remove';
        rm.addEventListener('click',function(){removeMember(m.id);});actions.appendChild(rm);
      }else{
        var p=document.createElement('span');p.className='pill';p.textContent=esc(m.role);actions.appendChild(p);
      }
      row.appendChild(actions);el.appendChild(row);
    });
  }
  async function setMemberRole(id,role){
    var r=await api('/api/platform/team/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:role})});
    var e=await r.json().catch(function(){return {};});
    if(r.ok){setMsg('tmmsg','ok','Role updated.');}else{setMsg('tmmsg','err',(e.error&&e.error.message)||'Could not update.');}
    loadTeam();
  }
  async function removeMember(id){
    var r=await api('/api/platform/team/'+encodeURIComponent(id),{method:'DELETE'});
    var e=await r.json().catch(function(){return {};});
    if(r.ok){setMsg('tmmsg','ok','Removed.');}else{setMsg('tmmsg','err',(e.error&&e.error.message)||'Could not remove.');}
    loadTeam();
  }
  async function loadPortalUsers(){
    var r=await api('/api/platform/portal-users'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('portalUsers'); clear(el);
    var list=d.portalUsers||[];
    if(!list.length){el.appendChild(emptyMsg('No portal logins yet.'));return;}
    list.forEach(function(u){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');var e=document.createElement('div');e.textContent=esc(u.email);e.style.fontWeight='600';left.appendChild(e);
      row.appendChild(left);
      var rm=document.createElement('button');rm.className='btn ghost';rm.style.padding='6px 12px';rm.textContent='Remove';
      rm.addEventListener('click',function(){removePortalUser(u.id);});row.appendChild(rm);
      el.appendChild(row);
    });
  }
  async function removePortalUser(id){
    var r=await api('/api/platform/portal-users/'+encodeURIComponent(id),{method:'DELETE'});
    if(r.ok){setMsg('pumsg','ok','Removed.');loadPortalUsers();}
  }
  var aiReady=true;
  async function loadWebsites(){
    var r=await api('/api/platform/websites'); if(!r.ok)return;
    var d=await r.json(); aiReady=d.generationAvailable!==false;
    var verified=[];
    var dr=await api('/api/platform/domains');
    if(dr.ok){var dd=await dr.json();(dd.domains||[]).forEach(function(x){if(x.verified)verified.push(x.domain);});}
    var el=document.getElementById('websites'); clear(el);
    var list=d.websites||[];
    if(!list.length){el.appendChild(emptyMsg('No sites yet. Describe a business below to build one.'));return;}
    list.forEach(function(w){
      var wrap=document.createElement('div');wrap.className='item';wrap.style.flexDirection='column';wrap.style.alignItems='stretch';
      var row=document.createElement('div');row.style.display='flex';row.style.alignItems='center';row.style.justifyContent='space-between';row.style.gap='8px';
      var left=document.createElement('div');
      var nm=document.createElement('div');nm.textContent=esc(w.name);nm.style.fontWeight='600';left.appendChild(nm);
      if(w.brief){var s=document.createElement('div');s.className='sub';s.textContent=esc(w.brief);left.appendChild(s);}
      row.appendChild(left);
      var actions=document.createElement('div');actions.style.display='flex';actions.style.alignItems='center';actions.style.gap='8px';actions.style.flex='none';
      var st=document.createElement('span');st.className='pill';st.textContent=w.hasContent?esc(w.status):'empty';actions.appendChild(st);
      var gen=document.createElement('button');gen.className='btn';gen.style.width='auto';gen.style.padding='6px 12px';gen.textContent=w.hasContent?'Regenerate':'Generate';
      gen.addEventListener('click',function(){generateWebsite(w.id,gen);});actions.appendChild(gen);
      if(w.hasContent){
        var pv=document.createElement('a');pv.className='btn ghost';pv.style.padding='6px 12px';pv.textContent='Preview';
        pv.href='/api/platform/websites/'+encodeURIComponent(w.id)+'/preview';pv.target='_blank';pv.rel='noopener';actions.appendChild(pv);
      }
      var rm=document.createElement('button');rm.className='btn ghost';rm.style.padding='6px 12px';rm.textContent='Delete';
      rm.addEventListener('click',function(){removeWebsite(w.id);});actions.appendChild(rm);
      row.appendChild(actions);wrap.appendChild(row);
      if(w.hasContent){
        var pub=document.createElement('div');pub.style.marginTop='10px';pub.style.display='flex';pub.style.alignItems='center';pub.style.gap='8px';pub.style.flexWrap='wrap';
        if(w.status==='published'&&w.domain){
          var live=document.createElement('a');live.className='btn';live.style.width='auto';live.style.padding='6px 12px';live.textContent='Live at '+esc(w.domain)+' \\u2197';
          live.href='https://'+w.domain;live.target='_blank';live.rel='noopener';pub.appendChild(live);
          var unp=document.createElement('button');unp.className='btn ghost';unp.style.padding='6px 12px';unp.textContent='Unpublish';
          unp.addEventListener('click',function(){unpublishWebsite(w.id);});pub.appendChild(unp);
        }else if(verified.length){
          var lbl=document.createElement('span');lbl.className='hint';lbl.textContent='Publish to:';pub.appendChild(lbl);
          var sel=document.createElement('select');sel.style.width='auto';
          verified.forEach(function(dn){var o=document.createElement('option');o.value=dn;o.textContent=dn;sel.appendChild(o);});pub.appendChild(sel);
          var pb=document.createElement('button');pb.className='btn';pb.style.width='auto';pb.style.padding='6px 12px';pb.textContent='Publish';
          pb.addEventListener('click',function(){publishWebsite(w.id,sel.value);});pub.appendChild(pb);
        }else{
          var hint=document.createElement('div');hint.className='hint';hint.textContent='Add & verify a custom domain (panel below) to publish this site live.';pub.appendChild(hint);
        }
        wrap.appendChild(pub);
      }
      el.appendChild(wrap);
    });
  }
  async function publishWebsite(id,domain){
    if(!domain){setMsg('wmsg','err','Choose a verified domain.');return;}
    setMsg('wmsg','','Publishing\\u2026');
    var r=await api('/api/platform/websites/'+encodeURIComponent(id)+'/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({domain:domain})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){setMsg('wmsg','ok','Published — live at '+domain+'.');loadWebsites();}
    else{setMsg('wmsg','err',(x.error&&x.error.message)||'Could not publish.');}
  }
  async function unpublishWebsite(id){
    var r=await api('/api/platform/websites/'+encodeURIComponent(id)+'/unpublish',{method:'POST'});
    if(r.ok){setMsg('wmsg','ok','Unpublished.');loadWebsites();}
  }
  async function generateWebsite(id,btn){
    if(btn){btn.disabled=true;btn.textContent='Generating\\u2026';}
    var r=await api('/api/platform/websites/'+encodeURIComponent(id)+'/generate',{method:'POST'});
    if(r.ok){setMsg('wmsg','ok','Site generated. Click Preview to view it.');loadWebsites();return;}
    var e=await r.json().catch(function(){return {};});
    setMsg('wmsg','err',(e.error&&e.error.message)||'Could not generate.');
    if(btn){btn.disabled=false;btn.textContent='Generate';}
  }
  async function removeWebsite(id){
    var r=await api('/api/platform/websites/'+encodeURIComponent(id),{method:'DELETE'});
    if(r.ok)loadWebsites();
  }
  async function loadAiSettings(){
    var r=await api('/api/platform/ai-settings');
    if(r.ok){var d=await r.json();var s=d.settings;var el=document.getElementById('aiCurrent');
      if(s&&s.hasKey){el.textContent='Using your own '+esc(s.provider)+' key ('+esc(s.keyHint||'')+')'+(s.model?' · '+esc(s.model):'');}
      else{el.textContent='Using the platform\\u2019s included AI (billed to the platform).';}}
    var u=await api('/api/platform/ai-usage');
    if(u.ok){var ud=await u.json();var us=ud.usage||{};
      var allow=(ud.aiAllowance==null)?'unlimited':(ud.platformGenerationsUsed+'/'+ud.aiAllowance);
      document.getElementById('aiUsage').textContent='This month: '+(us.generations||0)+' generations · '+((us.inputTokens||0)+(us.outputTokens||0))+' tokens · ~$'+(Number(ud.costUsd||0)).toFixed(4)+' est. · Included AI: '+allow;}
  }
  function planPrice(p){return p.priceCents==null?'Custom pricing':('$'+(p.priceCents/100).toFixed(0)+'/mo');}
  async function loadBilling(){
    var r=await api('/api/platform/billing'); if(!r.ok)return;
    var d=await r.json(); var plan=d.plan||{}; var sub=d.subscription||{};
    document.getElementById('planStatus').textContent=esc(sub.status||'');
    document.getElementById('planSummary').textContent='You\\u2019re on '+esc(plan.name||'')+' \\u2014 '+planPrice(plan)+'.';
    var pr=await api('/api/platform/billing/plans');
    if(pr.ok){
      var pd=await pr.json(); var sel=document.getElementById('planPicker'); clear(sel);
      (pd.plans||[]).forEach(function(p){
        var o=document.createElement('option'); o.value=p.id;
        o.textContent=esc(p.name)+' \\u2014 '+planPrice(p)+(p.selfServe?'':' (contact sales)');
        if(p.id===plan.id)o.selected=true;
        sel.appendChild(o);
      });
    }
  }
  function buildSecNav(){
    var nav=document.getElementById('secnav'); if(!nav)return; clear(nav);
    var panels=document.querySelectorAll('.wrap .panel');
    for(var i=0;i<panels.length;i++){
      var p=panels[i]; if(p.style.display==='none')continue;
      var h=p.querySelector('h2'); if(!h)continue;
      if(!p.id)p.id='sec_'+i;
      var label=(h.firstChild&&h.firstChild.textContent||h.textContent||'').trim();
      var a=document.createElement('a');a.href='#'+p.id;a.textContent=label;nav.appendChild(a);
    }
  }
  async function init(){
    var me=await api('/auth/me');
    if(!me.ok){window.location='/login';return;}
    var d=await me.json(); var u=d.user||{}; var org=d.organization||{};
    slug=org.slug||'';
    document.getElementById('who').textContent=esc(u.email)+' · '+esc(u.role);
    if(org.name){document.getElementById('orgName').textContent=esc(org.name);}
    myRole=u.role||'';
    if(u.role==='owner'||u.role==='admin'){
      document.getElementById('brandPanel').style.display='';
      document.getElementById('domainPanel').style.display='';
      document.getElementById('brandsPanel').style.display='';
      document.getElementById('teamPanel').style.display='';
      document.getElementById('portalPanel').style.display='';
      loadBrands();
      loadTeam();
      loadPortalUsers();
    }
    if(u.role==='owner'){
      document.getElementById('planPickerWrap').style.display='flex';
      document.getElementById('aiPanel').style.display='';
    }
    await loadBilling(); await loadBranding(); await loadClients(); await loadProjects(); await loadInvoices(); await loadWebsites(); await loadHosting(); await loadTickets(); await loadLeads(); await loadProposals(); await loadCampaigns(); await loadReviews(); await loadProducts(); await loadBooks(); await loadPrograms(); await loadDomains();
    if(u.role==='owner'){await loadAiSettings();}
    buildSecNav();
  }
  document.getElementById('changePw').addEventListener('click',async function(){
    var c=document.getElementById('cpcur'),n=document.getElementById('cpnew');
    if(!c.value||!n.value){setMsg('cpmsg','err','Both fields are required.');return;}
    setMsg('cpmsg','','Updating\\u2026');
    var r=await api('/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:c.value,newPassword:n.value})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){c.value='';n.value='';setMsg('cpmsg','ok','Password changed.');}
    else{setMsg('cpmsg','err',(x.error&&x.error.message)||'Could not change password.');}
  });
  document.getElementById('addPortalUser').addEventListener('click',async function(){
    var c=document.getElementById('puclient'),e=document.getElementById('puemail'),p=document.getElementById('pupass');
    if(!c.value||!e.value.trim()||!p.value.trim()){setMsg('pumsg','err','Client, email, and temp password are required.');return;}
    setMsg('pumsg','','Creating\\u2026');
    var r=await api('/api/platform/portal-users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:c.value,email:e.value.trim(),password:p.value})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){e.value='';p.value='';setMsg('pumsg','ok','Login created — share the temp password with your client.');loadPortalUsers();}
    else{setMsg('pumsg','err',(x.error&&x.error.message)||'Could not create login.');}
  });
  document.getElementById('addMember').addEventListener('click',async function(){
    var em=document.getElementById('tmemail'),nm=document.getElementById('tmname'),rl=document.getElementById('tmrole'),pw=document.getElementById('tmpass');
    if(!em.value.trim()||!pw.value.trim()){setMsg('tmmsg','err','Email and a temp password (8+ chars) are required.');return;}
    setMsg('tmmsg','','Inviting\\u2026');
    var body={email:em.value.trim(),name:nm.value.trim()||undefined,role:rl.value,password:pw.value};
    var r=await api('/api/platform/team',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){em.value='';nm.value='';pw.value='';setMsg('tmmsg','ok','Invited — share the temp password with them.');loadTeam();}
    else{setMsg('tmmsg','err',(x.error&&x.error.message)||'Could not invite.');}
  });
  document.getElementById('addBrand').addEventListener('click',async function(){
    var n=document.getElementById('bnname'),dm=document.getElementById('bndomain'),em=document.getElementById('bnemail');
    if(!n.value.trim()){setMsg('bnmsg','err','Name is required.');return;}
    setMsg('bnmsg','','Adding\\u2026');
    var body={name:n.value.trim(),domain:dm.value.trim()||undefined,fromEmail:em.value.trim()||undefined};
    var r=await api('/api/platform/brands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){n.value='';dm.value='';em.value='';setMsg('bnmsg','ok','Brand added.');loadBrands();}
    else{setMsg('bnmsg','err',(x.error&&x.error.message)||'Could not add brand.');}
  });
  document.getElementById('addProduct').addEventListener('click',async function(){
    var n=document.getElementById('pdname'),l=document.getElementById('pdlang');
    if(!n.value.trim()){setMsg('pdmsg','err','Name is required.');return;}
    var r=await api('/api/platform/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n.value.trim(),language:l.value.trim()||undefined})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){n.value='';l.value='';setMsg('pdmsg','ok','Product added.');loadProducts();}else{setMsg('pdmsg','err',(x.error&&x.error.message)||'Could not add.');}
  });
  document.getElementById('addBook').addEventListener('click',async function(){
    var t=document.getElementById('bktitle'),a=document.getElementById('bkauthor');
    if(!t.value.trim()){setMsg('bkmsg','err','Title is required.');return;}
    var r=await api('/api/platform/books',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:t.value.trim(),author:a.value.trim()||undefined})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){t.value='';a.value='';setMsg('bkmsg','ok','Book added.');loadBooks();}else{setMsg('bkmsg','err',(x.error&&x.error.message)||'Could not add.');}
  });
  document.getElementById('addProgram').addEventListener('click',async function(){
    var n=document.getElementById('pgname'),l=document.getElementById('pgleader');
    if(!n.value.trim()){setMsg('pgmsg','err','Name is required.');return;}
    var r=await api('/api/platform/programs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n.value.trim(),leader:l.value.trim()||undefined})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){n.value='';l.value='';setMsg('pgmsg','ok','Program added.');loadPrograms();}else{setMsg('pgmsg','err',(x.error&&x.error.message)||'Could not add.');}
  });
  document.getElementById('addReview').addEventListener('click',async function(){
    var a=document.getElementById('rauthor'),rt=document.getElementById('rrating'),sc=document.getElementById('rsource'),cm=document.getElementById('rcomment');
    if(!a.value.trim()){setMsg('rmsg','err','Author is required.');return;}
    setMsg('rmsg','','Adding\\u2026');
    var body={author:a.value.trim(),rating:Number(rt.value),source:sc.value.trim()||undefined,comment:cm.value.trim()||undefined};
    var r=await api('/api/platform/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){a.value='';sc.value='';cm.value='';setMsg('rmsg','ok','Review added.');loadReviews();}
    else{setMsg('rmsg','err',(x.error&&x.error.message)||'Could not add review.');}
  });
  document.getElementById('addProposal').addEventListener('click',async function(){
    var t=document.getElementById('prtitle'),c=document.getElementById('prclient'),a=document.getElementById('pramount');
    if(!t.value.trim()){setMsg('prmsg','err','Title is required.');return;}
    setMsg('prmsg','','Adding\\u2026');
    var body={title:t.value.trim(),clientId:c.value||undefined};
    if(a.value)body.amount=Number(a.value);
    var r=await api('/api/platform/proposals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){t.value='';a.value='';setMsg('prmsg','ok','Proposal added.');loadProposals();}
    else{setMsg('prmsg','err',(x.error&&x.error.message)||'Could not add proposal.');}
  });
  document.getElementById('addCampaign').addEventListener('click',async function(){
    var n=document.getElementById('mname'),c=document.getElementById('mchannel'),b=document.getElementById('mbudget');
    if(!n.value.trim()){setMsg('mmsg','err','Name is required.');return;}
    setMsg('mmsg','','Adding\\u2026');
    var body={name:n.value.trim(),channel:c.value.trim()||undefined};
    if(b.value)body.budget=Number(b.value);
    var r=await api('/api/platform/campaigns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){n.value='';c.value='';b.value='';setMsg('mmsg','ok','Campaign added.');loadCampaigns();}
    else{setMsg('mmsg','err',(x.error&&x.error.message)||'Could not add campaign.');}
  });
  document.getElementById('addLead').addEventListener('click',async function(){
    var n=document.getElementById('lname'),c=document.getElementById('lcompany'),v=document.getElementById('lvalue'),s=document.getElementById('lstatus');
    if(!n.value.trim()){setMsg('lmsg','err','Name is required.');return;}
    setMsg('lmsg','','Adding\\u2026');
    var body={name:n.value.trim(),company:c.value.trim()||undefined,status:s.value};
    if(v.value)body.estimatedValue=Number(v.value);
    var r=await api('/api/platform/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){n.value='';c.value='';v.value='';setMsg('lmsg','ok','Lead added.');loadLeads();}
    else{setMsg('lmsg','err',(x.error&&x.error.message)||'Could not add lead.');}
  });
  document.getElementById('addTicket').addEventListener('click',async function(){
    var s=document.getElementById('tsubject'),c=document.getElementById('tclient'),p=document.getElementById('tpriority');
    if(!s.value.trim()){setMsg('tmsg','err','Subject is required.');return;}
    setMsg('tmsg','','Adding\\u2026');
    var r=await api('/api/platform/tickets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:s.value.trim(),clientId:c.value||undefined,priority:p.value})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){s.value='';setMsg('tmsg','ok','Ticket created.');loadTickets();}
    else{setMsg('tmsg','err',(x.error&&x.error.message)||'Could not add ticket.');}
  });
  document.getElementById('saveAi').addEventListener('click',async function(){
    var p=document.getElementById('aiProvider').value,k=document.getElementById('aiKey').value.trim(),m=document.getElementById('aiModel').value.trim();
    if(!k){setMsg('aimsg','err','Enter an API key.');return;}
    setMsg('aimsg','','Saving\\u2026');
    var r=await api('/api/platform/ai-settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:p,apiKey:k,model:m||undefined})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){document.getElementById('aiKey').value='';setMsg('aimsg','ok','Saved. Generation now runs on your key.');loadAiSettings();}
    else{setMsg('aimsg','err',(x.error&&x.error.message)||'Could not save.');}
  });
  document.getElementById('removeAi').addEventListener('click',async function(){
    var r=await api('/api/platform/ai-settings',{method:'DELETE'});
    if(r.ok){setMsg('aimsg','ok','Removed. Using the platform\\u2019s included AI.');loadAiSettings();}
  });
  document.getElementById('addWebsite').addEventListener('click',async function(){
    var nm=document.getElementById('wname'),br=document.getElementById('wbrief'),cl=document.getElementById('wclient');
    if(!nm.value.trim()){setMsg('wmsg','err','A site name is required.');return;}
    setMsg('wmsg','','Creating\\u2026');
    var r=await api('/api/platform/websites',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:nm.value.trim(),brief:br.value.trim()||undefined,clientId:cl.value||undefined})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){nm.value='';br.value='';setMsg('wmsg','ok',aiReady?'Site created. Click Generate to build it with AI.':'Site created. AI generation isn\\u2019t enabled yet.');loadWebsites();}
    else{setMsg('wmsg','err',(x.error&&x.error.message)||'Could not create site.');}
  });
  document.getElementById('addHosting').addEventListener('click',async function(){
    var dom=document.getElementById('hdomain'),cl=document.getElementById('hclient');
    if(!dom.value.trim()){setMsg('hmsg','err','A domain is required.');return;}
    setMsg('hmsg','','Creating\\u2026');
    var r=await api('/api/platform/hosting',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({domain:dom.value.trim(),clientId:cl.value||undefined})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){dom.value='';setMsg('hmsg','ok','Website created (pending provisioning).');loadHosting();}
    else{setMsg('hmsg','err',(x.error&&x.error.message)||'Could not create website.');}
  });
  document.getElementById('changePlan').addEventListener('click',async function(){
    var pid=document.getElementById('planPicker').value;
    setMsg('plmsg','','Updating\\u2026');
    var r=await api('/api/platform/billing/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId:pid})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok&&x.checkoutUrl){setMsg('plmsg','','Redirecting to secure checkout\\u2026');window.location=x.checkoutUrl;return;}
    if(r.ok){setMsg('plmsg','ok','Plan updated.');loadBilling();loadDomains();loadWebsites();}
    else{setMsg('plmsg','err',(x.error&&x.error.message)||'Could not change plan.');}
  });
  document.getElementById('logout').addEventListener('click',async function(){
    await api('/auth/logout',{method:'POST'}); window.location='/login';
  });
  document.getElementById('addClient').addEventListener('click',async function(){
    var name=document.getElementById('cname'),email=document.getElementById('cemail');
    if(!name.value.trim()){setMsg('cmsg','err','Name is required.');return;}
    setMsg('cmsg','','Adding…');
    var r=await api('/api/platform/clients',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:name.value.trim(),email:email.value.trim()||undefined})});
    if(r.ok){name.value='';email.value='';setMsg('cmsg','ok','Added.');loadClients();}
    else{var e=await r.json().catch(function(){return {};});setMsg('cmsg','err',(e.error&&e.error.message)||'Could not add.');}
  });
  document.getElementById('addProject').addEventListener('click',async function(){
    var name=document.getElementById('pname'),client=document.getElementById('pclient');
    if(!name.value.trim()){setMsg('pmsg','err','Name is required.');return;}
    setMsg('pmsg','','Adding…');
    var r=await api('/api/platform/projects',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:name.value.trim(),clientId:client.value||undefined})});
    if(r.ok){name.value='';setMsg('pmsg','ok','Added.');loadProjects();}
    else{var e=await r.json().catch(function(){return {};});setMsg('pmsg','err',(e.error&&e.error.message)||'Could not add.');}
  });
  document.getElementById('addInvoice').addEventListener('click',async function(){
    var client=document.getElementById('iclient'),desc=document.getElementById('idesc'),
        qty=document.getElementById('iqty'),price=document.getElementById('iprice');
    if(!desc.value.trim()){setMsg('imsg','err','A description is required.');return;}
    setMsg('imsg','','Adding…');
    var r=await api('/api/platform/invoices',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({clientId:client.value||undefined,
        lineItems:[{description:desc.value.trim(),quantity:Number(qty.value)||1,unitPrice:Number(price.value)||0}]})});
    if(r.ok){desc.value='';qty.value='1';price.value='0';setMsg('imsg','ok','Invoice created.');loadInvoices();}
    else{var e=await r.json().catch(function(){return {};});setMsg('imsg','err',(e.error&&e.error.message)||'Could not create.');}
  });
  document.getElementById('saveBrand').addEventListener('click',async function(){
    setMsg('bmsg','','Saving…');
    var r=await api('/api/platform/branding',{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({displayName:document.getElementById('bname').value.trim(),
        primaryColor:document.getElementById('bcolor').value.trim()})});
    var d=await r.json().catch(function(){return {};});
    if(r.ok){setMsg('bmsg','ok','Saved.');var b=d.branding||{};
      if(b.primaryColor){document.documentElement.style.setProperty('--accent',b.primaryColor);}
      if(b.displayName){document.getElementById('orgName').textContent=b.displayName;}}
    else{setMsg('bmsg','err',(d.error&&d.error.message)||'Could not save.');}
  });
  document.getElementById('addDomain').addEventListener('click',async function(){
    var d=document.getElementById('dname');
    if(!d.value.trim()){setMsg('dmsg','err','Enter a domain.');return;}
    setMsg('dmsg','','Adding…');
    var r=await api('/api/platform/domains',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({domain:d.value.trim()})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){d.value='';setMsg('dmsg','ok','Domain added. Add the DNS TXT record shown below, then click Verify.');loadDomains();}
    else{setMsg('dmsg','err',(x.error&&x.error.message)||'Could not add domain.');}
  });
  init();`;
  return layout({
    title: "Dashboard · All Elite Cloud",
    body,
    script,
  });
}
