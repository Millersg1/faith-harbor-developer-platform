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
    <h2>Revenue &amp; analytics</h2>
    <div class="stats" id="revStats" style="padding:16px 20px 4px;"></div>
    <div id="planWrap" style="padding:4px 20px 18px;"><div class="empty">Loading…</div></div>
  </div>
  <div class="panel">
    <h2>System health</h2>
    <div id="healthWrap" style="padding:16px 20px 18px;"><div class="empty">Loading…</div></div>
  </div>
  <div class="panel">
    <h2>All organizations</h2>
    <div id="orgWrap"><div class="empty">Loading…</div></div>
  </div>

  <div class="panel" style="margin-top:24px;">
    <h2>Legal documents</h2>
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);">
      <label for="legalKind">Document</label>
      <select id="legalKind" style="width:100%;padding:11px 13px;background:rgba(0,0,0,.25);border:1px solid var(--border);border-radius:10px;color:var(--text);"></select>
    </div>
    <div id="legalVersions" style="padding:8px 20px;"></div>
    <div id="legalEditor" style="padding:0 20px 16px;"></div>
    <div id="legalMsg" class="msg" style="padding:0 20px;"></div>
    <div id="legalPreview" style="padding:16px 20px;border-top:1px solid var(--border);max-height:52vh;overflow:auto;font-size:.9rem;"></div>
  </div>

  <div class="panel" style="margin-top:24px;">
    <h2>Privacy requests <span class="pill">platform</span></h2>
    <p style="padding:0 20px;color:var(--muted);font-size:.85rem;">Requests about All Elite Cloud's own account, billing, security, or platform processing. Tenant requests are managed by each tenant and are never shown here.</p>
    <div id="pprivMsg" class="msg" style="padding:0 20px;"></div>
    <div id="pprivList" style="padding:8px 20px;"><div class="empty">Loading…</div></div>
    <div id="pprivDetail" style="padding:0 20px 16px;"></div>
  </div>

  <div class="panel" style="margin-top:24px;">
    <h2>Documentation</h2>
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);">
      <label for="docSelect">Document</label>
      <select id="docSelect" style="width:100%;padding:11px 13px;background:rgba(0,0,0,.25);border:1px solid var(--border);border-radius:10px;color:var(--text);"></select>
    </div>
    <div id="docView" style="padding:20px;max-height:70vh;overflow:auto;font-size:.9rem;">
      <div class="empty">Select a document.</div>
    </div>
  </div>

  <div class="panel" style="margin-top:24px;">
    <h2>Change password</h2>
    <div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;max-width:420px;">
      <div><label for="cpCur">Current password</label><input id="cpCur" type="password" autocomplete="current-password" style="width:100%;padding:11px 13px;background:rgba(0,0,0,.25);border:1px solid var(--border);border-radius:10px;color:var(--text);" /></div>
      <div><label for="cpNew">New password (min 8 characters)</label><input id="cpNew" type="password" autocomplete="new-password" style="width:100%;padding:11px 13px;background:rgba(0,0,0,.25);border:1px solid var(--border);border-radius:10px;color:var(--text);" /></div>
      <button id="cpBtn" style="padding:11px 18px;background:var(--accent,#6d28d9);color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer;width:auto;align-self:flex-start;">Update password</button>
      <div id="cpMsg" style="font-size:.9rem;min-height:1.2em;"></div>
    </div>
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
  function money(n){return '$'+Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2});}
  async function loadAnalytics(){
    var r=await api('/analytics'); if(!r.ok)return; var a=await r.json();
    var rev=document.getElementById('revStats'); rev.textContent='';
    rev.appendChild(statCard(money(a.mrrUsd),'MRR'));
    rev.appendChild(statCard(money(a.arrUsd),'ARR (run-rate)'));
    rev.appendChild(statCard(esc(a.activeSubscriptions),'Active subscriptions'));
    rev.appendChild(statCard(money(a.aiPlatformCostUsdMTD),'AI cost (this month)'));
    rev.appendChild(statCard(money(a.netAfterAiUsd),'MRR net of AI'));
    var pw=document.getElementById('planWrap'); pw.textContent='';
    var plans=a.byPlan||[];
    if(!plans.length){var e=document.createElement('div');e.className='empty';e.textContent='No active subscriptions yet.';pw.appendChild(e);return;}
    plans.forEach(function(p){
      var row=document.createElement('div');row.style.cssText='display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);font-size:.9rem;';
      var l=document.createElement('span');l.textContent=esc(p.name)+'  \\u00d7'+esc(p.count);
      var v=document.createElement('span');v.style.fontWeight='600';v.textContent=money(p.mrrUsd)+'/mo';
      row.appendChild(l);row.appendChild(v);pw.appendChild(row);
    });
  }
  function dot(ok){var s=document.createElement('span');s.style.cssText='display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px;background:'+(ok?'#22c55e':'#ef4444')+';';return s;}
  function healthRow(label,ok,detail){
    var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);font-size:.9rem;';
    var left=document.createElement('span');left.appendChild(dot(ok));left.appendChild(document.createTextNode(label));
    var v=document.createElement('span');v.style.color='var(--muted)';v.textContent=detail;
    row.appendChild(left);row.appendChild(v);return row;
  }
  function fmtUptime(sec){sec=Number(sec||0);var d=Math.floor(sec/86400),h=Math.floor((sec%86400)/3600),m=Math.floor((sec%3600)/60);
    if(d)return d+'d '+h+'h';if(h)return h+'h '+m+'m';return m+'m';}
  async function loadHealth(){
    var wrap=document.getElementById('healthWrap'); wrap.textContent='';
    var r=await api('/system-health'); if(!r.ok){var e=document.createElement('div');e.className='empty';e.textContent='Health unavailable.';wrap.appendChild(e);return;}
    var h=await r.json();
    wrap.appendChild(healthRow('Database',h.db==='ok',h.db==='ok'?'Reachable':'Unreachable'));
    wrap.appendChild(healthRow('Background worker',!!(h.worker&&h.worker.running),h.worker&&h.worker.lastTickAt?('Last tick '+new Date(h.worker.lastTickAt).toLocaleTimeString()):'No tick yet'));
    wrap.appendChild(healthRow('Email (SMTP)',!!(h.email&&h.email.connected),h.email&&h.email.connected?'Connected':'Not configured'));
    wrap.appendChild(healthRow('AI (platform key)',!!(h.ai&&h.ai.platformKey),h.ai&&h.ai.platformKey?'Configured':'Not configured'));
    wrap.appendChild(healthRow('Stripe billing',!!(h.stripe&&h.stripe.connected),h.stripe&&h.stripe.connected?'Connected':'Not connected'));
    var foot=document.createElement('div');foot.style.cssText='padding-top:12px;color:var(--muted);font-size:.82rem;';
    foot.textContent='Version '+esc(h.version)+' · up '+fmtUptime(h.uptimeSeconds);
    wrap.appendChild(foot);
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
  function mdInline(s){return s.replace(/\`([^\`]+)\`/g,'<code style="background:rgba(255,255,255,.08);padding:1px 5px;border-radius:5px;">$1</code>').replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>');}
  function renderMd(md){
    function e(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    var lines=md.split(/\\r?\\n/),html='',inCode=false,inList=false;
    lines.forEach(function(line){
      if(/^\`\`\`/.test(line)){ if(inCode){html+='</pre>';inCode=false;}else{if(inList){html+='</ul>';inList=false;}html+='<pre style="background:rgba(0,0,0,.35);padding:12px;border-radius:8px;overflow:auto;">';inCode=true;} return; }
      if(inCode){ html+=e(line)+'\\n'; return; }
      var h=line.match(/^(#{1,4})\\s+(.*)/);
      if(h){ if(inList){html+='</ul>';inList=false;} var lv=h[1].length; html+='<h'+lv+' style="margin:14px 0 6px;">'+mdInline(e(h[2]))+'</h'+lv+'>'; return; }
      if(/^\\s*[-*]\\s+/.test(line)){ if(!inList){html+='<ul style="margin:6px 0 6px 20px;">';inList=true;} html+='<li>'+mdInline(e(line.replace(/^\\s*[-*]\\s+/,'')))+'</li>'; return; }
      if(/^\\s*\\|/.test(line)){ html+='<div style="font-family:monospace;font-size:.82rem;white-space:pre;overflow:auto;">'+mdInline(e(line))+'</div>'; return; }
      if(inList){html+='</ul>';inList=false;}
      if(line.trim()===''){ return; }
      html+='<p style="margin:8px 0;">'+mdInline(e(line))+'</p>';
    });
    if(inCode)html+='</pre>'; if(inList)html+='</ul>';
    return html;
  }
  async function loadDoc(name){
    var view=document.getElementById('docView');
    view.innerHTML='<div class="empty">Loading…</div>';
    var r=await api('/docs/'+encodeURIComponent(name));
    if(!r.ok){view.innerHTML='<div class="empty">Could not load document.</div>';return;}
    var d=await r.json();
    view.innerHTML=renderMd(d.content||'');
  }
  async function loadDocs(){
    var r=await api('/docs'); if(!r.ok)return;
    var d=await r.json(); var docs=d.docs||[];
    var sel=document.getElementById('docSelect'); sel.innerHTML='';
    if(!docs.length){var o=document.createElement('option');o.textContent='No documents';sel.appendChild(o);return;}
    docs.forEach(function(name){var o=document.createElement('option');o.value=name;o.textContent=name;sel.appendChild(o);});
    sel.addEventListener('change',function(){loadDoc(sel.value);});
    loadDoc(docs[0]);
  }
  // ---- Legal document management ----
  var legalDocs={}, legalCurrentKind=null;
  var STATUS_LABEL={draft:'Draft',legal_review:'Legal review required',published:'Published',superseded:'Superseded',archived:'Archived'};
  function legalMsg(text,ok){var m=document.getElementById('legalMsg');m.className='msg'+(ok===true?' ok':ok===false?' err':'');m.textContent=text||'';}
  async function loadLegal(){
    var r=await api('/legal/documents'); if(!r.ok){return;} var d=await r.json();
    legalDocs={};
    (d.documents||[]).forEach(function(doc){(legalDocs[doc.kind]=legalDocs[doc.kind]||[]).push(doc);});
    Object.keys(legalDocs).forEach(function(k){legalDocs[k].sort(function(a,b){return b.version-a.version;});});
    var sel=document.getElementById('legalKind'); sel.innerHTML='';
    var kinds=Object.keys(legalDocs).sort();
    if(!kinds.length){var o=document.createElement('option');o.textContent='No documents';sel.appendChild(o);return;}
    kinds.forEach(function(k){var o=document.createElement('option');o.value=k;var pub=legalDocs[k].filter(function(x){return x.status==='published';})[0];o.textContent=(legalDocs[k][0].title||k)+' ('+(pub?'published v'+pub.version:'draft only')+')';sel.appendChild(o);});
    sel.onchange=function(){legalCurrentKind=sel.value;renderVersions();};
    legalCurrentKind=kinds[0];sel.value=legalCurrentKind;renderVersions();
  }
  function badgeFor(status){var s=document.createElement('span');s.className='badge';var col=status==='published'?'var(--ok)':status==='legal_review'?'var(--amber)':'var(--muted)';s.style.cssText='background:rgba(148,163,184,.16);color:'+col;s.textContent=STATUS_LABEL[status]||status;return s;}
  function renderVersions(){
    var wrap=document.getElementById('legalVersions');wrap.textContent='';legalMsg('');
    document.getElementById('legalEditor').textContent='';document.getElementById('legalPreview').textContent='';
    var versions=legalDocs[legalCurrentKind]||[];
    var head=document.createElement('div');head.style.cssText='display:flex;justify-content:space-between;align-items:center;margin:6px 0 10px;';
    var h=document.createElement('div');h.style.fontWeight='700';h.textContent='Versions';
    var nv=document.createElement('button');nv.className='btn btn-ghost btn-sm';nv.textContent='New version from current';
    nv.onclick=function(){legalAction('/legal/documents/'+encodeURIComponent(legalCurrentKind)+'/draft',{},'New draft created.');};
    head.appendChild(h);head.appendChild(nv);wrap.appendChild(head);
    versions.forEach(function(v){
      var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:10px;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);font-size:.88rem;';
      var left=document.createElement('div');left.style.cssText='display:flex;align-items:center;gap:10px;';
      var vv=document.createElement('span');vv.style.fontWeight='600';vv.textContent='v'+v.version;left.appendChild(vv);left.appendChild(badgeFor(v.status));
      var meta=document.createElement('span');meta.className='td-sub';meta.textContent=(v.effectiveDate?'eff '+v.effectiveDate+' · ':'')+'upd '+fmtDate(v.updatedAt)+(v.requiresReconsent?' · re-consent':'');left.appendChild(meta);
      var view=document.createElement('button');view.className='btn btn-ghost btn-sm';view.textContent='Open';view.onclick=function(){openVersion(v.id);};
      row.appendChild(left);row.appendChild(view);wrap.appendChild(row);
    });
  }
  async function openVersion(id){
    legalMsg('Loading…');
    var r=await api('/legal/documents/'+encodeURIComponent(id)+'/preview');
    if(!r.ok){legalMsg('Could not load version.',false);return;}
    var d=await r.json();legalMsg('');
    renderEditor(d.document);
    document.getElementById('legalPreview').innerHTML='<div style="color:var(--muted);font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Preview</div>'+d.html;
  }
  function field(label,el){var w=document.createElement('div');w.style.margin='10px 0';var l=document.createElement('label');l.textContent=label;w.appendChild(l);w.appendChild(el);return w;}
  function renderEditor(doc){
    var box=document.getElementById('legalEditor');box.textContent='';
    var editable=doc.status==='draft'||doc.status==='legal_review';
    var meta=document.createElement('div');meta.className='td-sub';meta.style.margin='6px 0 4px';
    meta.textContent='v'+doc.version+' · '+(STATUS_LABEL[doc.status]||doc.status)+(editable?' (editable)':' (immutable)');
    box.appendChild(meta);
    var title=document.createElement('input');title.value=doc.title;title.disabled=!editable;
    var summary=document.createElement('input');summary.value=doc.summary;summary.disabled=!editable;
    var bodyEl=document.createElement('textarea');bodyEl.value=doc.bodyMarkdown;bodyEl.disabled=!editable;
    bodyEl.style.cssText='width:100%;min-height:220px;padding:11px 13px;background:rgba(0,0,0,.25);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:ui-monospace,Menlo,monospace;font-size:.82rem;';
    var rc=document.createElement('input');rc.type='checkbox';rc.checked=!!doc.requiresReconsent;rc.disabled=!editable;
    box.appendChild(field('Title',title));box.appendChild(field('Plain-language summary',summary));box.appendChild(field('Body (Markdown)',bodyEl));
    var rcWrap=document.createElement('label');rcWrap.style.cssText='display:flex;gap:8px;align-items:center;font-size:.86rem;margin:8px 0;text-transform:none;letter-spacing:0;color:var(--text);';rcWrap.appendChild(rc);rcWrap.appendChild(document.createTextNode('Require existing users to re-accept this version'));box.appendChild(rcWrap);
    var actions=document.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;';
    if(editable){
      var save=document.createElement('button');save.className='btn btn-ghost btn-sm';save.textContent='Save draft';
      save.onclick=function(){legalAction('/legal/documents/'+encodeURIComponent(doc.id),{method:'PUT',body:{title:title.value,summary:summary.value,bodyMarkdown:bodyEl.value,requiresReconsent:rc.checked}},'Draft saved.');};
      actions.appendChild(save);
      if(doc.status==='draft'){var rev=document.createElement('button');rev.className='btn btn-ghost btn-sm';rev.textContent='Mark legal review';rev.onclick=function(){legalAction('/legal/documents/'+encodeURIComponent(doc.id)+'/review',{},'Marked legal review required.');};actions.appendChild(rev);}
      var effInput=document.createElement('input');effInput.type='date';effInput.style.cssText='padding:6px 10px;background:rgba(0,0,0,.25);border:1px solid var(--border);border-radius:8px;color:var(--text);width:auto;';
      var pub=document.createElement('button');pub.className='btn btn-red btn-sm';pub.textContent='Publish';
      pub.onclick=function(){if(!confirm('Publish v'+doc.version+' of '+doc.kind+'? This supersedes the current published version and is immutable.'))return;legalAction('/legal/documents/'+encodeURIComponent(doc.id)+'/publish',{method:'POST',body:effInput.value?{effectiveDate:effInput.value}:{}},'Published.');};
      actions.appendChild(effInput);actions.appendChild(pub);
    }
    if(doc.status!=='published'){var arch=document.createElement('button');arch.className='btn btn-ghost btn-sm';arch.textContent='Archive';arch.onclick=function(){legalAction('/legal/documents/'+encodeURIComponent(doc.id)+'/archive',{},'Archived.');};actions.appendChild(arch);}
    var cmp=document.createElement('button');cmp.className='btn btn-ghost btn-sm';cmp.textContent='Compare with previous';cmp.onclick=function(){compareVersion(doc.id);};actions.appendChild(cmp);
    box.appendChild(actions);
  }
  async function compareVersion(id){
    var r=await api('/legal/documents/'+encodeURIComponent(id)+'/compare');if(!r.ok){legalMsg('Compare failed.',false);return;}
    var d=await r.json();var view=document.getElementById('legalPreview');view.textContent='';
    var grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:12px;';
    function col(label,body){var c=document.createElement('div');var h=document.createElement('div');h.style.cssText='font-size:.75rem;color:var(--muted);text-transform:uppercase;margin-bottom:6px;';h.textContent=label;var pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;font-size:.78rem;background:rgba(0,0,0,.3);padding:10px;border-radius:8px;max-height:40vh;overflow:auto;';pre.textContent=body;c.appendChild(h);c.appendChild(pre);return c;}
    grid.appendChild(col('Previous'+(d.previous?' v'+d.previous.version:' (none)'),d.previous?d.previous.bodyMarkdown:'(no earlier version)'));
    grid.appendChild(col('Current v'+d.current.version,d.current.bodyMarkdown));
    view.appendChild(grid);
  }
  async function legalAction(path,opts,okText){
    opts=opts||{};var method=opts.method||'POST';
    legalMsg('Working…');
    var r=await api(path,{method:method,headers:{'Content-Type':'application/json'},body:JSON.stringify(opts.body||{})});
    var x=await r.json().catch(function(){return{};});
    if(r.ok){legalMsg(okText||'Done.',true);await loadLegal();}
    else{legalMsg((x.error&&x.error.message)||'Action failed.',false);}
  }

  // ---- Platform privacy requests ----
  var PPRIV_NEXT={pending_verification:['withdrawn','closed'],received:['in_review','identity_verification_required','withdrawn','closed'],identity_verification_required:['in_review','awaiting_requester','denied','withdrawn','closed'],in_review:['awaiting_requester','identity_verification_required','fulfilled','partially_fulfilled','denied','withdrawn','closed'],awaiting_requester:['in_review','fulfilled','partially_fulfilled','denied','withdrawn','closed'],fulfilled:['closed'],partially_fulfilled:['in_review','fulfilled','closed'],denied:['in_review','closed'],withdrawn:['closed'],closed:[]};
  function pprivMsg(t,ok){var m=document.getElementById('pprivMsg');if(!m)return;m.style.color=ok===true?'#4ade80':ok===false?'#f87171':'';m.textContent=t||'';}
  function pretty(s){return String(s||'').replace(/_/g,' ');}
  async function loadPPriv(){
    var r=await api('/privacy-requests');if(!r.ok)return;var d=await r.json();
    var host=document.getElementById('pprivList');host.innerHTML='';
    var rows=d.requests||[];if(!rows.length){host.innerHTML='<div class="empty">No platform privacy requests.</div>';return;}
    var t=document.createElement('table');var tb=document.createElement('tbody');
    rows.forEach(function(rq){var tr=document.createElement('tr');
      var td1=document.createElement('td');td1.innerHTML='<div class="o-name">'+esc(rq.id.slice(0,8).toUpperCase())+'</div><div class="td-sub">'+esc(pretty(rq.category))+' · '+(rq.verificationState==='email_verified'?'verified':'unverified')+'</div>';
      var td2=document.createElement('td');var p=document.createElement('span');p.className='badge active';p.textContent=pretty(rq.status);td2.appendChild(p);
      var td3=document.createElement('td');td3.textContent=(rq.createdAt||'').slice(0,10);
      var td4=document.createElement('td');var b=document.createElement('button');b.className='btn btn-ghost btn-sm';b.textContent='Open';b.onclick=function(){openPPriv(rq.id);};td4.appendChild(b);
      tr.appendChild(td1);tr.appendChild(td2);tr.appendChild(td3);tr.appendChild(td4);tb.appendChild(tr);});
    t.appendChild(tb);host.appendChild(t);
  }
  async function openPPriv(id){var r=await api('/privacy-requests/'+encodeURIComponent(id));if(!r.ok){pprivMsg('Could not open.',false);return;}var d=await r.json();var rq=d.request;var box=document.getElementById('pprivDetail');box.innerHTML='';
    var w=document.createElement('div');w.style.cssText='margin-top:10px;padding:14px;border:1px solid var(--border);border-radius:12px;';
    w.innerHTML='<div style="font-weight:800">Request '+esc(rq.id.slice(0,8).toUpperCase())+'</div><div class="td-sub">'+esc(pretty(rq.category))+' · from '+esc(rq.name)+' &lt;'+esc(rq.email)+'&gt; · '+(rq.verificationState==='email_verified'?'verified':'unverified')+'</div>';
    if(rq.verifyEmailState&&rq.verifyEmailState!=='sent'){var vem=document.createElement('div');vem.className='td-sub';vem.style.cssText='margin-top:4px;color:'+(rq.verifyEmailState==='failed'?'#f87171':'inherit');vem.textContent='Verification email: '+(rq.verifyEmailState==='failed'?'FAILED to send':rq.verifyEmailState==='logged'?'no provider configured (not delivered)':'pending')+(rq.verifyEmailAttempts?' · '+rq.verifyEmailAttempts+' attempt(s)':'');w.appendChild(vem);}
    var desc=document.createElement('div');desc.style.cssText='margin:10px 0;padding:10px;background:rgba(0,0,0,.25);border-radius:8px;white-space:pre-wrap;font-size:.9rem;';desc.textContent=rq.description;w.appendChild(desc);
    var next=PPRIV_NEXT[rq.status]||[];
    if(next.length){var row=document.createElement('div');row.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;';
      var sel=document.createElement('select');sel.style.cssText='padding:8px 10px;background:rgba(0,0,0,.25);border:1px solid var(--border);border-radius:8px;color:var(--text);';next.forEach(function(s){var o=document.createElement('option');o.value=s;o.textContent=pretty(s);sel.appendChild(o);});
      var reason=document.createElement('input');reason.placeholder='Explanation (required to fulfill/deny)';reason.style.cssText='flex:1;min-width:180px;padding:8px 10px;background:rgba(0,0,0,.25);border:1px solid var(--border);border-radius:8px;color:var(--text);';
      var apply=document.createElement('button');apply.className='btn btn-red btn-sm';apply.textContent='Apply';apply.onclick=function(){var to=sel.value;var sub=(to==='fulfilled'||to==='partially_fulfilled'||to==='denied');if(sub&&!reason.value.trim()){pprivMsg('An explanation is required.',false);return;}if(!confirm('Change status to '+pretty(to)+'?'))return;pprivAct('/privacy-requests/'+rq.id+'/transition',{to:to,resolutionSummary:reason.value.trim()||undefined});};
      row.appendChild(sel);row.appendChild(reason);row.appendChild(apply);w.appendChild(row);}
    box.appendChild(w);
  }
  async function pprivAct(path,body){pprivMsg('Working…');var r=await api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});var x=await r.json().catch(function(){return{};});if(r.ok){pprivMsg('Done.',true);await loadPPriv();if(x.request)openPPriv(x.request.id);}else pprivMsg((x.error&&x.error.message)||'Failed.',false);}

  async function boot(){
    var me=await api('/me');
    if(me.ok){var d=await me.json();document.getElementById('who').textContent=esc(d.admin&&d.admin.email);
      show('login',false);show('console',true);document.getElementById('logout').style.display='';
      await loadStats();await loadAnalytics();await loadHealth();await loadOrgs();await loadLegal();await loadPPriv();await loadDocs();}
    else{show('login',true);show('console',false);}
  }
  document.getElementById('loginForm').addEventListener('submit',async function(e){
    e.preventDefault();var m=document.getElementById('lmsg');m.className='msg';m.textContent='Signing in…';
    var r=await api('/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:document.getElementById('email').value.trim(),password:document.getElementById('password').value})});
    if(r.ok){boot();}else{var x=await r.json().catch(function(){return{};});m.className='msg err';m.textContent=(x.error&&x.error.message)||'Sign in failed.';}
  });
  document.getElementById('logout').addEventListener('click',async function(){await api('/logout',{method:'POST'});location.reload();});
  document.getElementById('cpBtn').addEventListener('click',async function(){
    var cur=document.getElementById('cpCur'),nw=document.getElementById('cpNew'),m=document.getElementById('cpMsg');
    if(!cur.value||nw.value.length<8){m.style.color='#f87171';m.textContent='Enter your current password and a new one of at least 8 characters.';return;}
    m.style.color='';m.textContent='Updating\\u2026';
    var r=await api('/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword:cur.value,newPassword:nw.value})});
    var x=await r.json().catch(function(){return{};});
    if(r.ok){m.style.color='#4ade80';m.textContent='Password updated. Use it next time you sign in.';cur.value='';nw.value='';}
    else{m.style.color='#f87171';m.textContent=(x.error&&x.error.message)||'Could not update password.';}
  });
  boot();
</script>
</body></html>`;
}
