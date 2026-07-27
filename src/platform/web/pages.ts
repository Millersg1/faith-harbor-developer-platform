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
    <div class="alt"><a href="/forgot">Forgot your password?</a></div>
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
  // Fetch inputs explicitly — the "name" field's id collides with the built-in
  // window.name (a string), so the bare global would not be the element.
  var orgEl=document.getElementById('org');
  var nameEl=document.getElementById('name');
  var emailEl=document.getElementById('email');
  var pwEl=document.getElementById('password');
  f.addEventListener('submit',async function(e){
    e.preventDefault(); msg.className='msg'; msg.textContent='Creating…';
    try{
      var r=await fetch('/auth/signup',{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({organizationName:orgEl.value.trim(),name:nameEl.value.trim(),
          email:emailEl.value.trim(),password:pwEl.value})});
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

export function forgotPasswordPage(): string {
  const body = `
  <div class="center"><form class="card" id="f">
    <div class="brand">${LOGO} All Elite Cloud</div>
    <h1>Reset your password</h1>
    <p class="sub">Enter your organization and email. We'll send a reset link.</p>
    <label for="org">Organization</label>
    <input id="org" placeholder="your-organization" autocomplete="organization" required />
    <label for="email">Email</label>
    <input id="email" type="email" autocomplete="email" required />
    <div class="msg" id="msg"></div>
    <button class="btn" type="submit">Send reset link</button>
    <div class="alt">Remembered it? <a href="/login">Back to sign in</a></div>
  </form></div>`;
  const script = `
  var f=document.getElementById('f'),msg=document.getElementById('msg');
  f.addEventListener('submit',async function(e){
    e.preventDefault(); msg.className='msg'; msg.textContent='Sending…';
    try{
      var r=await fetch('/auth/forgot-password',{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json','X-Org-Slug':org.value.trim()},
        body:JSON.stringify({email:email.value.trim()})});
      var d=await r.json().catch(function(){return {};});
      if(r.ok){msg.className='msg ok';msg.textContent=d.message||'If that email has an account, a reset link is on its way.';f.querySelector('button').disabled=true;}
      else{msg.className='msg err';msg.textContent=(d.error&&d.error.message)||'Could not send the reset link.';}
    }catch(_){msg.className='msg err';msg.textContent='Network error.';}
  });`;
  return layout({
    title: "Reset password · All Elite Cloud",
    body,
    script,
  });
}

export function resetPasswordPage(): string {
  const body = `
  <div class="center"><form class="card" id="f">
    <div class="brand">${LOGO} All Elite Cloud</div>
    <h1>Choose a new password</h1>
    <p class="sub">Enter your organization and a new password for your account.</p>
    <label for="org">Organization</label>
    <input id="org" placeholder="your-organization" autocomplete="organization" required />
    <label for="password">New password</label>
    <input id="password" type="password" autocomplete="new-password" placeholder="At least 8 characters" required />
    <label for="confirm">Confirm password</label>
    <input id="confirm" type="password" autocomplete="new-password" required />
    <div class="msg" id="msg"></div>
    <button class="btn" type="submit">Set new password</button>
    <div class="alt"><a href="/login">Back to sign in</a></div>
  </form></div>`;
  const script = `
  var f=document.getElementById('f'),msg=document.getElementById('msg');
  // Resolve inputs explicitly: the confirm field's id ("confirm") collides with
  // the built-in window.confirm, so the bare global does NOT reference the
  // element — always fetch via getElementById.
  var orgEl=document.getElementById('org');
  var pwEl=document.getElementById('password');
  var confirmEl=document.getElementById('confirm');
  var token=new URLSearchParams(location.search).get('token')||'';
  if(!token){msg.className='msg err';msg.textContent='This reset link is missing its token. Request a new one.';}
  f.addEventListener('submit',async function(e){
    e.preventDefault(); msg.className='msg';
    if(pwEl.value!==confirmEl.value){msg.className='msg err';msg.textContent='Passwords do not match.';return;}
    msg.textContent='Saving…';
    try{
      var r=await fetch('/auth/reset-password',{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json','X-Org-Slug':orgEl.value.trim()},
        body:JSON.stringify({token:token,newPassword:pwEl.value})});
      var d=await r.json().catch(function(){return {};});
      if(r.ok){msg.className='msg ok';msg.textContent='Password updated. Redirecting to sign in…';setTimeout(function(){window.location='/login';},1500);}
      else{msg.className='msg err';msg.textContent=(d.error&&d.error.message)||'Could not reset your password.';}
    }catch(_){msg.className='msg err';msg.textContent='Network error.';}
  });`;
  return layout({
    title: "Set new password · All Elite Cloud",
    body,
    script,
  });
}

/**
 * The public share page for a form. Self-contained; posts submissions as JSON
 * to the public submit endpoint and shows the form's confirmation on success.
 */
export function formPublicPage(form: {
  name: string;
  slug: string;
  fields: Array<{
    key: string;
    type: string;
    label: string;
    required: boolean;
    helpText?: string;
    options?: string[];
  }>;
  confirmationMessage: string;
}): string {
  const esc = (s: string): string =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const fieldHtml = form.fields
    .map((f) => {
      const req = f.required
        ? " required"
        : "";
      const help = f.helpText
        ? `<div class="hint" style="margin-top:2px;">${esc(f.helpText)}</div>`
        : "";
      let control = "";

      if (f.type === "textarea") {
        control = `<textarea id="f_${esc(f.key)}" data-key="${esc(f.key)}"${req} rows="4" style="width:100%;"></textarea>`;
      } else if (f.type === "select") {
        const opts = (f.options ?? [])
          .map(
            (o) =>
              `<option value="${esc(o)}">${esc(o)}</option>`,
          )
          .join("");
        control = `<select id="f_${esc(f.key)}" data-key="${esc(f.key)}"${req}><option value="">Choose…</option>${opts}</select>`;
      } else if (
        f.type === "checkbox" ||
        f.type === "consent"
      ) {
        control = `<label style="display:flex;gap:8px;align-items:center;font-weight:400;"><input type="checkbox" id="f_${esc(f.key)}" data-key="${esc(f.key)}" data-bool="1"${req} /> ${esc(f.label)}</label>`;
        return `<div class="f">${control}${help}</div>`;
      } else {
        const t =
          f.type === "email"
            ? "email"
            : f.type === "phone"
              ? "tel"
              : f.type === "number"
                ? "number"
                : f.type === "date"
                  ? "date"
                  : "text";
        control = `<input type="${t}" id="f_${esc(f.key)}" data-key="${esc(f.key)}"${req} />`;
      }

      return `<div class="f"><label for="f_${esc(f.key)}">${esc(f.label)}${f.required ? " *" : ""}</label>${control}${help}</div>`;
    })
    .join("");

  const body = `
  <div class="center"><form class="card" id="pf" style="max-width:520px;">
    <h1>${esc(form.name)}</h1>
    ${fieldHtml}
    <div class="msg" id="pfmsg"></div>
    <button class="btn" type="submit">Submit</button>
  </form></div>`;

  const script = `
  var f=document.getElementById('pf'),msg=document.getElementById('pfmsg');
  var SLUG=${JSON.stringify(form.slug)};
  f.addEventListener('submit',async function(e){
    e.preventDefault(); msg.className='msg'; msg.textContent='Sending…';
    var data={};
    var els=f.querySelectorAll('[data-key]');
    for(var i=0;i<els.length;i++){var el=els[i];var k=el.getAttribute('data-key');data[k]=el.getAttribute('data-bool')?el.checked:el.value;}
    try{
      var r=await fetch('/api/public/forms/'+encodeURIComponent(SLUG)+'/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:data})});
      var d=await r.json().catch(function(){return {};});
      if(r.ok){f.innerHTML='<h1>Thank you</h1><p>'+((d.confirmationMessage)||'Your submission was received.').replace(/</g,'&lt;')+'</p>';}
      else{msg.className='msg err';msg.textContent=(d.error&&d.error.message)||'Could not submit.';}
    }catch(_){msg.className='msg err';msg.textContent='Network error.';}
  });`;

  return layout({
    title: esc(form.name),
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
      <button class="btn ghost" id="openPalette" title="Search (Ctrl/Cmd+K)" aria-label="Search" style="width:auto;padding:8px 12px;">&#128269; Search</button>
      <div style="position:relative;">
        <button class="btn ghost" id="bell" title="Notifications" aria-label="Notifications" style="width:auto;padding:8px 12px;position:relative;">
          &#128276;<span id="bellCount" style="display:none;position:absolute;top:-4px;right:-4px;background:#e5484d;color:#fff;border-radius:10px;font-size:0.68rem;line-height:1;padding:3px 6px;font-weight:700;">0</span>
        </button>
        <div id="notifPanel" role="menu" style="display:none;position:absolute;right:0;top:44px;width:340px;max-width:88vw;max-height:60vh;overflow:auto;background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.18);z-index:50;">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--line,#e5e7eb);">
            <strong style="font-size:0.9rem;">Notifications</strong>
            <button class="btn ghost" id="markAllRead" style="width:auto;padding:4px 8px;font-size:0.78rem;">Mark all read</button>
          </div>
          <div id="notifList"><div class="empty" style="padding:16px;">Loading…</div></div>
        </div>
      </div>
      <button class="btn ghost" id="logout">Sign out</button>
    </div>
  </div></div>
  <div id="palette" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:100;padding:10vh 16px 16px;">
    <div style="max-width:580px;margin:0 auto;background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,0.35);overflow:hidden;">
      <input id="paletteInput" placeholder="Search clients, leads, invoices… or type a command" autocomplete="off" spellcheck="false" style="width:100%;box-sizing:border-box;border:0;outline:0;padding:16px 18px;font-size:1rem;background:transparent;color:inherit;border-bottom:1px solid var(--line,#eee);" />
      <div id="paletteResults" style="max-height:56vh;overflow:auto;"></div>
      <div style="padding:8px 14px;font-size:0.72rem;opacity:0.6;border-top:1px solid var(--line,#eee);">&#8593;&#8595; to navigate · Enter to open · Esc to close</div>
    </div>
  </div>
  <div id="journey" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:100;padding:8vh 16px 16px;">
    <div style="max-width:600px;margin:0 auto;background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,0.35);overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line,#eee);">
        <strong id="journeyTitle" style="font-size:0.95rem;">Journey</strong>
        <button class="btn ghost" id="journeyClose" style="width:auto;padding:4px 10px;">Close</button>
      </div>
      <div id="journeyBody" style="max-height:64vh;overflow:auto;padding:6px 6px 10px;"><div class="empty" style="padding:16px;">Loading…</div></div>
    </div>
  </div>
  <div class="wrap">
    <div class="secnav" id="secnav"></div>
    <div class="panel" id="onboardingPanel" style="margin-bottom:18px;display:none;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;">
        <div>
          <h2 style="margin-bottom:4px;">Get started <span class="pill" id="onbCount"></span></h2>
          <p class="hint" style="margin-bottom:0;">A few steps to get the most out of your workspace.</p>
        </div>
        <button class="btn btn-ghost" id="onbDismiss" style="width:auto;font-size:0.78rem;">Hide</button>
      </div>
      <div style="height:8px;background:var(--line,#eee);border-radius:99px;overflow:hidden;margin:14px 0 4px;">
        <div id="onbBar" style="height:100%;width:0;background:var(--accent);transition:width .3s;"></div>
      </div>
      <div class="list" id="onbList"><div class="empty">Loading…</div></div>
    </div>
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
    <div class="panel" id="activityPanel" style="margin-bottom:18px;">
      <h2>Recent activity</h2>
      <p class="hint">The latest things that happened across your workspace.</p>
      <div class="list" id="activityFeed"><div class="empty">Loading…</div></div>
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
        <h2>Marketplace <span class="pill">templates</span></h2>
        <p class="hint">Start from a ready-made, industry-specific website template. Using one creates a draft you can then generate and publish.</p>
        <p class="hint" style="font-style:italic;">Any preview images are AI-generated <strong>samples</strong> — each site is generated fresh for your business, so your result will be unique and may differ from the sample shown.</p>
        <div class="sub" style="margin:6px 0 4px;font-weight:600;">Industry editions</div>
        <p class="hint" style="margin-top:0;">One click sets up a whole line of business — a website draft, your brand accent, and ready-to-use AI assistants.</p>
        <div class="list" id="editions"><div class="empty">Loading…</div></div>
        <div class="sub" style="margin:14px 0 4px;font-weight:600;">Website templates</div>
        <div class="list" id="marketplace"><div class="empty">Loading…</div></div>
        <div class="msg" id="mktmsg"></div>
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
      <div class="panel" id="calendarPanel">
        <h2>Calendar</h2>
        <p class="hint">Upcoming events, appointments, and deadlines.</p>
        <div class="list" id="calendarEvents"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="cetitle">Event</label><input id="cetitle" placeholder="Kickoff call" /></div>
          <div class="f" style="max-width:200px;"><label for="cewhen">When</label><input id="cewhen" type="datetime-local" /></div>
          <button class="btn" id="addEvent" style="width:auto;">Add event</button>
        </div>
        <div class="msg" id="cemsg"></div>
      </div>
      <div class="panel" id="filesPanel">
        <h2>Files</h2>
        <p class="hint" id="filesUsage">Upload and manage your documents and assets.</p>
        <div class="list" id="files"><div class="empty">Loading…</div></div>
        <div class="inline" style="align-items:center;">
          <input id="fileInput" type="file" style="max-width:280px;" />
          <button class="btn" id="uploadFile" style="width:auto;">Upload</button>
        </div>
        <div class="msg" id="filemsg"></div>
      </div>
      <div class="panel" id="formsPanel" style="display:none;">
        <h2>Forms <span class="pill">owner/admin</span></h2>
        <p class="hint">Publish a public form to capture leads. Share the link or embed it on any site.</p>
        <div class="list" id="forms"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="fmname">New form</label><input id="fmname" placeholder="Contact us" /></div>
          <div class="f" style="max-width:180px;"><label for="fmtemplate">Template</label><select id="fmtemplate"><option value="contact">Contact</option><option value="quote">Quote request</option><option value="intake">Client intake</option></select></div>
          <button class="btn" id="addForm" style="width:auto;">Create form</button>
        </div>
        <div class="msg" id="fmmsg"></div>
      </div>
      <div class="panel" id="workflowsPanel" style="display:none;">
        <h2>Automations <span class="pill">owner/admin</span></h2>
        <p class="hint">When something happens, run steps automatically — notify your team, email the contact, enroll them in a sequence.</p>
        <div class="list" id="workflows"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="wftemplate">New automation</label><select id="wftemplate">
            <option value="lead_notify">New lead → notify team</option>
            <option value="lead_welcome">New lead → welcome email</option>
            <option value="form_reply">Form submission → notify + auto-reply</option>
            <option value="invoice_paid">Invoice paid → notify team</option>
            <option value="proposal_accepted">Proposal accepted → notify team</option>
            <option value="ticket_created">New support ticket → notify team</option>
            <option value="client_created">New client → notify team</option>
          </select></div>
          <button class="btn" id="addWorkflow" style="width:auto;">Create</button>
        </div>
        <div class="msg" id="wfmsg"></div>
      </div>
      <div class="panel" id="aiConsolePanel" style="display:none;">
        <h2>AI Command Center</h2>
        <p class="hint">Ask about your business or ask the assistant to do something. It reads live data to answer, and anything that changes data is queued for you to confirm.</p>
        <div class="f" style="max-width:320px;"><label for="aiEmployeeSelect">Assistant</label><select id="aiEmployeeSelect"><option value="">General assistant</option></select></div>
        <div id="aiChatLog" style="display:flex;flex-direction:column;gap:10px;max-height:360px;overflow-y:auto;padding:4px 0;"></div>
        <div class="inline" style="margin-top:8px;">
          <div class="f" style="flex:1;"><label for="aiChatInput">Message</label><input id="aiChatInput" placeholder="e.g. How many leads do we have?" autocomplete="off" /></div>
          <button class="btn" id="aiChatSend" style="width:auto;">Send</button>
        </div>
        <div class="msg" id="aicmsg"></div>
      </div>
      <div class="panel" id="aiToolsPanel" style="display:none;">
        <h2>AI Actions <span class="pill">owner/admin</span></h2>
        <p class="hint">The actions an AI assistant can take on your behalf. Read actions run immediately; actions that change data are proposed here and only run when you confirm them.</p>
        <div class="sub" style="margin:6px 0 4px;font-weight:600;">Awaiting your confirmation</div>
        <div class="list" id="aiPending"><div class="empty">Loading…</div></div>
        <div class="sub" style="margin:14px 0 4px;font-weight:600;">Available actions</div>
        <div class="list" id="aiToolsList"><div class="empty">Loading…</div></div>
        <div class="msg" id="aitmsg"></div>
      </div>
      <div class="panel" id="aiEmployeesPanel" style="display:none;">
        <h2>AI Employees <span class="pill">owner/admin</span></h2>
        <p class="hint">Saved assistants with their own persona and a limited set of actions. Pick one in the Command Center to work with it. An assistant can only ever do less than your own role allows — never more.</p>
        <div class="list" id="aiEmployees"><div class="empty">Loading…</div></div>
        <div class="f"><label for="aeName">Name</label><input id="aeName" placeholder="Sales Assistant" /></div>
        <div class="f"><label for="aeTitle">Title</label><input id="aeTitle" placeholder="Sales" /></div>
        <div class="f"><label for="aePersona">Persona / instructions</label><textarea id="aePersona" rows="3" placeholder="You help qualify and follow up with new leads. Be concise and friendly." style="width:100%;"></textarea></div>
        <div class="f"><label for="aeTools">Limit to actions (optional, comma-separated tool names)</label><input id="aeTools" placeholder="crm.leads.list, crm.leads.create" /></div>
        <button class="btn" id="addEmployee" style="width:auto;">Create assistant</button>
        <div class="msg" id="aemsg"></div>
      </div>
      <div class="panel" id="knowledgePanel" style="display:none;">
        <h2>AI Knowledge Base <span class="pill">owner/admin</span></h2>
        <p class="hint">Add documents, then ask questions grounded in them — answers cite their sources.</p>
        <div class="inline">
          <div class="f"><label for="kbcname">New collection</label><input id="kbcname" placeholder="Policies" /></div>
          <button class="btn" id="addCollection" style="width:auto;">Create</button>
        </div>
        <div class="f"><label for="kbcollection">Collection</label><select id="kbcollection"></select></div>
        <div class="f"><label for="kbdocname">Document name</label><input id="kbdocname" placeholder="Refund policy" /></div>
        <div class="f"><label for="kbdoccontent">Document text</label><textarea id="kbdoccontent" rows="4" placeholder="Paste text content to index…" style="width:100%;"></textarea></div>
        <button class="btn" id="addDocument" style="width:auto;">Add document</button>
        <div class="list" id="kbdocs" style="margin-top:12px;"><div class="empty">No documents.</div></div>
        <div class="f" style="margin-top:12px;"><label for="kbquestion">Ask a question</label><input id="kbquestion" placeholder="What is our refund window?" /></div>
        <button class="btn" id="askKnowledge" style="width:auto;">Ask</button>
        <div class="list" id="kbanswer"></div>
        <div class="msg" id="kbmsg"></div>
      </div>
      <div class="panel" id="emailPanel" style="display:none;">
        <h2>Email <span class="pill">owner/admin</span></h2>
        <p class="hint" id="emailStatus">Send email and view your outbox.</p>
        <div class="list" id="emails"><div class="empty">Loading…</div></div>
        <div class="f"><label for="emto">To</label><input id="emto" type="email" placeholder="someone@example.com" /></div>
        <div class="f"><label for="emsub">Subject</label><input id="emsub" placeholder="Subject" /></div>
        <div class="f"><label for="embody">Message</label><input id="embody" placeholder="Your message" /></div>
        <button class="btn" id="sendEmail" style="width:auto;margin-top:12px;">Send email</button>
        <div class="msg" id="emmsg"></div>
      </div>
      <div class="panel" id="dripPanel" style="display:none;">
        <h2>Autoresponders <span class="pill">owner/admin</span></h2>
        <p class="hint">Automated email sequences. Steps send after a delay; enroll people manually or auto-enroll new leads. Use {{name}} in a step to personalize.</p>
        <div class="list" id="dripSequences"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="dsname">New sequence</label><input id="dsname" placeholder="Welcome series" /></div>
          <div class="f" style="max-width:170px;"><label for="dstrigger">Trigger</label><select id="dstrigger"><option value="manual">Manual</option><option value="lead_created">New lead</option></select></div>
          <button class="btn" id="addSequence" style="width:auto;">Create</button>
        </div>
        <div class="msg" id="dsmsg"></div>
        <h2 style="margin-top:22px;">Enrollments</h2>
        <p class="hint">Recipients moving through your sequences.</p>
        <div class="list" id="dripEnrollments"><div class="empty">Loading…</div></div>
      </div>
      <div class="panel" id="auditPanel" style="display:none;">
        <h2>Security audit log <span class="pill">owner/admin</span></h2>
        <p class="hint">Sign-ins, password changes, and role changes across your workspace.</p>
        <div class="list" id="auditLog"><div class="empty">Loading…</div></div>
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
  async function loadOnboarding(){
    var panel=document.getElementById('onboardingPanel');
    if(!panel)return;
    if(localStorage.getItem('onbHidden')==='1'){panel.style.display='none';return;}
    var r=await api('/api/platform/onboarding'); if(!r.ok){panel.style.display='none';return;}
    var d=await r.json(); var steps=d.steps||[];
    if(!steps.length){panel.style.display='none';return;}
    var bar=document.getElementById('onbBar'); if(bar){bar.style.width=(d.percent||0)+'%';}
    var cnt=document.getElementById('onbCount'); if(cnt){cnt.textContent=(d.completed||0)+' / '+(d.total||0);}
    var list=document.getElementById('onbList'); clear(list);
    steps.forEach(function(s){
      var row=document.createElement('div'); row.className='li';
      row.style.cssText='display:flex;align-items:flex-start;gap:12px;padding:11px 2px;border-bottom:1px solid var(--line,#eee);';
      var mark=document.createElement('div');
      mark.style.cssText='flex:0 0 auto;width:22px;height:22px;border-radius:99px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;'+
        (s.done?'background:var(--accent);color:#fff;':'background:transparent;border:2px solid var(--line,#ddd);color:transparent;');
      mark.textContent=s.done?'\\u2713':'';
      var body=document.createElement('div'); body.style.flex='1';
      var t=document.createElement('div'); t.style.cssText='font-weight:600;font-size:0.9rem;'+(s.done?'text-decoration:line-through;opacity:0.6;':'');
      t.textContent=s.title;
      var desc=document.createElement('div'); desc.className='hint'; desc.style.margin='2px 0 0'; desc.textContent=s.description;
      body.appendChild(t); body.appendChild(desc);
      if(!s.done && s.href){
        var go=document.createElement('a'); go.href=s.href; go.textContent='Start \\u2192';
        go.style.cssText='flex:0 0 auto;font-size:0.8rem;color:var(--accent);text-decoration:none;align-self:center;';
        row.appendChild(mark); row.appendChild(body); row.appendChild(go);
      } else {
        row.appendChild(mark); row.appendChild(body);
      }
      list.appendChild(row);
    });
    if(d.allDone){
      var done=document.createElement('div'); done.className='empty'; done.style.paddingTop='12px';
      done.textContent='\\ud83c\\udf89 You are all set — nicely done.';
      list.appendChild(done);
    }
    panel.style.display='';
    var dismiss=document.getElementById('onbDismiss');
    if(dismiss && !dismiss.dataset.wired){
      dismiss.dataset.wired='1';
      dismiss.addEventListener('click',function(){localStorage.setItem('onbHidden','1');panel.style.display='none';});
    }
  }
  async function loadClients(){
    var r=await api('/api/platform/clients'); if(!r.ok)return;
    var d=await r.json(); clientsCache=d.clients||[];
    renderList('clients',clientsCache,function(c){var row=item(esc(c.name),esc(c.email||''),esc(c.status));row.style.cursor='pointer';row.title='View journey';row.addEventListener('click',function(){openJourney('client',c.id,c.name);});return row;});
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
    var el=document.getElementById('invoices'); clear(el);
    var list=d.invoices||[];
    if(!list.length){el.appendChild(emptyMsg('No invoices yet.'));return;}
    var canPay=(myRole==='owner'||myRole==='admin');
    list.forEach(function(v){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var t=document.createElement('div');t.textContent=esc(v.number)+' · '+money(v.amount);t.style.fontWeight='600';left.appendChild(t);
      row.appendChild(left);
      var actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex:none;align-items:center;';
      var st=document.createElement('span');st.className='pill';st.textContent=esc(v.status);actions.appendChild(st);
      if(canPay){
        var pv=document.createElement('a');pv.className='btn ghost';pv.style.cssText='padding:6px 12px;text-decoration:none;';pv.textContent='Print';
        pv.href='/api/platform/invoices/'+encodeURIComponent(v.id)+'/printable';pv.target='_blank';pv.rel='noopener';actions.appendChild(pv);
        var dl=document.createElement('a');dl.className='btn ghost';dl.style.cssText='padding:6px 12px;text-decoration:none;';dl.textContent='Download PDF';
        dl.href='/api/platform/invoices/'+encodeURIComponent(v.id)+'/pdf';actions.appendChild(dl);
      }
      if(canPay&&v.status!=='paid'){
        var pb=document.createElement('button');pb.className='btn ghost';pb.style.padding='6px 12px';pb.textContent='Mark paid';
        pb.addEventListener('click',function(){markInvoicePaid(v.id);});actions.appendChild(pb);
      }
      row.appendChild(actions);
      el.appendChild(row);
    });
  }
  async function markInvoicePaid(id){
    var r=await api('/api/platform/invoices/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'paid',paidDate:new Date().toISOString()})});
    if(r.ok)loadInvoices();
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
      var nm=document.createElement('div');nm.textContent=esc(l.name);nm.style.fontWeight='600';nm.style.cursor='pointer';nm.title='View journey';nm.addEventListener('click',function(){openJourney('lead',l.id,l.name);});left.appendChild(nm);
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
  async function loadEmails(){
    var r=await api('/api/platform/emails'); if(!r.ok)return;
    var d=await r.json();
    document.getElementById('emailStatus').textContent=d.connected?'Email is connected — messages are delivered.':'No mail server configured yet — messages are recorded in your outbox but not delivered.';
    renderList('emails',(d.emails||[]).slice(0,20),function(m){return item(esc(m.subject),esc(m.to),esc(m.status));});
  }
  async function loadDrip(){
    var r=await api('/api/platform/drip/sequences'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('dripSequences'); clear(el);
    var list=d.sequences||[];
    if(!list.length){el.appendChild(emptyMsg('No sequences yet. Create one below.'));return;}
    list.forEach(function(seq){
      var wrap=document.createElement('div');wrap.className='item';wrap.style.flexDirection='column';wrap.style.alignItems='stretch';wrap.style.gap='8px';
      var row=document.createElement('div');row.style.display='flex';row.style.alignItems='center';row.style.justifyContent='space-between';row.style.gap='8px';
      var left=document.createElement('div');
      var nm=document.createElement('div');nm.textContent=esc(seq.name);nm.style.fontWeight='600';left.appendChild(nm);
      var sub=document.createElement('div');sub.className='sub';sub.textContent=(seq.trigger==='lead_created'?'Auto: new lead':'Manual')+' \\u00b7 '+((seq.steps||[]).length)+' step(s)';left.appendChild(sub);
      row.appendChild(left);
      var actions=document.createElement('div');actions.style.display='flex';actions.style.alignItems='center';actions.style.gap='8px';actions.style.flex='none';
      var st=document.createElement('span');st.className='pill';st.textContent=esc(seq.status);actions.appendChild(st);
      var tog=document.createElement('button');tog.className='btn ghost';tog.style.padding='6px 12px';tog.textContent=seq.status==='active'?'Pause':'Resume';
      tog.addEventListener('click',function(){setSeqStatus(seq.id,seq.status==='active'?'paused':'active');});actions.appendChild(tog);
      row.appendChild(actions);
      wrap.appendChild(row);
      // Steps summary
      (seq.steps||[]).forEach(function(s,i){
        var sr=document.createElement('div');sr.className='sub';sr.style.paddingLeft='4px';
        sr.textContent=(i+1)+'. after '+esc(s.delayHours)+'h — '+esc(s.subject);wrap.appendChild(sr);
      });
      // Add-step row
      var addRow=document.createElement('div');addRow.className='inline';addRow.style.marginTop='4px';
      var delayF=field('Delay (h)',80); var subF=field('Subject',0); var bodyF=field('Message',0);
      delayF.input.type='number';delayF.input.min='0';delayF.input.value='0';
      subF.input.placeholder='Step subject';bodyF.input.placeholder='Step message ({{name}} allowed)';
      var addBtn=document.createElement('button');addBtn.className='btn';addBtn.style.width='auto';addBtn.textContent='Add step';
      addBtn.addEventListener('click',function(){addStep(seq.id,delayF.input.value,subF.input.value,bodyF.input.value);});
      addRow.appendChild(delayF.wrap);addRow.appendChild(subF.wrap);addRow.appendChild(bodyF.wrap);addRow.appendChild(addBtn);
      wrap.appendChild(addRow);
      // Enroll row
      var enrRow=document.createElement('div');enrRow.className='inline';
      var emF=field('Enroll email',0); var nmF=field('Name (optional)',160);
      emF.input.type='email';emF.input.placeholder='someone@example.com';
      var enrBtn=document.createElement('button');enrBtn.className='btn';enrBtn.style.width='auto';enrBtn.textContent='Enroll';
      enrBtn.addEventListener('click',function(){enrollDrip(seq.id,emF.input.value,nmF.input.value);});
      enrRow.appendChild(emF.wrap);enrRow.appendChild(nmF.wrap);enrRow.appendChild(enrBtn);
      wrap.appendChild(enrRow);
      el.appendChild(wrap);
    });
  }
  function field(label,maxw){
    var wrap=document.createElement('div');wrap.className='f';if(maxw)wrap.style.maxWidth=maxw+'px';
    var l=document.createElement('label');l.textContent=label;wrap.appendChild(l);
    var input=document.createElement('input');wrap.appendChild(input);
    return {wrap:wrap,input:input};
  }
  async function setSeqStatus(id,status){
    var r=await api('/api/platform/drip/sequences/'+encodeURIComponent(id)+'/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:status})});
    if(r.ok)loadDrip();
  }
  async function addStep(id,delay,subject,body){
    if(!subject.trim()||!body.trim()){setMsg('dsmsg','err','A step needs a subject and a message.');return;}
    var r=await api('/api/platform/drip/sequences/'+encodeURIComponent(id)+'/steps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({delayHours:Number(delay||0),subject:subject.trim(),body:body.trim()})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){setMsg('dsmsg','ok','Step added.');loadDrip();}
    else{setMsg('dsmsg','err',(x.error&&x.error.message)||'Could not add step.');}
  }
  async function enrollDrip(id,email,name){
    if(!email.trim()){setMsg('dsmsg','err','A recipient email is required.');return;}
    var r=await api('/api/platform/drip/sequences/'+encodeURIComponent(id)+'/enroll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),name:name.trim()||undefined})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){setMsg('dsmsg','ok','Enrolled '+esc(email.trim())+'.');loadDripEnrollments();}
    else{setMsg('dsmsg','err',(x.error&&x.error.message)||'Could not enroll.');}
  }
  async function loadDripEnrollments(){
    var r=await api('/api/platform/drip/enrollments'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('dripEnrollments'); clear(el);
    var list=d.enrollments||[];
    if(!list.length){el.appendChild(emptyMsg('No enrollments yet.'));return;}
    list.forEach(function(e){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var t=document.createElement('div');t.textContent=esc(e.email);t.style.fontWeight='600';left.appendChild(t);
      var s=document.createElement('div');s.className='sub';s.textContent='step '+((e.stepIndex||0)+1)+' \\u00b7 '+esc(e.status);left.appendChild(s);
      row.appendChild(left);
      if(e.status==='active'){
        var cancel=document.createElement('button');cancel.className='btn ghost';cancel.style.padding='6px 12px';cancel.textContent='Cancel';
        cancel.addEventListener('click',function(){cancelEnrollment(e.id);});row.appendChild(cancel);
      }else{
        var st=document.createElement('span');st.className='pill';st.textContent=esc(e.status);row.appendChild(st);
      }
      el.appendChild(row);
    });
  }
  async function cancelEnrollment(id){
    var r=await api('/api/platform/drip/enrollments/'+encodeURIComponent(id)+'/cancel',{method:'POST'});
    if(r.ok)loadDripEnrollments();
  }
  function timeAgo(iso){
    var d=Date.parse(iso); if(!d)return '';
    var s=Math.floor((Date.now()-d)/1000);
    if(s<60)return 'just now';
    var m=Math.floor(s/60); if(m<60)return m+'m ago';
    var h=Math.floor(m/60); if(h<24)return h+'h ago';
    return Math.floor(h/24)+'d ago';
  }
  function setBell(count){
    var badge=document.getElementById('bellCount');
    if(!badge)return;
    if(count>0){badge.style.display='';badge.textContent=count>99?'99+':String(count);}
    else{badge.style.display='none';}
  }
  async function loadNotifications(){
    var r=await api('/api/platform/notifications'); if(!r.ok)return;
    var d=await r.json();
    setBell(d.unreadCount||0);
    var el=document.getElementById('notifList'); clear(el);
    var list=d.notifications||[];
    if(!list.length){el.appendChild(emptyMsg('No notifications yet.'));return;}
    list.forEach(function(n){
      var row=document.createElement('div');
      row.style.cssText='padding:11px 14px;border-bottom:1px solid var(--line,#eee);cursor:pointer;'+(n.readAt?'':'background:rgba(99,102,241,0.07);');
      var t=document.createElement('div');t.textContent=esc(n.title);t.style.cssText='font-weight:600;font-size:0.85rem;';row.appendChild(t);
      if(n.body){var b=document.createElement('div');b.className='sub';b.textContent=esc(n.body);b.style.fontSize='0.8rem';row.appendChild(b);}
      var meta=document.createElement('div');meta.className='sub';meta.style.cssText='font-size:0.72rem;opacity:0.7;margin-top:2px;';meta.textContent=timeAgo(n.createdAt);row.appendChild(meta);
      row.addEventListener('click',function(){markNotifRead(n.id,n.link);});
      el.appendChild(row);
    });
  }
  async function markNotifRead(id,link){
    await api('/api/platform/notifications/'+encodeURIComponent(id)+'/read',{method:'POST'});
    loadNotifications();
    if(link){window.location=link;}
  }
  async function refreshUnread(){
    var r=await api('/api/platform/notifications/unread-count'); if(!r.ok)return;
    var d=await r.json(); setBell(d.unreadCount||0);
  }
  async function loadActivity(){
    var r=await api('/api/platform/activity?limit=25'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('activityFeed'); clear(el);
    var list=d.events||[];
    if(!list.length){el.appendChild(emptyMsg('No activity yet. As your team works, it shows up here.'));return;}
    list.forEach(function(e){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var t=document.createElement('div');t.textContent=esc(e.title);t.style.fontWeight='600';left.appendChild(t);
      var parts=[];if(e.actorName)parts.push(esc(e.actorName));parts.push(timeAgo(e.createdAt));
      var s=document.createElement('div');s.className='sub';s.textContent=parts.join(' \\u00b7 ');left.appendChild(s);
      row.appendChild(left);
      if(e.summary){var p=document.createElement('span');p.className='pill';p.textContent=esc(e.summary);row.appendChild(p);}
      el.appendChild(row);
    });
  }
  async function openJourney(subjectType, subjectId, name){
    var modal=document.getElementById('journey');
    var title=document.getElementById('journeyTitle');
    var bodyEl=document.getElementById('journeyBody');
    if(!modal||!bodyEl)return;
    title.textContent='Journey · '+esc(name||'');
    clear(bodyEl); bodyEl.appendChild(emptyMsg('Loading…'));
    modal.style.display='';
    var r=await api('/api/platform/activity?limit=50&subjectType='+encodeURIComponent(subjectType)+'&subjectId='+encodeURIComponent(subjectId));
    var d=r.ok?await r.json():{events:[]};
    clear(bodyEl);
    var list=d.events||[];
    if(!list.length){bodyEl.appendChild(emptyMsg('No activity recorded yet for this record.'));return;}
    list.forEach(function(e){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var t=document.createElement('div');t.textContent=esc(e.title);t.style.fontWeight='600';left.appendChild(t);
      var parts=[];if(e.actorName)parts.push(esc(e.actorName));parts.push(timeAgo(e.createdAt));
      var s=document.createElement('div');s.className='sub';s.textContent=parts.join(' \\u00b7 ');left.appendChild(s);
      row.appendChild(left);
      if(e.summary){var p=document.createElement('span');p.className='pill';p.textContent=esc(e.summary);row.appendChild(p);}
      bodyEl.appendChild(row);
    });
  }
  (function(){
    var modal=document.getElementById('journey');
    var close=document.getElementById('journeyClose');
    if(close)close.addEventListener('click',function(){modal.style.display='none';});
    if(modal)modal.addEventListener('click',function(e){if(e.target===modal)modal.style.display='none';});
  })();
  function fmtBytes(n){
    n=Number(n||0);
    if(n<1024)return n+' B';
    if(n<1048576)return (n/1024).toFixed(1)+' KB';
    if(n<1073741824)return (n/1048576).toFixed(1)+' MB';
    return (n/1073741824).toFixed(2)+' GB';
  }
  async function loadFiles(){
    var r=await api('/api/platform/files'); if(!r.ok)return;
    var d=await r.json();
    var u=await api('/api/platform/files/usage');
    if(u.ok){var ud=await u.json();document.getElementById('filesUsage').textContent='Storage: '+fmtBytes(ud.usedBytes)+' of '+fmtBytes(ud.quotaBytes)+' used.';}
    var el=document.getElementById('files'); clear(el);
    var list=d.files||[];
    if(!list.length){el.appendChild(emptyMsg('No files yet. Upload a document below.'));return;}
    list.forEach(function(f){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var t=document.createElement('div');t.textContent=esc(f.name);t.style.fontWeight='600';left.appendChild(t);
      var s=document.createElement('div');s.className='sub';s.textContent=fmtBytes(f.size)+' \\u00b7 '+timeAgo(f.createdAt);left.appendChild(s);
      row.appendChild(left);
      var actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex:none;';
      var dl=document.createElement('a');dl.className='btn ghost';dl.style.cssText='width:auto;padding:6px 12px;';dl.textContent='Download';
      dl.href='/api/platform/files/'+encodeURIComponent(f.id)+'/download';actions.appendChild(dl);
      var rm=document.createElement('button');rm.className='btn ghost';rm.style.cssText='width:auto;padding:6px 12px;';rm.textContent='Delete';
      rm.addEventListener('click',function(){deleteFile(f.id);});actions.appendChild(rm);
      row.appendChild(actions);
      el.appendChild(row);
    });
  }
  document.getElementById('uploadFile').addEventListener('click',function(){
    var inp=document.getElementById('fileInput');
    var file=inp.files&&inp.files[0];
    if(!file){setMsg('filemsg','err','Choose a file first.');return;}
    if(file.size>10*1048576){setMsg('filemsg','err','Files must be 10 MB or smaller.');return;}
    setMsg('filemsg','','Uploading\\u2026');
    var reader=new FileReader();
    reader.onload=async function(){
      var b64=String(reader.result).split(',')[1]||'';
      var r=await api('/api/platform/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,mimeType:file.type||'application/octet-stream',data:b64})});
      var x=await r.json().catch(function(){return {};});
      if(r.ok){inp.value='';setMsg('filemsg','ok','Uploaded.');loadFiles();}
      else{setMsg('filemsg','err',(x.error&&x.error.message)||'Upload failed.');}
    };
    reader.onerror=function(){setMsg('filemsg','err','Could not read the file.');};
    reader.readAsDataURL(file);
  });
  async function deleteFile(id){
    var r=await api('/api/platform/files/'+encodeURIComponent(id)+'/delete',{method:'POST'});
    if(r.ok)loadFiles();
  }
  var FORM_TEMPLATES={
    contact:[{key:'name',type:'text',label:'Name',required:true},{key:'email',type:'email',label:'Email',required:true},{key:'message',type:'textarea',label:'Message',required:true}],
    quote:[{key:'name',type:'text',label:'Name',required:true},{key:'email',type:'email',label:'Email',required:true},{key:'phone',type:'phone',label:'Phone',required:false},{key:'service',type:'text',label:'Service needed',required:false},{key:'budget',type:'text',label:'Budget',required:false},{key:'message',type:'textarea',label:'Details',required:false}],
    intake:[{key:'name',type:'text',label:'Full name',required:true},{key:'email',type:'email',label:'Email',required:true},{key:'phone',type:'phone',label:'Phone',required:false},{key:'company',type:'text',label:'Company',required:false},{key:'message',type:'textarea',label:'How can we help?',required:false}]
  };
  async function loadForms(){
    var r=await api('/api/platform/forms'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('forms'); clear(el);
    var list=d.forms||[];
    if(!list.length){el.appendChild(emptyMsg('No forms yet. Create one below.'));return;}
    list.forEach(function(fm){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var t=document.createElement('div');t.textContent=esc(fm.name);t.style.fontWeight='600';left.appendChild(t);
      var link=document.createElement('a');link.href='/f/'+encodeURIComponent(fm.slug);link.target='_blank';link.rel='noopener';link.textContent='/f/'+esc(fm.slug);link.className='sub';link.style.color='var(--accent,#6366f1)';left.appendChild(link);
      row.appendChild(left);
      var actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex:none;align-items:center;';
      var st=document.createElement('span');st.className='pill';st.textContent=esc(fm.status);actions.appendChild(st);
      var subs=document.createElement('button');subs.className='btn ghost';subs.style.cssText='width:auto;padding:6px 12px;';subs.textContent='Submissions';
      subs.addEventListener('click',function(){viewSubmissions(fm.id,fm.name);});actions.appendChild(subs);
      row.appendChild(actions);
      el.appendChild(row);
    });
  }
  async function viewSubmissions(id,name){
    var modal=document.getElementById('journey');
    var title=document.getElementById('journeyTitle');
    var bodyEl=document.getElementById('journeyBody');
    title.textContent='Submissions · '+esc(name);
    clear(bodyEl); bodyEl.appendChild(emptyMsg('Loading…'));
    modal.style.display='';
    var r=await api('/api/platform/forms/'+encodeURIComponent(id)+'/submissions');
    var d=r.ok?await r.json():{submissions:[]};
    clear(bodyEl);
    var list=d.submissions||[];
    if(!list.length){bodyEl.appendChild(emptyMsg('No submissions yet.'));return;}
    list.forEach(function(s){
      var row=document.createElement('div');row.className='item';row.style.flexDirection='column';row.style.alignItems='stretch';
      var when=document.createElement('div');when.className='sub';when.textContent=timeAgo(s.createdAt);row.appendChild(when);
      Object.keys(s.data||{}).forEach(function(k){
        var line=document.createElement('div');line.style.fontSize='0.85rem';
        var b=document.createElement('strong');b.textContent=esc(k)+': ';line.appendChild(b);
        line.appendChild(document.createTextNode(esc(String(s.data[k]))));
        row.appendChild(line);
      });
      bodyEl.appendChild(row);
    });
  }
  async function loadCalendar(){
    var r=await api('/api/platform/calendar/events'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('calendarEvents'); clear(el);
    var now=Date.now();
    var list=(d.events||[]).filter(function(e){return !e.endAt?Date.parse(e.startAt)>=now-86400000:Date.parse(e.endAt)>=now;});
    if(!list.length){el.appendChild(emptyMsg('No upcoming events. Add one below.'));return;}
    list.forEach(function(e){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var t=document.createElement('div');t.textContent=esc(e.title);t.style.fontWeight='600';left.appendChild(t);
      var when=new Date(e.startAt);
      var s=document.createElement('div');s.className='sub';s.textContent=e.allDay?when.toLocaleDateString():when.toLocaleString();left.appendChild(s);
      row.appendChild(left);
      var rm=document.createElement('button');rm.className='btn ghost';rm.style.cssText='width:auto;padding:6px 12px;flex:none;';rm.textContent='Remove';
      rm.addEventListener('click',function(){deleteEvent(e.id);});row.appendChild(rm);
      el.appendChild(row);
    });
  }
  document.getElementById('addEvent').addEventListener('click',async function(){
    var t=document.getElementById('cetitle'),w=document.getElementById('cewhen');
    if(!t.value.trim()||!w.value){setMsg('cemsg','err','A title and a date/time are required.');return;}
    setMsg('cemsg','','Adding\\u2026');
    // datetime-local is local time; convert to a real ISO (UTC) instant.
    var iso=new Date(w.value).toISOString();
    var r=await api('/api/platform/calendar/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:t.value.trim(),startAt:iso})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){t.value='';w.value='';setMsg('cemsg','ok','Event added.');loadCalendar();}
    else{setMsg('cemsg','err',(x.error&&x.error.message)||'Could not add event.');}
  });
  async function deleteEvent(id){
    var r=await api('/api/platform/calendar/events/'+encodeURIComponent(id),{method:'DELETE'});
    if(r.ok)loadCalendar();
  }
  var WF_TEMPLATES={
    lead_notify:{name:'New lead → notify team',trigger:'lead.created',steps:[{type:'notify',delayHours:0,config:{title:'New lead',body:'A new lead was just added to your pipeline.'}}]},
    lead_welcome:{name:'New lead → welcome email',trigger:'lead.created',steps:[{type:'email',delayHours:0,config:{subject:'Thanks for reaching out',body:'Hi {{name}},\\n\\nThanks for your interest — we received your details and will be in touch shortly.'}}]},
    form_reply:{name:'Form submission → notify + auto-reply',trigger:'form.submitted',steps:[{type:'notify',delayHours:0,config:{title:'New form submission',body:'Someone submitted one of your forms.'}},{type:'email',delayHours:0,config:{subject:'We got your message',body:'Hi {{name}},\\n\\nThanks — we received your submission and will get back to you soon.'}}]},
    invoice_paid:{name:'Invoice paid → notify team',trigger:'invoice.paid',steps:[{type:'notify',delayHours:0,config:{title:'Invoice paid',body:'An invoice was just paid.'}}]},
    proposal_accepted:{name:'Proposal accepted → notify team',trigger:'proposal.accepted',steps:[{type:'notify',delayHours:0,config:{title:'Proposal accepted',body:'A proposal was accepted — time to kick off.'}}]},
    ticket_created:{name:'New support ticket → notify team',trigger:'ticket.created',steps:[{type:'notify',delayHours:0,config:{title:'New support ticket',body:'A new support ticket was opened.'}}]},
    client_created:{name:'New client → notify team',trigger:'client.created',steps:[{type:'notify',delayHours:0,config:{title:'New client',body:'A new client was just added.'}}]}
  };
  async function loadWorkflows(){
    var r=await api('/api/platform/workflows'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('workflows'); clear(el);
    var list=d.workflows||[];
    if(!list.length){el.appendChild(emptyMsg('No automations yet. Create one below.'));return;}
    list.forEach(function(wf){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var t=document.createElement('div');t.textContent=esc(wf.name);t.style.fontWeight='600';left.appendChild(t);
      var s=document.createElement('div');s.className='sub';s.textContent='on '+esc(wf.trigger)+' \\u00b7 '+((wf.steps||[]).length)+' step(s)';left.appendChild(s);
      row.appendChild(left);
      var actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex:none;align-items:center;';
      var st=document.createElement('span');st.className='pill';st.textContent=esc(wf.status);actions.appendChild(st);
      var tog=document.createElement('button');tog.className='btn ghost';tog.style.padding='6px 12px';tog.textContent=wf.status==='active'?'Pause':'Resume';
      tog.addEventListener('click',function(){setWorkflowStatus(wf.id,wf.status==='active'?'paused':'active');});actions.appendChild(tog);
      var runs=document.createElement('button');runs.className='btn ghost';runs.style.padding='6px 12px';runs.textContent='Runs';
      runs.addEventListener('click',function(){viewWorkflowRuns(wf.id,wf.name);});actions.appendChild(runs);
      row.appendChild(actions);
      el.appendChild(row);
    });
  }
  async function setWorkflowStatus(id,status){
    var r=await api('/api/platform/workflows/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:status})});
    if(r.ok)loadWorkflows();
  }
  var aiHistory=[];
  function aiBubble(role,text){
    var log=document.getElementById('aiChatLog');
    var b=document.createElement('div');
    b.style.cssText='max-width:85%;padding:8px 12px;border-radius:10px;white-space:pre-wrap;font-size:0.9rem;'+(role==='user'?'align-self:flex-end;background:#2563eb;color:#fff;':'align-self:flex-start;background:rgba(127,127,127,0.14);');
    b.textContent=text;log.appendChild(b);log.scrollTop=log.scrollHeight;return b;
  }
  async function sendAiChat(){
    var input=document.getElementById('aiChatInput');var msg=(input.value||'').trim();if(!msg)return;
    input.value='';setMsg('aicmsg','','');
    aiBubble('user',msg);
    var thinking=aiBubble('assistant','\\u2026');
    var empSel=document.getElementById('aiEmployeeSelect');
    var employeeId=empSel?empSel.value:'';
    var r=await api('/api/platform/ai/console/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg,history:aiHistory,employeeId:employeeId})});
    if(!r.ok){thinking.textContent='Sorry — something went wrong.';return;}
    var d=await r.json();
    thinking.textContent=d.reply||'';
    (d.steps||[]).forEach(function(s){
      var line=document.createElement('div');line.className='sub';line.style.cssText='align-self:flex-start;font-size:0.78rem;opacity:0.8;';
      line.textContent=(s.mode==='write'?'\\u270e ':'\\u2699 ')+s.tool+': '+s.summary;
      document.getElementById('aiChatLog').appendChild(line);
    });
    if((d.pending||[]).length){
      d.pending.forEach(function(inv){renderAiPending(inv);});
      loadAiTools();
    }
    aiHistory.push({role:'user',content:msg});
    aiHistory.push({role:'assistant',content:d.reply||''});
    if(aiHistory.length>24)aiHistory=aiHistory.slice(-24);
    document.getElementById('aiChatLog').scrollTop=document.getElementById('aiChatLog').scrollHeight;
  }
  function renderAiPending(inv){
    var log=document.getElementById('aiChatLog');
    var card=document.createElement('div');card.style.cssText='align-self:flex-start;max-width:85%;border:1px solid rgba(127,127,127,0.3);border-radius:10px;padding:10px 12px;';
    var t=document.createElement('div');t.style.fontWeight='600';t.textContent='Confirm: '+esc(inv.toolName);card.appendChild(t);
    var s=document.createElement('div');s.className='sub';s.textContent=summarizeArgs(inv.args);card.appendChild(s);
    var canConfirm=(myRole==='owner'||myRole==='admin');
    if(canConfirm){
      var actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;margin-top:8px;';
      var ok=document.createElement('button');ok.className='btn';ok.style.padding='6px 12px';ok.textContent='Confirm';
      ok.addEventListener('click',function(){card.remove();decideAi(inv.id,'confirm');});actions.appendChild(ok);
      var no=document.createElement('button');no.className='btn ghost';no.style.padding='6px 12px';no.textContent='Decline';
      no.addEventListener('click',function(){card.remove();decideAi(inv.id,'reject');});actions.appendChild(no);
      card.appendChild(actions);
    }else{
      var note=document.createElement('div');note.className='sub';note.style.marginTop='6px';note.textContent='An owner or admin can confirm this in AI Actions.';card.appendChild(note);
    }
    log.appendChild(card);log.scrollTop=log.scrollHeight;
  }
  async function loadAiEmployees(){
    var r=await api('/api/platform/ai/employees');if(!r.ok)return;
    var d=await r.json();var list=d.employees||[];
    // Populate the Command Center selector.
    var sel=document.getElementById('aiEmployeeSelect');
    if(sel){
      var cur=sel.value;
      sel.innerHTML='<option value="">General assistant</option>';
      list.filter(function(e){return e.status==='active';}).forEach(function(e){
        var o=document.createElement('option');o.value=e.id;o.textContent=e.name;sel.appendChild(o);
      });
      sel.value=cur;
    }
    // Render the management list (owner/admin panel).
    var el=document.getElementById('aiEmployees');if(!el)return;clear(el);
    if(!list.length){el.appendChild(emptyMsg('No assistants yet. Create one below.'));return;}
    list.forEach(function(e){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var t=document.createElement('div');t.textContent=esc(e.name);t.style.fontWeight='600';left.appendChild(t);
      var s=document.createElement('div');s.className='sub';s.textContent=esc(e.title)+((e.toolNames&&e.toolNames.length)?(' \\u00b7 '+e.toolNames.length+' action(s)'):' \\u00b7 all your actions');left.appendChild(s);
      row.appendChild(left);
      var del=document.createElement('button');del.className='btn ghost';del.style.padding='6px 12px';del.style.flex='none';del.textContent='Delete';
      del.addEventListener('click',function(){deleteEmployee(e.id);});row.appendChild(del);
      el.appendChild(row);
    });
  }
  async function deleteEmployee(id){
    var r=await api('/api/platform/ai/employees/'+encodeURIComponent(id),{method:'DELETE'});
    if(r.ok)loadAiEmployees();
  }
  async function loadAiTools(){
    var tr=await api('/api/platform/ai/tools');
    if(tr.ok){
      var td=await tr.json();var tel=document.getElementById('aiToolsList');clear(tel);
      var tools=td.tools||[];
      if(!tools.length){tel.appendChild(emptyMsg('No AI actions available yet.'));}
      tools.forEach(function(t){
        var row=document.createElement('div');row.className='item';
        var left=document.createElement('div');
        var n=document.createElement('div');n.textContent=esc(t.title);n.style.fontWeight='600';left.appendChild(n);
        var s=document.createElement('div');s.className='sub';s.textContent=esc(t.description);left.appendChild(s);
        row.appendChild(left);
        var pill=document.createElement('span');pill.className='pill';pill.textContent=t.mode==='write'?'needs confirm':'read';pill.style.flex='none';row.appendChild(pill);
        tel.appendChild(row);
      });
    }
    var ir=await api('/api/platform/ai/tools/invocations');
    var pel=document.getElementById('aiPending');clear(pel);
    if(!ir.ok){pel.appendChild(emptyMsg('Could not load pending actions.'));return;}
    var id=await ir.json();
    var pending=(id.invocations||[]).filter(function(x){return x.status==='pending';});
    if(!pending.length){pel.appendChild(emptyMsg('Nothing awaiting confirmation.'));return;}
    pending.forEach(function(inv){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var n=document.createElement('div');n.textContent=esc(inv.toolName);n.style.fontWeight='600';left.appendChild(n);
      var s=document.createElement('div');s.className='sub';s.textContent=summarizeArgs(inv.args)+' \\u00b7 '+timeAgo(inv.createdAt);left.appendChild(s);
      row.appendChild(left);
      var actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex:none;';
      var ok=document.createElement('button');ok.className='btn';ok.style.padding='6px 12px';ok.textContent='Confirm';
      ok.addEventListener('click',function(){decideAi(inv.id,'confirm');});actions.appendChild(ok);
      var no=document.createElement('button');no.className='btn ghost';no.style.padding='6px 12px';no.textContent='Decline';
      no.addEventListener('click',function(){decideAi(inv.id,'reject');});actions.appendChild(no);
      row.appendChild(actions);
      pel.appendChild(row);
    });
  }
  function summarizeArgs(args){
    if(!args)return '';
    var parts=[];for(var k in args){if(Object.prototype.hasOwnProperty.call(args,k)){parts.push(k+': '+esc(String(args[k])));}}
    return parts.join(', ');
  }
  async function decideAi(id,decision){
    var r=await api('/api/platform/ai/tools/invocations/'+encodeURIComponent(id)+'/'+decision,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if(r.ok){setMsg('aitmsg','ok',decision==='confirm'?'Action confirmed and run.':'Action declined.');loadAiTools();}
    else{setMsg('aitmsg','err','Could not complete that action.');}
  }
  async function viewWorkflowRuns(id,name){
    var modal=document.getElementById('journey');
    var title=document.getElementById('journeyTitle');
    var bodyEl=document.getElementById('journeyBody');
    title.textContent='Runs · '+esc(name);
    clear(bodyEl); bodyEl.appendChild(emptyMsg('Loading…'));
    modal.style.display='';
    var r=await api('/api/platform/workflows/'+encodeURIComponent(id)+'/runs');
    var d=r.ok?await r.json():{runs:[]};
    clear(bodyEl);
    var list=d.runs||[];
    if(!list.length){bodyEl.appendChild(emptyMsg('No runs yet. This automation runs when its trigger fires.'));return;}
    list.forEach(function(run){
      var row=document.createElement('div');row.className='item';row.style.flexDirection='column';row.style.alignItems='stretch';
      var top=document.createElement('div');top.className='sub';top.textContent=esc(run.status)+' \\u00b7 '+timeAgo(run.createdAt);row.appendChild(top);
      (run.log||[]).forEach(function(l){
        var line=document.createElement('div');line.style.fontSize='0.82rem';line.textContent=(l.action)+': '+esc(l.result);row.appendChild(line);
      });
      bodyEl.appendChild(row);
    });
  }
  async function loadCollections(){
    var r=await api('/api/platform/knowledge/collections'); if(!r.ok)return;
    var d=await r.json();
    var sel=document.getElementById('kbcollection'); var prev=sel.value; clear(sel);
    (d.collections||[]).forEach(function(c){var o=document.createElement('option');o.value=c.id;o.textContent=c.name;sel.appendChild(o);});
    if(prev)sel.value=prev;
    if((d.collections||[]).length)loadKbDocs();
    else{var el=document.getElementById('kbdocs');clear(el);el.appendChild(emptyMsg('Create a collection to begin.'));}
  }
  async function loadKbDocs(){
    var sel=document.getElementById('kbcollection'); var id=sel.value; if(!id)return;
    var r=await api('/api/platform/knowledge/collections/'+encodeURIComponent(id)+'/documents'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('kbdocs'); clear(el);
    var list=d.documents||[];
    if(!list.length){el.appendChild(emptyMsg('No documents in this collection.'));return;}
    list.forEach(function(doc){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var t=document.createElement('div');t.textContent=esc(doc.name);t.style.fontWeight='600';left.appendChild(t);
      var s=document.createElement('div');s.className='sub';s.textContent=doc.chunkCount+' chunk(s) \\u00b7 '+esc(doc.status);left.appendChild(s);
      row.appendChild(left);
      var rm=document.createElement('button');rm.className='btn ghost';rm.style.cssText='width:auto;padding:6px 12px;flex:none;';rm.textContent='Delete';
      rm.addEventListener('click',function(){deleteKbDoc(doc.id);});row.appendChild(rm);
      el.appendChild(row);
    });
  }
  async function deleteKbDoc(id){
    var r=await api('/api/platform/knowledge/documents/'+encodeURIComponent(id),{method:'DELETE'});
    if(r.ok)loadKbDocs();
  }
  async function loadAudit(){
    var r=await api('/api/platform/audit?limit=50'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('auditLog'); clear(el);
    var list=d.events||[];
    if(!list.length){el.appendChild(emptyMsg('No security events yet.'));return;}
    list.forEach(function(e){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var t=document.createElement('div');t.textContent=esc(e.action);t.style.fontWeight='600';left.appendChild(t);
      var parts=[];if(e.actorLabel)parts.push(esc(e.actorLabel));if(e.ip)parts.push(esc(e.ip));parts.push(timeAgo(e.createdAt));
      var s=document.createElement('div');s.className='sub';s.textContent=parts.join(' \\u00b7 ');left.appendChild(s);
      row.appendChild(left);
      if(e.outcome){var p=document.createElement('span');p.className='pill';p.textContent=esc(e.outcome);if(e.outcome==='failure')p.style.color='#e5484d';row.appendChild(p);}
      el.appendChild(row);
    });
  }
  var aiReady=true;
  async function loadEditions(){
    var r=await api('/api/platform/marketplace/editions'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('editions'); if(!el)return; clear(el);
    var list=d.editions||[];
    if(!list.length){el.appendChild(emptyMsg('No editions available.'));return;}
    var canUse=(myRole==='owner'||myRole==='admin');
    list.forEach(function(e){
      var row=document.createElement('div');row.className='item';
      if(e.previewImage){var im=document.createElement('img');im.src=e.previewImage;im.alt='';im.loading='lazy';im.title='AI-generated sample';im.style.cssText='width:140px;height:88px;object-fit:cover;object-position:top;border-radius:8px;flex:none;margin-right:12px;background:rgba(127,127,127,0.12);';im.onerror=function(){im.style.display='none';};row.appendChild(im);}
      var left=document.createElement('div');
      var n=document.createElement('div');n.textContent=esc(e.name);n.style.fontWeight='600';left.appendChild(n);
      var s=document.createElement('div');s.className='sub';s.textContent=esc(e.description)+' \\u00b7 '+((e.employees||[]).length)+' assistant(s)';left.appendChild(s);
      row.appendChild(left);
      var actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex:none;align-items:center;';
      if(e.tier==='premium'){var pp=document.createElement('span');pp.className='pill';pp.textContent='Premium';actions.appendChild(pp);}
      if(canUse){
        var b=document.createElement('button');b.className='btn';b.style.padding='6px 12px';b.textContent='Apply';
        b.addEventListener('click',function(){applyEdition(e.id,e.name);});actions.appendChild(b);
      }
      row.appendChild(actions);
      el.appendChild(row);
    });
  }
  async function applyEdition(id,name){
    setMsg('mktmsg','','Applying \\u201c'+esc(name)+'\\u201d\\u2026');
    var r=await api('/api/platform/marketplace/editions/'+encodeURIComponent(id)+'/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){
      setMsg('mktmsg','ok','Applied: created a website draft'+(x.employeesCreated?(' and '+x.employeesCreated+' AI assistant(s)'):'')+(x.accentApplied?', set your brand accent':'')+'. Check the AI Website Builder + AI Employees.');
      loadWebsites();loadBranding();
      if(typeof loadAiEmployees==='function')loadAiEmployees();
    }
    else{setMsg('mktmsg','err',mktError(x,r.status,'Could not apply that edition.'));}
  }
  async function loadMarketplace(){
    var r=await api('/api/platform/marketplace/website-templates'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('marketplace'); if(!el)return; clear(el);
    var list=d.templates||[];
    if(!list.length){el.appendChild(emptyMsg('No templates available.'));return;}
    var canUse=(myRole==='owner'||myRole==='admin');
    list.forEach(function(t){
      var row=document.createElement('div');row.className='item';
      if(t.previewImage){var im=document.createElement('img');im.src=t.previewImage;im.alt='';im.loading='lazy';im.title='AI-generated sample';im.style.cssText='width:140px;height:88px;object-fit:cover;object-position:top;border-radius:8px;flex:none;margin-right:12px;background:rgba(127,127,127,0.12);';im.onerror=function(){im.style.display='none';};row.appendChild(im);}
      var left=document.createElement('div');
      var n=document.createElement('div');n.textContent=esc(t.name);n.style.fontWeight='600';left.appendChild(n);
      var s=document.createElement('div');s.className='sub';s.textContent=esc(t.industry)+' \\u00b7 '+esc(t.description);left.appendChild(s);
      row.appendChild(left);
      var actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex:none;align-items:center;';
      if(t.tier==='premium'){var pp=document.createElement('span');pp.className='pill';pp.textContent='Premium';actions.appendChild(pp);}
      if(canUse){
        var b=document.createElement('button');b.className='btn ghost';b.style.padding='6px 12px';b.textContent='Use template';
        b.addEventListener('click',function(){useTemplate(t.id,t.name);});actions.appendChild(b);
      }
      row.appendChild(actions);
      el.appendChild(row);
    });
  }
  function mktError(x,status,fallback){
    if(status===402&&x.error&&x.error.code==='PREMIUM_REQUIRED'){return 'That\\u2019s a premium template — upgrade to Business or higher to use it.';}
    if(status===402){return 'Your plan\\u2019s site limit is reached — upgrade to add more.';}
    return (x.error&&x.error.message)||fallback;
  }
  async function useTemplate(id,name){
    setMsg('mktmsg','','Creating a draft from \\u201c'+esc(name)+'\\u201d\\u2026');
    var r=await api('/api/platform/marketplace/website-templates/'+encodeURIComponent(id)+'/use',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){setMsg('mktmsg','ok','Draft created in the AI Website Builder — click Generate there to build it.');loadWebsites();}
    else{setMsg('mktmsg','err',mktError(x,r.status,'Could not use that template.'));}
  }
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
      document.getElementById('emailPanel').style.display='';
      document.getElementById('dripPanel').style.display='';
      document.getElementById('formsPanel').style.display='';
      document.getElementById('knowledgePanel').style.display='';
      document.getElementById('workflowsPanel').style.display='';
      document.getElementById('aiToolsPanel').style.display='';
      document.getElementById('aiEmployeesPanel').style.display='';
      document.getElementById('auditPanel').style.display='';
      loadBrands();
      loadTeam();
      loadPortalUsers();
      loadEmails();
      loadDrip();
      loadDripEnrollments();
      loadForms();
      loadCollections();
      loadWorkflows();
      loadAiTools();
      loadAudit();
    }
    if(u.role==='owner'){
      document.getElementById('planPickerWrap').style.display='flex';
      document.getElementById('aiPanel').style.display='';
    }
    await loadBilling(); await loadBranding(); await loadClients(); await loadProjects(); await loadInvoices(); await loadWebsites(); await loadMarketplace(); await loadEditions(); await loadHosting(); await loadTickets(); await loadLeads(); await loadProposals(); await loadCampaigns(); await loadReviews(); await loadProducts(); await loadBooks(); await loadPrograms(); await loadDomains();
    if(u.role==='owner'){await loadAiSettings();}
    await loadActivity();
    await loadFiles();
    await loadCalendar();
    document.getElementById('aiConsolePanel').style.display='';
    await loadAiEmployees();
    await loadOnboarding();
    refreshUnread();
    setInterval(refreshUnread, 45000);
    buildSecNav();
  }
  document.getElementById('sendEmail').addEventListener('click',async function(){
    var to=document.getElementById('emto'),su=document.getElementById('emsub'),bo=document.getElementById('embody');
    if(!to.value.trim()||!su.value.trim()||!bo.value.trim()){setMsg('emmsg','err','To, subject, and message are required.');return;}
    setMsg('emmsg','','Sending\\u2026');
    var r=await api('/api/platform/emails',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:to.value.trim(),subject:su.value.trim(),body:bo.value.trim()})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){to.value='';su.value='';bo.value='';var st=(x.email&&x.email.status)||'';setMsg('emmsg','ok',st==='sent'?'Sent.':'Recorded ('+st+').');loadEmails();}
    else{setMsg('emmsg','err',(x.error&&x.error.message)||'Could not send.');}
  });
  (function(){
    var bell=document.getElementById('bell');
    if(!bell)return;
    bell.addEventListener('click',function(ev){
      ev.stopPropagation();
      var p=document.getElementById('notifPanel');
      var open=p.style.display!=='none';
      p.style.display=open?'none':'';
      if(!open)loadNotifications();
    });
    document.addEventListener('click',function(ev){
      var p=document.getElementById('notifPanel');
      if(p && p.style.display!=='none' && !p.contains(ev.target) && !bell.contains(ev.target)){p.style.display='none';}
    });
    var mar=document.getElementById('markAllRead');
    if(mar)mar.addEventListener('click',function(ev){
      ev.stopPropagation();
      api('/api/platform/notifications/read-all',{method:'POST'}).then(function(){loadNotifications();});
    });
  })();
  (function(){
    var overlay=document.getElementById('palette');
    var input=document.getElementById('paletteInput');
    var results=document.getElementById('paletteResults');
    if(!overlay||!input||!results)return;
    var items=[]; var sel=0; var timer=null;
    function go(anchor,focusId){ close(); if(anchor)location.hash=anchor; if(focusId){var el=document.getElementById(focusId); if(el){el.scrollIntoView({block:'center'}); if(el.focus)el.focus();}} }
    var ACTIONS=[
      {label:'Add client',hint:'Clients',run:function(){go('clients','cname');}},
      {label:'Add lead',hint:'Sales pipeline',run:function(){go('leads','lname');}},
      {label:'Create project',hint:'Projects',run:function(){go('projects','pname');}},
      {label:'Create invoice',hint:'Invoices',run:function(){go('invoices','iclient');}},
      {label:'Create support ticket',hint:'Support',run:function(){go('tickets','tsubject');}},
      {label:'Create proposal',hint:'Proposals',run:function(){go('proposals','prtitle');}},
      {label:'Create campaign',hint:'Marketing',run:function(){go('campaigns','mname');}},
      {label:'Build a website',hint:'AI Website Builder',run:function(){go('websites','wbrief');}},
      {label:'New autoresponder',hint:'Autoresponders',run:function(){go('dripSequences','dsname');}},
      {label:'Invite team member',hint:'Team',run:function(){go('team','tmemail');}},
      {label:'Open notifications',hint:'',run:function(){close();var b=document.getElementById('bell');if(b)b.click();}},
      {label:'Change password',hint:'Account',run:function(){go('','cpcur');}},
      {label:'Sign out',hint:'',run:function(){var l=document.getElementById('logout');if(l)l.click();}}
    ];
    function isOpen(){ return overlay.style.display!=='none'; }
    function open(){ overlay.style.display=''; input.value=''; render([],ACTIONS); input.focus(); }
    function close(){ overlay.style.display='none'; items=[]; sel=0; }
    function header(text){ var h=document.createElement('div'); h.textContent=text; h.style.cssText='padding:8px 16px 4px;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.04em;opacity:0.55;'; return h; }
    function addItem(title,sub,run){
      var idx=items.length;
      var row=document.createElement('div');
      row.style.cssText='padding:10px 16px;cursor:pointer;';
      var t=document.createElement('div'); t.textContent=esc(title); t.style.cssText='font-weight:600;font-size:0.9rem;'; row.appendChild(t);
      if(sub){ var s=document.createElement('div'); s.textContent=esc(sub); s.style.cssText='font-size:0.78rem;opacity:0.65;margin-top:2px;'; row.appendChild(s); }
      row.addEventListener('mouseenter',function(){ sel=idx; highlight(); });
      row.addEventListener('click',run);
      results.appendChild(row);
      items.push({row:row,run:run});
    }
    function render(groups,actions){
      clear(results); items=[];
      if(actions&&actions.length){ results.appendChild(header('Actions')); actions.forEach(function(a){ addItem(a.label,a.hint,a.run); }); }
      (groups||[]).forEach(function(g){ results.appendChild(header(g.label)); g.results.forEach(function(r){ addItem(r.title,[r.subtitle,r.status].filter(Boolean).join(' \\u00b7 '),function(){ close(); window.location=r.url; }); }); });
      if(!items.length){ var d=document.createElement('div'); d.style.cssText='padding:16px 18px;opacity:0.6;font-size:0.85rem;'; d.textContent='No matches.'; results.appendChild(d); }
      sel=0; highlight();
    }
    function highlight(){ items.forEach(function(it,i){ it.row.style.background=(i===sel)?'rgba(99,102,241,0.14)':'transparent'; }); if(items[sel]&&items[sel].row.scrollIntoView)items[sel].row.scrollIntoView({block:'nearest'}); }
    function filterActions(q){ if(!q)return ACTIONS; var lc=q.toLowerCase(); return ACTIONS.filter(function(a){return a.label.toLowerCase().indexOf(lc)>=0||(a.hint&&a.hint.toLowerCase().indexOf(lc)>=0);}); }
    function doSearch(q){
      if(q.length<2){ render([],filterActions(q)); return; }
      render([],filterActions(q));
      api('/api/platform/search?q='+encodeURIComponent(q)).then(function(r){return r.ok?r.json():{groups:[]};}).then(function(d){ if(isOpen())render(d.groups||[],filterActions(q)); }).catch(function(){});
    }
    input.addEventListener('input',function(){ var q=input.value.trim(); if(timer)clearTimeout(timer); timer=setTimeout(function(){doSearch(q);},200); });
    input.addEventListener('keydown',function(e){
      if(e.key==='ArrowDown'){e.preventDefault(); if(sel<items.length-1){sel++;highlight();}}
      else if(e.key==='ArrowUp'){e.preventDefault(); if(sel>0){sel--;highlight();}}
      else if(e.key==='Enter'){e.preventDefault(); if(items[sel])items[sel].run();}
      else if(e.key==='Escape'){e.preventDefault(); close();}
    });
    overlay.addEventListener('click',function(e){ if(e.target===overlay)close(); });
    document.addEventListener('keydown',function(e){ if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K')){ e.preventDefault(); if(isOpen())close(); else open(); } });
    var ob=document.getElementById('openPalette'); if(ob)ob.addEventListener('click',open);
  })();
  document.getElementById('aiChatSend').addEventListener('click',sendAiChat);
  document.getElementById('aiChatInput').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();sendAiChat();}});
  document.getElementById('addEmployee').addEventListener('click',async function(){
    var name=document.getElementById('aeName').value.trim();
    if(!name){setMsg('aemsg','err','Give the assistant a name.');return;}
    var toolsRaw=document.getElementById('aeTools').value.trim();
    var toolNames=toolsRaw?toolsRaw.split(',').map(function(s){return s.trim();}).filter(Boolean):[];
    setMsg('aemsg','','Creating\\u2026');
    var r=await api('/api/platform/ai/employees',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,title:document.getElementById('aeTitle').value.trim(),persona:document.getElementById('aePersona').value,toolNames:toolNames})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){setMsg('aemsg','ok','Assistant created.');document.getElementById('aeName').value='';document.getElementById('aeTitle').value='';document.getElementById('aePersona').value='';document.getElementById('aeTools').value='';loadAiEmployees();}
    else{setMsg('aemsg','err',(x.error&&x.error.message)||'Could not create assistant.');}
  });
  document.getElementById('addWorkflow').addEventListener('click',async function(){
    var tpl=WF_TEMPLATES[document.getElementById('wftemplate').value];
    if(!tpl){setMsg('wfmsg','err','Pick a template.');return;}
    setMsg('wfmsg','','Creating\\u2026');
    var r=await api('/api/platform/workflows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:tpl.name,trigger:tpl.trigger,steps:tpl.steps})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){setMsg('wfmsg','ok','Automation created and active.');loadWorkflows();}
    else{setMsg('wfmsg','err',(x.error&&x.error.message)||'Could not create automation.');}
  });
  document.getElementById('addCollection').addEventListener('click',async function(){
    var n=document.getElementById('kbcname');
    if(!n.value.trim()){setMsg('kbmsg','err','A collection needs a name.');return;}
    var r=await api('/api/platform/knowledge/collections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n.value.trim()})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){n.value='';setMsg('kbmsg','ok','Collection created.');loadCollections();}
    else{setMsg('kbmsg','err',(x.error&&x.error.message)||'Could not create collection.');}
  });
  document.getElementById('addDocument').addEventListener('click',async function(){
    var id=document.getElementById('kbcollection').value;
    var nm=document.getElementById('kbdocname'),ct=document.getElementById('kbdoccontent');
    if(!id){setMsg('kbmsg','err','Create/select a collection first.');return;}
    if(!nm.value.trim()||!ct.value.trim()){setMsg('kbmsg','err','A document needs a name and text.');return;}
    setMsg('kbmsg','','Indexing\\u2026');
    var r=await api('/api/platform/knowledge/collections/'+encodeURIComponent(id)+'/documents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:nm.value.trim(),content:ct.value,mimeType:'text/plain'})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){nm.value='';ct.value='';setMsg('kbmsg','ok','Document indexed.');loadKbDocs();}
    else{setMsg('kbmsg','err',(x.error&&x.error.message)||'Could not add document.');}
  });
  document.getElementById('kbcollection').addEventListener('change',loadKbDocs);
  document.getElementById('askKnowledge').addEventListener('click',async function(){
    var id=document.getElementById('kbcollection').value;
    var q=document.getElementById('kbquestion');
    if(!id||!q.value.trim()){setMsg('kbmsg','err','Select a collection and ask a question.');return;}
    setMsg('kbmsg','','Searching\\u2026');
    var r=await api('/api/platform/knowledge/collections/'+encodeURIComponent(id)+'/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q.value.trim()})});
    var d=r.ok?await r.json():{chunks:[]};
    var el=document.getElementById('kbanswer'); clear(el);
    if(!r.ok){setMsg('kbmsg','err','Search failed.');return;}
    setMsg('kbmsg','','');
    if(!(d.chunks||[]).length){el.appendChild(emptyMsg('No relevant passages found in this collection.'));return;}
    var cite=document.createElement('div');cite.className='hint';cite.textContent='Sources: '+(d.citations||[]).map(esc).join(', ');el.appendChild(cite);
    d.chunks.forEach(function(c){
      var row=document.createElement('div');row.className='item';row.style.flexDirection='column';row.style.alignItems='stretch';
      var src=document.createElement('div');src.className='sub';src.textContent=esc(c.documentName);src.style.fontWeight='600';row.appendChild(src);
      var body=document.createElement('div');body.style.fontSize='0.85rem';body.textContent=esc(c.content.slice(0,400))+(c.content.length>400?'…':'');row.appendChild(body);
      el.appendChild(row);
    });
  });
  document.getElementById('addForm').addEventListener('click',async function(){
    var n=document.getElementById('fmname'),tpl=document.getElementById('fmtemplate');
    if(!n.value.trim()){setMsg('fmmsg','err','A form needs a name.');return;}
    setMsg('fmmsg','','Creating\\u2026');
    var fields=FORM_TEMPLATES[tpl.value]||FORM_TEMPLATES.contact;
    var r=await api('/api/platform/forms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n.value.trim(),fields:fields})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){n.value='';setMsg('fmmsg','ok','Form created — share its link.');loadForms();}
    else{setMsg('fmmsg','err',(x.error&&x.error.message)||'Could not create form.');}
  });
  document.getElementById('addSequence').addEventListener('click',async function(){
    var n=document.getElementById('dsname'),tr=document.getElementById('dstrigger');
    if(!n.value.trim()){setMsg('dsmsg','err','A sequence needs a name.');return;}
    setMsg('dsmsg','','Creating\\u2026');
    var r=await api('/api/platform/drip/sequences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n.value.trim(),trigger:tr.value})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){n.value='';setMsg('dsmsg','ok','Sequence created. Add steps below.');loadDrip();}
    else{setMsg('dsmsg','err',(x.error&&x.error.message)||'Could not create sequence.');}
  });
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
