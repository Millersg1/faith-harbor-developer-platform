/**
 * The platform-administration console (All Elite Cloud). Self-contained
 * HTML that talks to /platform/admin/api. Shows a login screen until an
 * admin session exists, then a cross-tenant view of every organization.
 */
export function adminConsolePage(): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Platform Admin - All Elite Cloud</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#07070a;--card:#12121a;--card2:#191922;--border:rgba(255,255,255,.09);
    --text:#f3f5fb;--muted:#98a1b4;--red:#e11d48;--blue:#2563eb;--cyan:#22d3ee;--amber:#f59e0b;--ok:#4ade80}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text);background:
    radial-gradient(900px 500px at 80% -10%,rgba(37,99,235,.12),transparent 60%),var(--bg);min-height:100vh;line-height:1.55}
  a{color:var(--cyan)}
  .bar{border-bottom:1px solid var(--border);background:rgba(7,7,10,.7);backdrop-filter:blur(10px)}
  .wrap{max-width:1080px;margin:0 auto;padding:0 22px}
  .bar .wrap{display:flex;align-items:center;justify-content:space-between;height:62px}
  .brand{display:flex;align-items:center;gap:10px;font-weight:800}
  .mk{width:26px;height:26px;border-radius:8px;background:conic-gradient(from 210deg,var(--red),var(--blue),var(--cyan),var(--red))}
  .pill{font-size:.62rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--cyan);
    border:1px solid rgba(34,211,238,.3);border-radius:999px;padding:3px 9px}
  .btn{font-weight:700;font-size:.86rem;padding:9px 16px;border-radius:10px;border:1px solid transparent;cursor:pointer}
  .btn-red{background:linear-gradient(180deg,#f43f6b,var(--red));color:#fff}
  .btn-ghost{background:rgba(255,255,255,.05);border-color:var(--border);color:var(--text)}
  .btn-sm{font-size:.78rem;padding:6px 12px}
  main{padding:36px 0}
  .center{min-height:82vh;display:grid;place-items:center}
  .card{background:linear-gradient(180deg,var(--card2),var(--card));border:1px solid var(--border);
    border-radius:18px;padding:30px;width:100%;max-width:400px}
  .card h1{font-size:1.35rem;margin-bottom:4px}.card .sub{color:var(--muted);font-size:.88rem;margin-bottom:20px}
  label{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;margin:12px 0 6px}
  input{width:100%;padding:11px 13px;background:rgba(0,0,0,.25);border:1px solid var(--border);border-radius:10px;color:var(--text);outline:none}
  input:focus{border-color:var(--cyan)}
  .msg{min-height:1.1em;font-size:.84rem;font-weight:600;margin-top:12px}
  .msg.err{color:#f26d6d}.msg.ok{color:var(--ok)}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  .stat{border:1px solid var(--border);border-radius:13px;padding:16px;background:var(--card)}
  .stat .n{font-size:1.6rem;font-weight:800}.stat .l{color:var(--muted);font-size:.78rem}
  .panel{border:1px solid var(--border);border-radius:16px;background:var(--card);overflow:hidden}
  .panel h2{font-size:1rem;padding:18px 20px;border-bottom:1px solid var(--border)}
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:13px 20px;font-size:.86rem;border-bottom:1px solid var(--border)}
  th{color:var(--muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.05em}
  tr:last-child td{border-bottom:0}
  td .o-name{font-weight:600}.td-sub{color:var(--muted);font-size:.76rem}
  .badge{font-size:.68rem;font-weight:800;text-transform:uppercase;padding:3px 9px;border-radius:999px}
  .badge.active{background:rgba(74,222,128,.14);color:var(--ok)}
  .badge.suspended{background:rgba(245,158,11,.16);color:var(--amber)}
  .badge.cancelled{background:rgba(148,163,184,.16);color:var(--muted)}
  .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}
  .empty{padding:26px 20px;color:var(--muted);font-size:.9rem}
  @media(max-width:640px){.stats{grid-template-columns:1fr 1fr}}
</style></head>
<body>
<div class="bar"><div class="wrap">
  <div class="brand"><span class="mk"></span> All Elite Cloud <span class="pill">Platform Admin</span></div>
  <button class="btn btn-ghost" id="logout" style="display:none">Sign out</button>
</div></div>

<div id="login" class="center"><form class="card" id="loginForm">
  <h1>Platform sign in</h1>
  <p class="sub">All Elite Cloud staff only.</p>
  <label for="email">Email</label><input id="email" type="email" required/>
  <label for="password">Password</label><input id="password" type="password" required/>
  <div class="msg" id="lmsg"></div>
  <button class="btn btn-red" type="submit" style="width:100%;margin-top:16px">Sign in</button>
</form></div>

<main id="console" class="wrap" style="display:none">
  <div class="top">
    <div><h1 style="font-size:1.5rem">Organizations</h1><p style="color:var(--muted);font-size:.88rem">Every tenant on the platform.</p></div>
    <span class="td-sub" id="who"></span>
  </div>
  <div class="stats" id="stats"></div>
  <div class="panel">
    <h2>All organizations</h2>
    <div id="orgWrap"><div class="empty">Loading…</div></div>
  </div>
</main>

<script>
  var API='/platform/admin/api';
  function esc(s){return s==null?'':String(s);}
  async function api(path,opts){return fetch(API+path,Object.assign({credentials:'include'},opts||{}));}
  function show(el,on){document.getElementById(el).style.display=on?'':'none';}
  function fmtDate(s){try{return new Date(s).toLocaleDateString();}catch(e){return '';}}

  function statCard(n,l){var d=document.createElement('div');d.className='stat';
    var a=document.createElement('div');a.className='n';a.textContent=esc(n);
    var b=document.createElement('div');b.className='l';b.textContent=l;d.appendChild(a);d.appendChild(b);return d;}

  async function loadStats(){
    var r=await api('/stats'); if(!r.ok)return; var s=await r.json();
    var el=document.getElementById('stats'); el.textContent='';
    el.appendChild(statCard(s.organizations,'Organizations'));
    el.appendChild(statCard(s.active,'Active'));
    el.appendChild(statCard(s.suspended,'Suspended'));
    el.appendChild(statCard(s.admins,'Admins'));
  }
  async function loadOrgs(){
    var r=await api('/organizations'); if(!r.ok)return;
    var d=await r.json(); var orgs=d.organizations||[];
    var wrap=document.getElementById('orgWrap'); wrap.textContent='';
    if(!orgs.length){var e=document.createElement('div');e.className='empty';e.textContent='No organizations yet.';wrap.appendChild(e);return;}
    var table=document.createElement('table');
    var thead=document.createElement('thead');
    var htr=document.createElement('tr');
    ['Organization','Status','Created','Action'].forEach(function(h){var th=document.createElement('th');th.textContent=h;htr.appendChild(th);});
    thead.appendChild(htr);table.appendChild(thead);
    var tb=document.createElement('tbody');
    orgs.forEach(function(o){
      var tr=document.createElement('tr');
      var td1=document.createElement('td');
      var nm=document.createElement('div');nm.className='o-name';nm.textContent=esc(o.name);
      var sl=document.createElement('div');sl.className='td-sub';sl.textContent=esc(o.slug)+'.allelitecloud.com';
      td1.appendChild(nm);td1.appendChild(sl);
      var td2=document.createElement('td');var bd=document.createElement('span');bd.className='badge '+esc(o.status);bd.textContent=esc(o.status);td2.appendChild(bd);
      var td3=document.createElement('td');td3.textContent=fmtDate(o.createdAt);
      var td4=document.createElement('td');
      var btn=document.createElement('button');btn.className='btn btn-sm '+(o.status==='active'?'btn-ghost':'btn-red');
      btn.textContent=o.status==='active'?'Suspend':'Reactivate';
      btn.addEventListener('click',function(){toggle(o,btn);});
      td4.appendChild(btn);
      tr.appendChild(td1);tr.appendChild(td2);tr.appendChild(td3);tr.appendChild(td4);tb.appendChild(tr);
    });
    table.appendChild(tb);wrap.appendChild(table);
  }
  async function toggle(o,btn){
    btn.disabled=true;
    var next=o.status==='active'?'suspended':'active';
    var r=await api('/organizations/'+encodeURIComponent(o.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:next})});
    btn.disabled=false;
    if(r.ok){await loadOrgs();await loadStats();}
  }
  async function boot(){
    var me=await api('/me');
    if(me.ok){var d=await me.json();document.getElementById('who').textContent=esc(d.admin&&d.admin.email);
      show('login',false);show('console',true);document.getElementById('logout').style.display='';
      await loadStats();await loadOrgs();}
    else{show('login',true);show('console',false);}
  }
  document.getElementById('loginForm').addEventListener('submit',async function(e){
    e.preventDefault();var m=document.getElementById('lmsg');m.className='msg';m.textContent='Signing in…';
    var r=await api('/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:document.getElementById('email').value.trim(),password:document.getElementById('password').value})});
    if(r.ok){boot();}else{var x=await r.json().catch(function(){return{};});m.className='msg err';m.textContent=(x.error&&x.error.message)||'Sign in failed.';}
  });
  document.getElementById('logout').addEventListener('click',async function(){await api('/logout',{method:'POST'});location.reload();});
  boot();
</script>
</body></html>`;
}
