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
    </div>
  </div>`;
  const script = `
  var slug='', clientsCache=[];
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
  async function init(){
    var me=await api('/auth/me');
    if(!me.ok){window.location='/login';return;}
    var d=await me.json(); var u=d.user||{}; var org=d.organization||{};
    slug=org.slug||'';
    document.getElementById('who').textContent=esc(u.email)+' · '+esc(u.role);
    if(org.name){document.getElementById('orgName').textContent=esc(org.name);}
    if(u.role==='owner'||u.role==='admin'){document.getElementById('brandPanel').style.display='';}
    await loadBranding(); await loadClients(); await loadProjects(); await loadInvoices();
  }
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
  init();`;
  return layout({
    title: "Dashboard · All Elite Cloud",
    body,
    script,
  });
}
