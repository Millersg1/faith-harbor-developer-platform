/**
 * The client portal UI: a self-contained login + read-only dashboard where a
 * tenant's client signs in and sees their own projects, invoices, tickets,
 * and proposals. Talks to /portal/api. No framework, no external assets.
 */
export function portalPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Client Portal</title>
<style>
  :root{--bg:#0b1220;--card:#131f33;--card2:#172740;--border:rgba(255,255,255,.09);--text:#e6edf5;--muted:#9fb0c3;--accent:#2dd4bf;}
  *{box-sizing:border-box}
  body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--text);}
  .wrap{max-width:900px;margin:0 auto;padding:32px 20px;}
  h1{font-size:1.4rem;margin:0 0 4px;}
  .muted{color:var(--muted);font-size:.9rem;}
  .card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:22px;margin-bottom:18px;}
  label{display:block;font-size:.8rem;color:var(--muted);margin:12px 0 5px;}
  input{width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--border);background:var(--card2);color:var(--text);font-size:.95rem;}
  .btn{margin-top:16px;padding:11px 18px;border:none;border-radius:9px;background:var(--accent);color:#04211d;font-weight:700;cursor:pointer;font-size:.9rem;}
  .btn.ghost{background:transparent;border:1px solid var(--border);color:var(--text);}
  .item{padding:11px 14px;background:var(--card2);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;align-items:center;}
  .pill{font-size:.66rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:3px 9px;border-radius:999px;background:rgba(45,212,191,.16);color:var(--accent);}
  h2{font-size:1rem;margin:0 0 12px;}
  .empty{color:var(--muted);font-size:.88rem;}
  .msg{margin-top:10px;font-size:.85rem;min-height:1em;}
  .msg.err{color:#fca5a5;} .msg.ok{color:var(--accent);}
  .row{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:18px;}
</style>
</head>
<body>
<div class="wrap">
  <div id="loginView">
    <div class="card" style="max-width:420px;margin:8vh auto 0;">
      <h1>Client Portal</h1>
      <p class="muted">Sign in to see your projects, invoices, tickets, and proposals.</p>
      <label for="org">Organization</label>
      <input id="org" placeholder="your-organization" autocomplete="organization" />
      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="email" />
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" />
      <button class="btn" id="loginBtn">Sign in</button>
      <div class="msg" id="lmsg"></div>
    </div>
  </div>
  <div id="appView" style="display:none;">
    <div class="row">
      <div><h1 id="clientName">Portal</h1><span class="muted">Client portal</span></div>
      <button class="btn ghost" id="logoutBtn">Sign out</button>
    </div>
    <div class="card"><h2>Projects</h2><div id="projects"><div class="empty">Loading…</div></div></div>
    <div class="card"><h2>Proposals</h2><div id="proposals"><div class="empty">Loading…</div></div></div>
    <div class="card"><h2>Invoices</h2><div id="invoices"><div class="empty">Loading…</div></div></div>
    <div class="card"><h2>Support tickets</h2><div id="tickets"><div class="empty">Loading…</div></div></div>
  </div>
</div>
<script>
  var slug='';
  function esc(s){return s==null?'':String(s);}
  function money(n){return '$'+(Number(n||0)).toFixed(2);}
  function clear(el){while(el.firstChild)el.removeChild(el.firstChild);}
  function api(path,opts){return fetch('/portal/api'+path,Object.assign({credentials:'include'},opts||{}));}
  function render(id,list,map){
    var el=document.getElementById(id);clear(el);
    if(!list.length){var e=document.createElement('div');e.className='empty';e.textContent='Nothing yet.';el.appendChild(e);return;}
    list.forEach(function(x){
      var m=map(x);
      var row=document.createElement('div');row.className='item';
      var t=document.createElement('div');t.textContent=m.title;row.appendChild(t);
      if(m.pill){var p=document.createElement('span');p.className='pill';p.textContent=m.pill;row.appendChild(p);}
      el.appendChild(row);
    });
  }
  async function loadAll(){
    var me=await api('/me'); if(!me.ok){show('login');return;}
    var d=await me.json();
    document.getElementById('clientName').textContent=(d.client&&d.client.name)||'Portal';
    var pr=await api('/projects'); if(pr.ok){var p=await pr.json();render('projects',p.projects||[],function(x){return{title:esc(x.name),pill:esc(x.status)};});}
    var ps=await api('/proposals'); if(ps.ok){var q=await ps.json();render('proposals',q.proposals||[],function(x){return{title:esc(x.title)+(x.amount?' · '+money(x.amount):''),pill:esc(x.status)};});}
    var iv=await api('/invoices'); if(iv.ok){var i=await iv.json();render('invoices',i.invoices||[],function(x){return{title:esc(x.number||'Invoice')+' · '+money(x.amount),pill:esc(x.status)};});}
    var tk=await api('/tickets'); if(tk.ok){var t=await tk.json();render('tickets',t.tickets||[],function(x){return{title:esc(x.subject),pill:esc(x.status)};});}
  }
  function show(v){document.getElementById('loginView').style.display=v==='login'?'':'none';document.getElementById('appView').style.display=v==='app'?'':'none';}
  document.getElementById('loginBtn').addEventListener('click',async function(){
    var o=document.getElementById('org').value.trim(),e=document.getElementById('email').value.trim(),p=document.getElementById('password').value;
    if(!o||!e||!p){document.getElementById('lmsg').className='msg err';document.getElementById('lmsg').textContent='All fields are required.';return;}
    slug=o;document.getElementById('lmsg').className='msg';document.getElementById('lmsg').textContent='Signing in…';
    var r=await api('/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Org-Slug':o},body:JSON.stringify({email:e,password:p})});
    if(r.ok){show('app');loadAll();}
    else{var x=await r.json().catch(function(){return{};});document.getElementById('lmsg').className='msg err';document.getElementById('lmsg').textContent=(x.error&&x.error.message)||'Could not sign in.';}
  });
  document.getElementById('logoutBtn').addEventListener('click',async function(){await api('/auth/logout',{method:'POST'});show('login');});
  loadAll();
</script>
</body>
</html>`;
}
