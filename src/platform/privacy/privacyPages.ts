import { escapeHtml } from "../legal/legalMarkdown";
import {
  PRIVACY_CATEGORIES,
  PRIVACY_CATEGORY_LABELS,
} from "./PrivacyRequest";
import type { RequesterStatusView } from "./PrivacyRequestService";

/**
 * Public, accessible, self-contained pages for the privacy-request workflow:
 * the intake form, the verification result, and the requester status page.
 * All dynamic values are HTML-escaped; there is no raw HTML from user input.
 */

const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$/;
function accent(c?: string | null): string {
  return c && SAFE_COLOR.test(c) ? c : "#0f766e";
}

function shell(
  title: string,
  brandName: string,
  accentColor: string | null | undefined,
  main: string,
): string {
  const a = accent(accentColor);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · ${escapeHtml(brandName)}</title>
  <style>
    :root{--ink:#14181f;--muted:#5b6472;--line:#e4e7ee;--bg:#f7f8fb;--card:#fff;--accent:${a};--warn-bg:#fef3c7;--warn:#92400e;}
    @media (prefers-color-scheme:dark){:root{--ink:#eef2f9;--muted:#9aa6b8;--line:#223049;--bg:#0b1220;--card:#121a2b;--warn-bg:#3b2f10;--warn:#fcd34d;}}
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
    a{color:var(--accent)} a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
    .wrap{max-width:640px;margin:0 auto;padding:24px 20px 64px}
    header{font-weight:800;border-bottom:1px solid var(--line);padding:14px 0;margin-bottom:8px}
    .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px;margin-top:16px}
    h1{font-size:1.6rem;margin:0 0 6px;text-wrap:balance}
    p.sub{color:var(--muted);margin:0 0 14px}
    label{display:block;font-weight:600;font-size:.9rem;margin:14px 0 4px}
    input,select,textarea{width:100%;padding:11px 13px;background:var(--bg);border:1px solid var(--line);border-radius:10px;color:var(--ink);font:inherit}
    textarea{min-height:120px;resize:vertical}
    .warn{background:var(--warn-bg);color:var(--warn);border-radius:10px;padding:12px 14px;font-size:.9rem;margin:12px 0}
    .consent{display:flex;gap:9px;align-items:flex-start;font-weight:400;font-size:.9rem;margin:14px 0 4px}
    .consent input{width:16px;height:16px;flex:none;margin-top:3px}
    .btn{appearance:none;border:none;background:var(--accent);color:#fff;border-radius:10px;padding:12px 16px;font:inherit;font-weight:700;cursor:pointer;margin-top:16px}
    .msg{min-height:1.2em;font-weight:600;margin-top:12px}
    .msg.err{color:#dc2626}.msg.ok{color:#16a34a}
    .hint{color:var(--muted);font-size:.85rem}
    dl.status{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:10px 0}
    dl.status dt{font-weight:700;color:var(--muted)} dl.status dd{margin:0}
    .pill{display:inline-block;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;border:1px solid var(--accent);color:var(--accent);border-radius:999px;padding:3px 9px}
    @media print{.btn{display:none}}
  </style>
</head>
<body>
  <div class="wrap">
    <header>${escapeHtml(brandName)}</header>
    <main id="main">${main}</main>
  </div>
</body>
</html>`;
}

export interface IntakePageContext {
  brandName: string;
  accentColor?: string | null;
  /** "platform" or "tenant" — decided by the server from the host. */
  destinationLabel: string;
}

export function privacyIntakePage(ctx: IntakePageContext): string {
  const cats = PRIVACY_CATEGORIES.map(
    (c) =>
      `<option value="${c}">${escapeHtml(PRIVACY_CATEGORY_LABELS[c])}</option>`,
  ).join("");
  const main = `
  <div class="card">
    <h1>Privacy request</h1>
    <p class="sub">Submit a privacy request to ${escapeHtml(ctx.brandName)}. These are request categories, not guaranteed legal entitlements in every jurisdiction.</p>
    <form id="f" novalidate>
      <label for="name">Your name</label>
      <input id="name" name="name" autocomplete="name" required />
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" autocomplete="email" required />
      <label for="category">Request type</label>
      <select id="category" name="category" required>${cats}</select>
      <label for="relationship">Your relationship (optional)</label>
      <input id="relationship" name="relationship" placeholder="e.g. customer, account holder, website visitor" />
      <label for="description">Describe your request</label>
      <textarea id="description" name="description" required></textarea>
      <div class="warn" role="note">Do not include passwords, payment-card numbers, government ID numbers, medical records, or other highly sensitive information in your description.</div>
      <label class="consent" for="ack"><input type="checkbox" id="ack" /> <span>I understand additional identity verification may be required before this request can be completed.</span></label>
      <div class="msg" id="msg" role="status" aria-live="polite"></div>
      <button class="btn" type="submit">Submit request</button>
      <p class="hint" style="margin-top:12px">We'll email you a link to verify your address. Verifying confirms control of the email — it does not by itself establish full identity.</p>
    </form>
  </div>
  <script>
  var f=document.getElementById('f'),msg=document.getElementById('msg');
  f.addEventListener('submit',async function(e){
    e.preventDefault();msg.className='msg';
    if(!document.getElementById('ack').checked){msg.className='msg err';msg.textContent='Please acknowledge the verification notice.';return;}
    msg.textContent='Submitting…';
    var body={name:name.value.trim(),email:email.value.trim(),category:category.value,relationship:relationship.value.trim(),description:description.value.trim(),acknowledge:true};
    try{
      var r=await fetch('/privacy-requests',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      var d=await r.json().catch(function(){return{};});
      if(r.ok){msg.className='msg ok';msg.textContent=d.message||'Thanks. If the details are valid, we\\'ve sent a verification email.';f.querySelector('button').disabled=true;}
      else{msg.className='msg err';msg.textContent=(d.error&&d.error.message)||'Could not submit. Please try again later.';}
    }catch(_){msg.className='msg err';msg.textContent='Network error.';}
  });
  </script>`;
  return shell("Privacy request", ctx.brandName, ctx.accentColor, main);
}

export function privacyVerifyResultPage(
  ctx: IntakePageContext,
  outcome: "ok" | "invalid" | "expired" | "already_used",
  statusUrl?: string,
): string {
  let body: string;
  if (outcome === "ok") {
    body = `<h1>Email verified</h1>
      <p class="sub">Thank you. Your privacy request has been received and is now with ${escapeHtml(ctx.brandName)}. Verifying confirms control of this email address; additional identity verification may still be required.</p>
      ${statusUrl ? `<p>You can check the status of your request here:</p><p><a href="${escapeHtml(statusUrl)}">View request status</a></p><p class="hint">Save this link — it is private to you.</p>` : ""}`;
  } else {
    const m: Record<string, string> = {
      invalid: "This verification link is not valid.",
      expired: "This verification link has expired.",
      already_used: "This verification link has already been used.",
    };
    body = `<h1>Verification link</h1><p class="sub">${escapeHtml(m[outcome])} You can submit a new privacy request if needed.</p>`;
  }
  return shell(
    "Verify privacy request",
    ctx.brandName,
    ctx.accentColor,
    `<div class="card">${body}</div>`,
  );
}

export function privacyStatusPage(
  ctx: IntakePageContext,
  view: RequesterStatusView | undefined,
): string {
  if (!view) {
    return shell(
      "Request status",
      ctx.brandName,
      ctx.accentColor,
      `<div class="card"><h1>Request status</h1><p class="sub">This status link is not valid.</p></div>`,
    );
  }
  const messages = view.messages.length
    ? view.messages
        .map(
          (m) =>
            `<li>${escapeHtml(m.body)} <span class="hint">(${escapeHtml(m.createdAt.slice(0, 10))})</span></li>`,
        )
        .join("")
    : `<li class="hint">No messages yet.</li>`;
  const main = `<div class="card">
    <h1>Privacy request status</h1>
    <dl class="status">
      <dt>Reference</dt><dd>${escapeHtml(view.reference)}</dd>
      <dt>Type</dt><dd>${escapeHtml(view.categoryLabel)}</dd>
      <dt>Email verified</dt><dd>${view.verification === "email_verified" ? "Yes" : "No"}</dd>
      <dt>Status</dt><dd><span class="pill">${escapeHtml(view.status.replace(/_/g, " "))}</span></dd>
      <dt>Submitted</dt><dd>${escapeHtml(view.createdAt.slice(0, 10))}</dd>
      <dt>Updated</dt><dd>${escapeHtml(view.updatedAt.slice(0, 10))}</dd>
    </dl>
    ${view.resolutionSummary ? `<p><strong>Resolution:</strong> ${escapeHtml(view.resolutionSummary)}</p>` : ""}
    <h2 style="font-size:1.05rem;margin:18px 0 6px">Messages</h2>
    <ul>${messages}</ul>
  </div>`;
  return shell("Request status", ctx.brandName, ctx.accentColor, main);
}
