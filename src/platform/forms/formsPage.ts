/**
 * Owner/admin product UI for configuring lead-capture forms — the customer-
 * operational surface for the forms-settings API. Self-contained (inline CSS +
 * vanilla JS, no external assets), it talks to `/api/platform/forms`,
 * `/api/platform/drip/sequences`, and `/api/platform/files`, so a normal customer
 * can configure — without touching the database or raw API — form fields, allowed
 * external origins, consent checkbox wording + version + double opt-in, a drip
 * sequence chosen ONLY from their own sequences, and a lead magnet (redirect URL
 * or a tenant-owned PDF). Marketing stays disabled server-side regardless; this
 * page only records configuration. All interpolation is XSS-safe (esc()).
 */

export function formsPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Forms - All Elite Cloud</title>
<style>
  :root { --bg:#0f1420; --panel:#172033; --panel2:#1e293f; --line:#2b3855; --ink:#e7ecf6; --muted:#93a1bf; --accent:#6ea8fe; --warn:#f2b45a; --ok:#6cd08a; --bad:#f2726e; --focus:#ffd166; }
  * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  header.bar { display:flex; flex-wrap:wrap; gap:.5rem 1rem; align-items:baseline; padding:1rem 1.25rem; border-bottom:1px solid var(--line); background:var(--panel); }
  header.bar h1 { font-size:1.15rem; margin:0; } header.bar .sub { color:var(--muted); font-size:.85rem; }
  main { max-width:1000px; margin:0 auto; padding:1.25rem; display:grid; grid-template-columns:280px 1fr; gap:1.25rem; }
  @media (max-width:760px){ main { grid-template-columns:1fr; } }
  section { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:1rem 1.1rem; }
  h2 { font-size:1rem; margin:0 0 .75rem; } h3 { font-size:.9rem; margin:1rem 0 .5rem; color:var(--muted); }
  label { display:block; font-size:.8rem; color:var(--muted); margin:.6rem 0 .2rem; }
  input,select,textarea,button { font:inherit; color:var(--ink); background:var(--panel2); border:1px solid var(--line); border-radius:7px; padding:.45rem .55rem; width:100%; }
  textarea { min-height:3rem; resize:vertical; } button { width:auto; background:var(--accent); color:#0b1220; border:0; font-weight:600; cursor:pointer; }
  button.sec { background:var(--panel2); color:var(--ink); border:1px solid var(--line); }
  :focus-visible { outline:3px solid var(--focus); outline-offset:2px; }
  .row { display:flex; gap:.6rem; align-items:center; } .row input[type=checkbox]{ width:auto; }
  ul.list { list-style:none; margin:0; padding:0; } ul.list li { padding:.5rem .2rem; border-bottom:1px solid var(--line); cursor:pointer; }
  ul.list li:hover,ul.list li:focus { background:var(--panel2); } ul.list li .st { color:var(--muted); font-size:.78rem; }
  .warn { color:var(--warn); font-size:.8rem; } .msg { margin:.6rem 0; padding:.5rem .7rem; border-radius:7px; display:none; }
  .msg.ok { display:block; background:rgba(108,208,138,.14); border:1px solid var(--ok); } .msg.err { display:block; background:rgba(242,114,110,.14); border:1px solid var(--bad); }
  fieldset { border:1px solid var(--line); border-radius:8px; margin:.5rem 0; padding:.5rem .8rem; } legend { color:var(--muted); font-size:.8rem; padding:0 .4rem; }
  .hidden { display:none; }
</style>
</head>
<body>
  <header class="bar"><h1>Forms &amp; Lead Capture</h1><span class="sub">Configure your capture forms, consent, and lead magnets</span></header>
  <main>
    <section aria-labelledby="list-h">
      <h2 id="list-h">Your forms</h2>
      <ul class="list" id="forms" aria-live="polite"></ul>
      <p id="signin" class="warn hidden">Please sign in to manage forms.</p>
      <button type="button" id="new" style="margin-top:.75rem;">New form</button>
    </section>

    <section aria-labelledby="edit-h">
      <h2 id="edit-h">Configure</h2>
      <form id="form">
        <label for="name">Form name</label>
        <input id="name" required/>

        <label for="fields" style="margin-top:1rem;">Basic fields (one per line: key,label,type,required)</label>
        <textarea id="fields" placeholder="email,Email,email,true&#10;name,Name,text,false"></textarea>

        <fieldset><legend>Allowed external origins</legend>
          <label for="origins">Origins allowed to embed this form (one per line, e.g. https://site.example)</label>
          <textarea id="origins" placeholder="https://institute.example"></textarea>
          <div class="row"><input type="checkbox" id="anyOrigin"/><label for="anyOrigin" style="margin:0;">Allow ANY origin</label></div>
          <p class="warn">Allowing any origin lets any website embed this form. Only enable if you understand the risk.</p>
        </fieldset>

        <fieldset><legend>Marketing consent</legend>
          <div class="row"><input type="checkbox" id="consentEnabled"/><label for="consentEnabled" style="margin:0;">Collect marketing consent</label></div>
          <label for="consentField">Consent field key</label><input id="consentField" placeholder="consent"/>
          <label for="consentWording">Consent checkbox wording (recorded as evidence)</label><textarea id="consentWording"></textarea>
          <label for="consentVersion">Consent copy version</label><input id="consentVersion" placeholder="2025-08"/>
          <div class="row"><input type="checkbox" id="doubleOptIn" checked/><label for="doubleOptIn" style="margin:0;">Require double opt-in</label></div>
          <label for="sequence">Drip sequence a confirmed opt-in enrolls into (your sequences only)</label>
          <select id="sequence"><option value="">None (capture consent only — no sending)</option></select>
          <p class="warn">Marketing sending stays OFF until it is enabled for your account. This only records configuration.</p>
        </fieldset>

        <fieldset><legend>Lead magnet</legend>
          <label for="magnetMode">Delivery mode</label>
          <select id="magnetMode"><option value="">None</option><option value="redirect">Redirect to URL</option><option value="download">Download a PDF (transactional email/link)</option></select>
          <label for="magnetTitle">Title</label><input id="magnetTitle"/>
          <div id="redirectWrap" class="hidden"><label for="magnetUrl">Redirect URL (https only)</label><input id="magnetUrl" placeholder="https://site.example/guide"/></div>
          <div id="fileWrap" class="hidden"><label for="magnetFile">PDF (your uploaded files only)</label><select id="magnetFile"><option value="">Select a PDF…</option></select></div>
        </fieldset>

        <div class="msg" id="msg" role="status" aria-live="polite"></div>
        <div class="row" style="margin-top:.5rem;"><button type="submit">Save form</button><button type="button" class="sec" id="cancel">Clear</button></div>
      </form>
    </section>
  </main>
<script>
(function(){
  var API="/api/platform"; var editingId=null;
  var esc=function(s){var d=document.createElement("div");d.textContent=s==null?"":String(s);return d.innerHTML;};
  var $=function(id){return document.getElementById(id);};
  function j(u,o){o=o||{};o.credentials="include";o.headers=Object.assign({"Content-Type":"application/json"},o.headers||{});return fetch(API+u,o).then(function(r){return r.json().then(function(b){return{ok:r.ok,status:r.status,body:b};});});}

  function loadSequences(){ return j("/drip/sequences").then(function(r){ if(!r.ok)return; var sel=$("sequence"); (r.body.sequences||[]).forEach(function(s){ var o=document.createElement("option"); o.value=s.id; o.textContent=s.name; sel.appendChild(o); }); }); }
  function loadFiles(){ return j("/files").then(function(r){ if(!r.ok)return; var sel=$("magnetFile"); (r.body.files||[]).filter(function(f){return (f.mimeType||"").indexOf("pdf")>=0;}).forEach(function(f){ var o=document.createElement("option"); o.value=f.id; o.textContent=f.name; sel.appendChild(o); }); }); }
  function loadForms(){ return j("/forms").then(function(r){ var ul=$("forms"); ul.innerHTML=""; if(r.status===401){ $("signin").classList.remove("hidden"); return; } (r.body.forms||[]).forEach(function(f){ var li=document.createElement("li"); li.tabIndex=0; li.innerHTML="<div>"+esc(f.name)+"</div><div class=st>"+esc(f.status)+" · /f/"+esc(f.slug)+"</div>"; li.onclick=function(){edit(f);}; li.onkeydown=function(e){if(e.key==="Enter")edit(f);}; ul.appendChild(li); }); }); }

  function magnetModeChanged(){ var m=$("magnetMode").value; $("redirectWrap").classList.toggle("hidden",m!=="redirect"); $("fileWrap").classList.toggle("hidden",m!=="download"); }
  $("magnetMode").addEventListener("change",magnetModeChanged);

  function fieldsToText(fields){ return (fields||[]).map(function(f){return [f.key,f.label,f.type,f.required].join(",");}).join("\\n"); }
  function textToFields(t){ return t.split(/\\n/).map(function(l){return l.trim();}).filter(Boolean).map(function(l){var p=l.split(",");return {key:(p[0]||"").trim(),label:(p[1]||"").trim(),type:(p[2]||"text").trim(),required:String(p[3]).trim()==="true"};}).filter(function(f){return f.key&&f.label;}); }

  function edit(f){ editingId=f.id; var s=f.settings||{}; $("name").value=f.name||""; $("fields").value=fieldsToText(f.fields);
    $("origins").value=(s.allowedOrigins||[]).join("\\n"); $("anyOrigin").checked=!!s.allowAnyOrigin;
    var c=s.consent||{}; $("consentEnabled").checked=!!c.enabled; $("consentField").value=c.fieldKey||""; $("consentWording").value=c.wording||""; $("consentVersion").value=c.version||""; $("doubleOptIn").checked=c.doubleOptIn!==false; $("sequence").value=c.sequenceId||"";
    var m=s.leadMagnet||{}; $("magnetMode").value=m.mode||""; $("magnetTitle").value=m.title||""; $("magnetUrl").value=m.redirectUrl||""; $("magnetFile").value=m.fileId||""; magnetModeChanged();
    $("edit-h").textContent="Configure — "+f.name;
  }
  function clearForm(){ editingId=null; $("form").reset(); $("doubleOptIn").checked=true; magnetModeChanged(); $("edit-h").textContent="Configure"; }
  $("new").addEventListener("click",clearForm); $("cancel").addEventListener("click",clearForm);

  function buildSettings(){ var s={};
    var origins=$("origins").value.split(/\\n/).map(function(x){return x.trim();}).filter(Boolean); if(origins.length)s.allowedOrigins=origins;
    if($("anyOrigin").checked)s.allowAnyOrigin=true;
    if($("consentEnabled").checked){ s.consent={enabled:true,fieldKey:$("consentField").value.trim(),wording:$("consentWording").value.trim(),version:$("consentVersion").value.trim()||"1",doubleOptIn:$("doubleOptIn").checked}; var seq=$("sequence").value; if(seq)s.consent.sequenceId=seq; }
    var mode=$("magnetMode").value; if(mode){ s.leadMagnet={id:"magnet",title:$("magnetTitle").value.trim()||"Lead magnet",mode:mode}; if(mode==="redirect")s.leadMagnet.redirectUrl=$("magnetUrl").value.trim(); if(mode==="download")s.leadMagnet.fileId=$("magnetFile").value; }
    return s;
  }
  $("form").addEventListener("submit",function(e){ e.preventDefault(); var msg=$("msg"); msg.className="msg";
    var payload={name:$("name").value.trim(),fields:textToFields($("fields").value),settings:buildSettings()};
    var p=editingId?j("/forms/"+encodeURIComponent(editingId),{method:"PATCH",body:JSON.stringify(payload)}):j("/forms",{method:"POST",body:JSON.stringify(payload)});
    p.then(function(r){ if(r.ok){ msg.className="msg ok"; msg.textContent="Saved."; editingId=(r.body.form&&r.body.form.id)||editingId; loadForms(); } else { msg.className="msg err"; msg.textContent=(r.body.error&&r.body.error.message)||"Could not save."; } })
     .catch(function(){ msg.className="msg err"; msg.textContent="Network error."; });
  });

  loadSequences(); loadFiles(); loadForms(); magnetModeChanged();
})();
</script>
</body>
</html>`;
}
