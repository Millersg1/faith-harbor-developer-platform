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
import { DASHBOARD_FORMAT_FNS } from "./dashboardFormat";

/** The tested format helpers, serialized so the browser runs the exact code. */
const DASHBOARD_HELPERS_JS =
  DASHBOARD_FORMAT_FNS.map((fn) =>
    fn.toString(),
  ).join("\n");

const STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --accent: #2dd4bf;
    --accent-strong: #14b8a6;
    --accent-ink: #06231f;
    --bg: #0b1220;
    --surface: #131f33;
    --surface-2: #172740;
    --surface-3: #1e3050;
    --card: #142137;
    --border: rgba(255,255,255,0.12);
    --line: rgba(255,255,255,0.10);
    --text: #eef3fa;
    --muted: #aebccd;
    --muted-strong: #cdd8e6;
    --danger: #f87171;
    --warn: #fbbf24;
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
    background: center / cover no-repeat url("/favicon-192.png");
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
  input, select, textarea {
    width: 100%; padding: 12px 14px; font-size: 0.95rem; font-family: inherit;
    color: var(--text); background: rgba(0,0,0,0.25);
    border: 1px solid var(--border); border-radius: 11px; outline: none;
  }
  select { appearance: none; }
  textarea { resize: vertical; min-height: 68px; line-height: 1.5; }
  input::placeholder, textarea::placeholder { color: var(--muted); opacity: 0.85; }
  input:focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(45,212,191,0.18); }
  input:disabled, select:disabled, textarea:disabled { opacity: 0.55; cursor: not-allowed; }
  /* Keep autofilled fields on the dark surface (Chrome overrides otherwise). */
  input:-webkit-autofill, textarea:-webkit-autofill, select:-webkit-autofill {
    -webkit-text-fill-color: var(--text); caret-color: var(--text);
    box-shadow: 0 0 0 1000px var(--surface-2) inset; transition: background-color 9999s ease-out; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; margin-top: 20px; padding: 12px 16px; font-size: 0.95rem; font-weight: 700;
    color: var(--accent-ink); background: var(--accent); border: 0; border-radius: 11px; cursor: pointer;
  }
  .btn:hover { filter: brightness(1.07); }
  .btn:active { transform: translateY(1px); }
  .btn:disabled, .btn[disabled] { opacity: 0.45; cursor: not-allowed; filter: none; transform: none; }
  .btn.sec { background: transparent; color: var(--text); border: 1px solid var(--border); }
  /* Secondary button — clearly visible on the dark surface, never accent-tinted
     (so a dark tenant brand color can't make it disappear). Both class spellings. */
  .btn.ghost, .btn-ghost { width: auto; margin: 0; padding: 9px 15px; font-weight: 600;
    background: var(--surface-3); color: var(--text); border: 1px solid var(--border); }
  .btn.ghost:hover, .btn-ghost:hover { background: #26406a; border-color: var(--accent); filter: none; color: #fff; }
  .btn.ghost:active, .btn-ghost:active { transform: translateY(1px); }
  /* Visible keyboard focus everywhere. */
  a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible,
  [tabindex]:focus-visible, .secnav a:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 8px; }
  .row { display: flex; gap: 10px; }
  .alt { margin-top: 18px; font-size: 0.88rem; color: var(--muted); text-align: center; }
  .msg { min-height: 1.2em; margin-top: 14px; font-size: 0.86rem; font-weight: 600; }
  .msg.err { color: var(--danger); }
  .msg.ok { color: var(--ok); }

  /* App shell */
  .topbar { border-bottom: 1px solid var(--border); background: rgba(11,18,32,0.7); backdrop-filter: blur(8px); position: sticky; top: 0; }
  .topbar .wrap { display: flex; align-items: center; justify-content: space-between; gap: 10px; row-gap: 10px; flex-wrap: wrap; padding-top: 14px; padding-bottom: 14px; }
  /* On phones the greeting already shows the identity, so drop the duplicate
     topbar label to keep the header on one line without horizontal overflow. */
  @media (max-width: 560px) { #who { display: none; } }
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
  /* Accent-filled chip: the tenant accent as the background with luminance-
     chosen ink on top, so it stays AA-readable for any brand color (a tinted
     background with accent-colored text failed for dark/mid brand colors). */
  .pill { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 3px 9px; border-radius: 999px; background: var(--accent); color: var(--accent-ink); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  @media (max-width: 720px) { .grid2 { grid-template-columns: 1fr; } }
  .secnav { position: sticky; top: 0; z-index: 20; display: flex; gap: 8px; overflow-x: auto;
    padding: 10px; margin-bottom: 16px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 11px; }
  .secnav a { white-space: nowrap; font-size: 0.78rem; color: var(--muted); text-decoration: none; cursor: pointer;
    padding: 6px 13px; border: 1px solid var(--border); border-radius: 999px; user-select: none; }
  .secnav a:hover { color: var(--text); border-color: var(--accent); }
  .secnav a.active { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); font-weight: 700; }
  .sec-hide { display: none !important; }
  [id^="sec_"] { scroll-margin-top: 64px; }

  /* Dashboard Home */
  .dash-hero h1 { font-size: 1.55rem; letter-spacing: -0.02em; }
  .dash-hero p { color: var(--muted-strong); font-size: 0.92rem; margin-top: 4px; }
  /* Responsive metric grid: phone 2, tablet 3, desktop 4 columns (so 7 cards
     read as a balanced 4 + 3). minmax(0,1fr) keeps long labels from forcing
     horizontal overflow. */
  .metrics { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; }
  @media (min-width: 640px) { .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (min-width: 940px) { .metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  @media (max-width: 380px) { .metrics { grid-template-columns: 1fr; } }
  .metric { display: block; padding: 15px 16px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; color: var(--text); text-decoration: none; transition: border-color .15s ease, transform .15s ease; }
  .metric:hover { border-color: var(--accent); transform: translateY(-1px); }
  .metric .n { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .metric .l { color: var(--muted); font-size: 0.78rem; margin-top: 3px; }
  .metric.unavail { border-style: dashed; }
  .metric.unavail .n { color: var(--muted); font-size: 0.95rem; font-weight: 600; }
  .qa { display: flex; flex-wrap: wrap; gap: 10px; }
  .qa button { display: inline-flex; align-items: center; gap: 7px; padding: 10px 14px; font-size: 0.85rem; font-weight: 600;
    background: var(--surface-2); color: var(--text); border: 1px solid var(--border); border-radius: 10px; cursor: pointer; }
  .qa button:hover { border-color: var(--accent); background: var(--surface-3); }
  .progress { height: 10px; background: var(--surface-3); border: 1px solid var(--border); border-radius: 99px; overflow: hidden; }
  .progress > span { display: block; height: 100%; background: linear-gradient(90deg, var(--accent-strong), var(--accent)); border-radius: 99px; transition: width .35s ease; }
  .legal-progress-wrap { margin: 10px 0 14px; }
  .legal-progress-wrap .hint { margin: 0 0 6px; }
  .legal-field-help { margin: 5px 0 0 !important; }
  .legal-required { color: #fcd34d; font-size: 0.78rem; font-weight: 700; margin-top: 4px; }
  .legal-required.answered { color: var(--ok); }
  #legalQ .unanswered { border-color: #fbbf24; }
  .badge { display: inline-block; font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; padding: 3px 9px; border-radius: 999px; }
  .badge.ok { background: rgba(74,222,128,0.18); color: #9df0b8; }
  .badge.warn { background: rgba(251,191,36,0.18); color: #fcd34d; }
  .badge.muted { background: rgba(174,188,205,0.16); color: var(--muted-strong); }
  .subtle-btn { background: none; border: 0; color: var(--accent); font-size: 0.82rem; font-weight: 600; cursor: pointer; padding: 0; }
  .subtle-btn:hover { text-decoration: underline; }

  /* ---- Website workspace ---- */
  /* Every Website panel spans the full grid width, so the AI builder no longer
     stretches to match the tall catalog beside it (the old empty column). */
  [data-websub], [data-aisub] { grid-column: 1 / -1; }
  .websub-hide, .aisub-hide { display: none !important; }
  .websubnav, .aisubnav { grid-column: 1 / -1; display: flex; gap: 8px; overflow-x: auto; padding: 8px;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; margin-top: 18px; }
  .websubnav button, .aisubnav button { white-space: nowrap; font-size: 0.82rem; font-weight: 600; color: var(--muted); cursor: pointer;
    background: transparent; border: 1px solid var(--border); border-radius: 999px; padding: 7px 14px; }
  .websubnav button:hover, .aisubnav button:hover { color: var(--text); border-color: var(--accent); }
  .websubnav button.active, .aisubnav button.active { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
  .websubnav button:focus-visible, .aisubnav button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  /* ---- AI Command Center conversation ---- */
  .chat-wrap { display: grid; grid-template-columns: 240px 1fr; gap: 14px; align-items: start; }
  @media (max-width: 760px) { .chat-wrap { grid-template-columns: 1fr; } .chat-threads { max-height: 180px; } }
  .chat-threads { display: flex; flex-direction: column; gap: 6px; max-height: 440px; overflow-y: auto; }
  .chat-threads .thread { text-align: left; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;
    padding: 9px 11px; cursor: pointer; color: var(--text); font-size: 0.85rem; width: 100%; }
  .chat-threads .thread:hover { border-color: var(--accent); }
  .chat-threads .thread.active { border-color: var(--accent); background: var(--surface-3); }
  .chat-threads .thread .sub { color: var(--muted); font-size: 0.72rem; margin-top: 2px; }
  .chat-main { display: flex; flex-direction: column; min-width: 0; }
  .chat-log { display: flex; flex-direction: column; gap: 10px; min-height: 220px; max-height: 460px; overflow-y: auto; padding: 4px; }
  .bubble { max-width: 88%; padding: 9px 13px; border-radius: 13px; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
  .bubble.user { align-self: flex-end; background: var(--accent); color: var(--accent-ink); border-bottom-right-radius: 4px; }
  .bubble.assistant { align-self: flex-start; background: var(--surface-2); border: 1px solid var(--border); border-bottom-left-radius: 4px; }
  .bubble .meta { display: block; font-size: 0.68rem; opacity: 0.7; margin-top: 5px; }
  .bubble .copy { background: none; border: 0; color: inherit; opacity: 0.6; cursor: pointer; font-size: 0.7rem; padding: 0; margin-top: 4px; width: auto; }
  .bubble .copy:hover { opacity: 1; text-decoration: underline; }
  .chat-step { align-self: flex-start; font-size: 0.76rem; color: var(--muted); padding: 2px 4px; }
  .chat-cite { align-self: flex-start; font-size: 0.74rem; color: var(--muted-strong); background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 8px; padding: 6px 10px; max-width: 88%; }
  .approve-card { align-self: flex-start; max-width: 92%; border: 1px solid var(--warn); border-radius: 11px; padding: 11px 13px; background: rgba(251,191,36,0.06); }
  .kv { display: grid; grid-template-columns: max-content 1fr; gap: 3px 10px; font-size: 0.82rem; margin: 6px 0; }
  .kv .k { color: var(--muted); }
  .kv .v { color: var(--text); word-break: break-word; font-variant-numeric: tabular-nums; }
  /* AI Employee tool picker */
  .toolpick { max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: 11px; padding: 10px 12px; background: rgba(0,0,0,0.18); }
  .toolpick .grp { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin: 10px 0 5px; }
  .toolpick .grp:first-child { margin-top: 0; }
  .toolpick label { display: flex; align-items: flex-start; gap: 9px; margin: 5px 0; text-transform: none; font-size: 0.85rem;
    font-weight: 500; color: var(--text); letter-spacing: 0; cursor: pointer; }
  .toolpick label input { width: auto; flex: none; margin-top: 2px; }
  .wtag { display: inline-block; font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; border-radius: 5px; padding: 1px 6px; white-space: nowrap; }
  .wtag.w { color: #fcd34d; border: 1px solid rgba(251,191,36,0.45); background: rgba(251,191,36,0.08); }
  .wtag.r { color: #9df0b8; border: 1px solid rgba(74,222,128,0.4); background: rgba(74,222,128,0.08); }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  /* Responsive template/package card grid: phone 1, tablet 2, desktop 3. */
  .cardgrid { display: grid; gap: 14px; grid-template-columns: 1fr; }
  @media (min-width: 620px) { .cardgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (min-width: 960px) { .cardgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .tcard { display: flex; flex-direction: column; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 12px; overflow: hidden; }
  .tcard .thumb { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; object-position: top; background: var(--surface-3); display: block; }
  .tcard .thumb.ph { display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 0.8rem; }
  .tcard .body { padding: 13px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .tcard .ttl { font-weight: 700; font-size: 0.95rem; }
  .tcard .desc { color: var(--muted); font-size: 0.83rem; line-height: 1.45; }
  .tcard .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding-top: 4px; }
  /* Kind labels distinguish the two collections with an icon + words, not color alone. */
  .kind { display: inline-flex; align-items: center; gap: 5px; font-size: 0.66rem; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.04em; padding: 3px 8px; border-radius: 6px; border: 1px solid var(--border); }
  .kind.pkg { background: rgba(99,102,241,0.16); color: #c3c7ff; }
  .kind.tpl { background: rgba(45,212,191,0.14); color: #7fe7d6; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 6px 0 14px; }
  .filters input, .filters select { width: auto; min-width: 140px; padding: 8px 11px; font-size: 0.85rem; }
  .filters input { flex: 1; min-width: 180px; }
  /* Confirmation dialog */
  .dlg-back { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 5vh 16px; }
  .dlg { width: 100%; max-width: 460px; background: var(--card); border: 1px solid var(--border); border-radius: 16px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.5); max-height: 90vh; overflow: auto; }
  .dlg .dlg-h { padding: 18px 20px 6px; font-size: 1.05rem; font-weight: 700; }
  .dlg .dlg-b { padding: 4px 20px 8px; color: var(--muted-strong); font-size: 0.9rem; }
  .dlg .dlg-b ul { margin: 8px 0 0; padding-left: 18px; }
  .dlg .dlg-b li { margin: 4px 0; }
  .dlg .dlg-f { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 20px 18px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; scroll-behavior: auto !important; } }
  .dns { margin-top: 10px; padding: 12px 14px; background: var(--surface); border: 1px dashed var(--border); border-radius: 10px; }
  .dns .hint { margin-bottom: 10px; }
  .dns .rec { display: flex; flex-direction: column; gap: 8px; }
  .dns .rec > div { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .dns .k { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); min-width: 42px; }
  .dns code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.82rem; color: var(--text);
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px; word-break: break-all; }
  .consent { display: flex; gap: 9px; align-items: flex-start; font-weight: 400;
    margin: 12px 0 4px; font-size: 0.9rem; line-height: 1.45; cursor: pointer; }
  .consent input { margin-top: 3px; flex: none; width: 16px; height: 16px; }
  .legalfoot { display: flex; flex-wrap: wrap; gap: 8px 18px; justify-content: center;
    padding: 22px 16px; margin-top: 8px; border-top: 1px solid var(--border); }
  .legalfoot a { color: var(--muted); font-size: 0.85rem; text-decoration: none; }
  .legalfoot a:hover { color: var(--text); text-decoration: underline; }
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
<meta name="theme-color" content="#0b1220" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<title>${opts.title}</title>
<style>${STYLES}</style>
</head>
<body>
${opts.body}
<footer class="legalfoot" role="contentinfo">
<a href="/legal/terms">Terms</a>
<a href="/legal/privacy">Privacy</a>
<a href="/legal/cookies">Cookies</a>
<a href="/legal/subscriptions">Subscriptions</a>
<a href="/legal">All policies</a>
</footer>
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
    <label class="consent" for="accept"><input type="checkbox" id="accept" /> <span>I agree to the <a href="/legal/terms" target="_blank" rel="noopener">Terms of Service</a> and <a href="/legal/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
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
  var acceptEl=document.getElementById('accept');
  f.addEventListener('submit',async function(e){
    e.preventDefault(); msg.className='msg';
    // Require affirmative, unchecked-by-default consent before submitting.
    if(!acceptEl.checked){msg.className='msg err';msg.textContent='Please agree to the Terms of Service and Privacy Policy to continue.';return;}
    msg.textContent='Creating…';
    try{
      var r=await fetch('/auth/signup',{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({organizationName:orgEl.value.trim(),name:nameEl.value.trim(),
          email:emailEl.value.trim(),password:pwEl.value,acceptTerms:acceptEl.checked})});
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
  var params=new URLSearchParams(location.search);
  var token=params.get('token')||'';
  // Pre-fill the organization from the emailed link so the user needn't know it.
  var orgParam=params.get('org')||'';
  if(orgParam){orgEl.value=orgParam;}
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
      if(r.ok){
        // Remotely-supplied copy is rendered as TEXT only — never innerHTML —
        // so a malicious confirmation message can't execute.
        var h=document.createElement('h1');h.textContent='Thank you';
        var p=document.createElement('p');p.textContent=(d.confirmationMessage)||'Your submission was received.';
        f.replaceChildren(h,p);
        // Lead-magnet redirect (transactional): only ever to an absolute http(s)
        // URL the server already validated and returned. Never eval/innerHTML.
        if(typeof d.redirectUrl==='string'&&/^https?:\/\//i.test(d.redirectUrl)){
          var a=document.createElement('a');a.href=d.redirectUrl;a.textContent='Continue';a.rel='noopener noreferrer';
          p.after(document.createElement('br'),a);
        }
      }
      else{msg.className='msg err';msg.textContent=(d.error&&d.error.message)||'Could not submit.';}
    }catch(_){msg.className='msg err';msg.textContent='Network error.';}
  });`;

  return layout({
    title: esc(form.name),
    body,
    script,
  });
}

/**
 * Owner/admin domain-registration workspace (Stage 11). Accessible, responsive,
 * server-rendered shell; all data is fetched from /api/platform/domains and
 * rendered client-side with textContent (never innerHTML from API data). Honest
 * copy throughout: sandbox status, provider-sync freshness, propagation is never
 * "instant", and unknown states are surfaced for review rather than hidden.
 */
export function domainsPage(): string {
  const body = `
  <a href="#mainContent" class="visually-hidden">Skip to main content</a>
  <header class="topbar"><div class="wrap">
    <div class="brand">${LOGO} <span>Domains</span></div>
    <a class="btn ghost" href="/app" style="width:auto;padding:8px 12px;">&larr; Workspace</a>
  </div></header>
  <main class="wrap" id="mainContent" tabindex="-1">
    <h1>Domain registration</h1>
    <p class="muted" id="modeBanner" role="status" aria-live="polite">Checking domain features…</p>

    <section class="card" aria-labelledby="searchH">
      <h2 id="searchH">Search &amp; transparent pricing</h2>
      <form id="searchForm" class="row" style="gap:10px;align-items:flex-end;">
        <div style="flex:1;min-width:200px;">
          <label for="q">Domain to search</label>
          <input id="q" name="q" type="text" inputmode="url" autocomplete="off"
            placeholder="example.com" aria-describedby="qHelp" />
          <p id="qHelp" class="muted" style="font-size:0.82rem;">Registration, renewal and transfer prices are shown separately. A promotional first-year price is never shown as the renewal price.</p>
        </div>
        <button class="btn" type="submit">Search</button>
      </form>
      <div id="searchResults" role="region" aria-live="polite" aria-label="Search results"></div>
    </section>

    <section class="card" aria-labelledby="listH">
      <h2 id="listH">Your domains</h2>
      <p class="muted" style="font-size:0.82rem;">Registration status, provider-sync freshness, DNS authority, and any items needing attention are shown per domain. Cached provider data is labelled with its last verified time.</p>
      <div id="domainList" role="region" aria-live="polite" aria-label="Registered domains">
        <p class="muted">Loading…</p>
      </div>
    </section>

    <p class="msg" id="msg" role="alert" style="display:none;"></p>
  </main>`;

  const script = `
  (function(){
    var msg=document.getElementById('msg');
    function show(t,ok){msg.textContent=t;msg.className='msg '+(ok?'ok':'err');msg.style.display='block';}
    function txt(el,t){el.textContent=(t==null?'':String(t));}
    function get(u){return fetch(u,{credentials:'include',headers:{'Accept':'application/json'}});}
    // Load the domain list; honestly report when the feature isn't enabled.
    get('/api/platform/domains').then(function(r){
      var banner=document.getElementById('modeBanner');
      if(r.status===404||r.status===501){txt(banner,'Domain management is not enabled for this workspace yet.');return {registrations:[]};}
      txt(banner,'Domain management is running in sandbox/test mode. No live registrations, charges, DNS changes, or transfers occur.');
      return r.json();
    }).then(function(d){
      var host=document.getElementById('domainList');host.textContent='';
      var regs=(d&&d.registrations)||[];
      if(!regs.length){var p=document.createElement('p');p.className='muted';txt(p,'No domains yet.');host.appendChild(p);return;}
      var ul=document.createElement('ul');ul.style.listStyle='none';ul.style.padding='0';
      regs.forEach(function(reg){
        var li=document.createElement('li');li.className='panel';li.style.marginBottom='10px';
        var name=document.createElement('strong');txt(name,reg.asciiDomain);li.appendChild(name);
        var st=document.createElement('span');st.className='muted';st.style.marginLeft='8px';
        txt(st,'status: '+(reg.status||'unknown')+(reg.expiresAt?(' · expires '+reg.expiresAt):''));
        li.appendChild(st);ul.appendChild(li);
      });
      host.appendChild(ul);
    }).catch(function(){show('Could not load domains.',false);});
    // Search.
    document.getElementById('searchForm').addEventListener('submit',function(e){
      e.preventDefault();
      var q=document.getElementById('q').value.trim();var out=document.getElementById('searchResults');out.textContent='';
      if(!q)return;
      var pending=document.createElement('p');pending.className='muted';txt(pending,'Searching…');out.appendChild(pending);
      get('/api/platform/domains/search?q='+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(d){
        out.textContent='';var results=(d&&d.results)||[];
        if(!results.length){var p=document.createElement('p');p.className='muted';txt(p,'No pricing available (registrar not configured).');out.appendChild(p);return;}
        var ul=document.createElement('ul');ul.style.listStyle='none';ul.style.padding='0';
        results.forEach(function(res){var li=document.createElement('li');li.className='panel';txt(li,JSON.stringify(res));ul.appendChild(li);});
        out.appendChild(ul);
      }).catch(function(){out.textContent='';var p=document.createElement('p');p.className='msg err';txt(p,'Search failed.');out.appendChild(p);});
    });
  })();`;

  return layout({ title: "Domains — All Elite Cloud", body, script });
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
        <div id="notifPanel" role="menu" style="display:none;position:absolute;right:0;top:44px;width:340px;max-width:88vw;max-height:60vh;overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.18);z-index:50;">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--line);">
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
    <div style="max-width:580px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,0.35);overflow:hidden;">
      <input id="paletteInput" placeholder="Search clients, leads, invoices… or type a command" autocomplete="off" spellcheck="false" style="width:100%;box-sizing:border-box;border:0;outline:0;padding:16px 18px;font-size:1rem;background:transparent;color:inherit;border-bottom:1px solid var(--line);" />
      <div id="paletteResults" style="max-height:56vh;overflow:auto;"></div>
      <div style="padding:8px 14px;font-size:0.72rem;opacity:0.6;border-top:1px solid var(--line);">&#8593;&#8595; to navigate · Enter to open · Esc to close</div>
    </div>
  </div>
  <div id="journey" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:100;padding:8vh 16px 16px;">
    <div style="max-width:600px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,0.35);overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line);">
        <strong id="journeyTitle" style="font-size:0.95rem;">Journey</strong>
        <button class="btn ghost" id="journeyClose" style="width:auto;padding:4px 10px;">Close</button>
      </div>
      <div id="journeyBody" style="max-height:64vh;overflow:auto;padding:6px 6px 10px;"><div class="empty" style="padding:16px;">Loading…</div></div>
    </div>
  </div>
  <main class="wrap" id="mainContent">
    <nav class="secnav" id="secnav" aria-label="Workspace sections"></nav>
    <div class="panel" id="dashHero" style="margin-bottom:18px;">
      <div class="dash-hero">
        <h1 id="greeting">Welcome</h1>
        <p id="dashSummary">Loading your workspace…</p>
      </div>
      <div class="metrics" id="metrics" style="margin-top:16px;"></div>
      <div id="quickActionsWrap" style="margin-top:18px;">
        <div class="hint" style="margin-bottom:8px;">Quick actions</div>
        <div class="qa" id="quickActions"></div>
      </div>
      <button class="subtle-btn" id="onbReopen" style="display:none;margin-top:14px;">Show setup checklist</button>
    </div>
    <div class="panel" id="onboardingPanel" style="margin-bottom:18px;display:none;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
        <div>
          <h2 style="margin-bottom:4px;">Get started <span class="pill" id="onbCount"></span></h2>
          <p class="hint" style="margin-bottom:0;">A few steps to get the most out of your workspace.</p>
        </div>
        <button class="btn btn-ghost" id="onbDismiss" style="display:none;font-size:0.8rem;">Hide</button>
      </div>
      <div class="progress" id="onbProgress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Setup progress" style="margin:14px 0 6px;">
        <span id="onbBar" style="width:0;"></span>
      </div>
      <div class="list" id="onbList"><div class="empty">Loading…</div></div>
    </div>
    <div class="panel" id="activityPanel" style="margin-bottom:18px;">
      <h2>Recent activity</h2>
      <p class="hint">The latest things that happened across your workspace.</p>
      <div class="list" id="activityFeed"><div class="empty">Loading…</div></div>
    </div>
    <div class="panel" id="billingPanel" style="margin-bottom:18px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:700;font-size:1.02rem;" id="planName">Plan</div>
            <div class="hint" id="planSummary" style="margin:2px 0 0;">Loading…</div>
          </div>
          <span class="badge muted" id="planStatus"></span>
        </div>
        <button class="btn btn-ghost" id="managePlan" style="display:none;font-size:0.82rem;">Manage plan</button>
      </div>
      <div id="billingWarning" role="alert" style="display:none;margin-top:12px;padding:10px 12px;border-radius:10px;border:1px solid var(--warn);background:rgba(251,191,36,0.08);">
        <div class="sub" id="billingWarningText" style="font-weight:600;"></div>
        <button class="btn" id="updatePayment" style="width:auto;margin-top:8px;display:none;">Update payment method</button>
      </div>
      <div id="planPickerWrap" style="display:none;gap:10px;align-items:flex-end;margin-top:14px;">
        <div class="f"><label for="planPicker">Change plan</label><select id="planPicker"></select></div>
        <button class="btn" id="changePlan" style="width:auto;">Update</button>
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
      <div class="websubnav" id="websubnav" role="tablist" aria-label="Website workspace">
        <button role="tab" data-websub="mywebsites" aria-controls="wsub-mywebsites">My Websites</button>
        <button role="tab" data-websub="create" aria-controls="wsub-create">Create Website</button>
        <button role="tab" data-websub="marketplace" aria-controls="wsub-marketplace">AI Employee Marketplace</button>
        <button role="tab" data-websub="templates" aria-controls="wsub-templates">Website Templates</button>
        <button role="tab" data-websub="hosting" aria-controls="wsub-hosting">Hosting &amp; Domains</button>
        <button role="tab" data-websub="branding" aria-controls="wsub-branding">Branding</button>
      </div>
      <div class="panel" data-websub="mywebsites" id="wsub-mywebsites" role="tabpanel" aria-label="My Websites" tabindex="0">
        <h2>My Websites</h2>
        <p class="hint">Your organization's sites — generate, preview, publish to a verified domain, or remove.</p>
        <div class="list" id="websites"><div class="empty">Loading…</div></div>
        <div class="msg" id="wlmsg"></div>
      </div>
      <div class="panel" data-websub="create" id="wsub-create" role="tabpanel" aria-label="Create Website" tabindex="0">
        <h2>Create a website</h2>
        <p class="hint">Describe a business and the AI builder drafts a complete site. Build for yourself or for a client on their own domain.</p>
        <div class="inline">
          <div class="f"><label for="wname">Website / business name</label><input id="wname" placeholder="Acme Bakery" /></div>
          <div class="f"><label for="wclient">Client (optional)</label><select id="wclient" class="client-select"></select></div>
        </div>
        <div class="f" style="margin-top:12px;"><label for="wbrief">Describe the business &amp; goals</label><input id="wbrief" placeholder="A family bakery in Miami known for Cuban pastries and custom cakes." /></div>
        <button class="btn" id="addWebsite" style="width:auto;margin-top:14px;">Create website</button>
        <p class="hint" id="wgenNote" style="margin-top:10px;"></p>
        <div class="msg" id="wmsg"></div>
      </div>
      <div class="panel" data-websub="marketplace" id="wsub-marketplace" role="tabpanel" aria-label="AI Employee Marketplace" tabindex="0">
        <h2>AI Employee Marketplace</h2>
        <p class="hint">Add a role-focused <strong>AI employee</strong> with its available website design, tools, and workflows. Installing is additive — it never overwrites an existing site, employee, or your branding.</p>
        <div class="filters">
          <input id="edSearch" type="search" placeholder="Search packages…" aria-label="Search AI employee packages" />
          <select id="edPlan" aria-label="Filter by eligibility"><option value="">All packages</option><option value="included">Included with my plan</option><option value="premium">Premium</option></select>
        </div>
        <div id="editions"><div class="empty">Loading…</div></div>
        <div style="text-align:center;margin-top:14px;"><button class="btn ghost" id="edMore" style="display:none;">Load more</button></div>
        <div class="msg" id="mktmsg"></div>
      </div>
      <div class="panel" data-websub="templates" id="wsub-templates" role="tabpanel" aria-label="Website Templates" tabindex="0">
        <h2>Website Templates</h2>
        <p class="hint">Choose a <strong>standalone website design</strong> for a new site. No AI employee is included — using one creates a draft you then generate and publish.</p>
        <p class="hint" style="font-style:italic;">Preview images are AI-generated <strong>samples</strong>; each site is generated fresh for your business, so your result will be unique.</p>
        <div class="filters">
          <input id="tplSearch" type="search" placeholder="Search templates…" aria-label="Search website templates" />
          <select id="tplIndustry" aria-label="Filter by industry"><option value="">All industries</option></select>
          <select id="tplPlan" aria-label="Filter by eligibility"><option value="">All templates</option><option value="included">Included with my plan</option><option value="premium">Premium</option></select>
        </div>
        <div id="marketplace"><div class="empty">Loading…</div></div>
        <div style="text-align:center;margin-top:14px;"><button class="btn ghost" id="tplMore" style="display:none;">Load more</button></div>
        <div class="msg" id="tplmsg"></div>
      </div>
      <div class="panel" data-websub="hosting" id="wsub-hosting" role="tabpanel" aria-label="Hosting and Domains" tabindex="0">
        <h2>Hosting accounts</h2>
        <p class="hint">Hosted sites in your organization. New accounts start <strong>pending</strong> until provisioned. Credentials are never shown here.</p>
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
      <div class="panel" id="brandsPanel" data-websub="branding" style="display:none;">
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
      <div class="aisubnav" id="aisubnav" role="tablist" aria-label="AI workspace">
        <button role="tab" data-aisub="command" aria-controls="aisub-command">Command Center</button>
        <button role="tab" data-aisub="employees" aria-controls="aisub-employees">AI Employees</button>
        <button role="tab" data-aisub="actions" aria-controls="aisub-actions">Actions &amp; Approvals</button>
        <button role="tab" data-aisub="knowledge" aria-controls="aisub-knowledge">Knowledge Base</button>
        <button role="tab" data-aisub="usage" aria-controls="aisub-usage">Usage &amp; Settings</button>
      </div>
      <div class="panel" data-aisub="command" id="aisub-command" role="tabpanel" aria-label="Command Center" tabindex="0" style="display:none;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div><h2>Command Center</h2><p class="hint" style="margin-bottom:0;">Chat with an AI Employee. It reads live data to answer; anything that changes data is queued for your approval.</p></div>
          <button class="btn btn-ghost" id="aiNewConvo" style="font-size:0.82rem;">+ New conversation</button>
        </div>
        <div class="f" style="max-width:320px;margin-top:10px;"><label for="aiEmployeeSelect">AI Employee</label><select id="aiEmployeeSelect"><option value="">General assistant</option></select></div>
        <div class="chat-wrap" style="margin-top:12px;">
          <div>
            <div class="hint" style="margin-bottom:6px;">Conversations</div>
            <div class="chat-threads" id="aiThreads"><div class="empty">No conversations yet.</div></div>
          </div>
          <div class="chat-main">
            <div class="chat-log" id="aiChatLog" aria-live="polite"><div class="empty">Ask a question to start a conversation.</div></div>
            <div class="inline" style="margin-top:10px;align-items:flex-end;">
              <div class="f" style="flex:1;"><label for="aiChatInput">Message</label><textarea id="aiChatInput" rows="2" placeholder="e.g. How many leads do we have?"></textarea></div>
              <button class="btn" id="aiChatSend" style="width:auto;">Send</button>
            </div>
            <div class="visually-hidden" id="aiStatus" role="status" aria-live="polite"></div>
            <div class="msg" id="aicmsg"></div>
          </div>
        </div>
      </div>
      <div class="panel" data-aisub="actions" id="aisub-actions" role="tabpanel" aria-label="Actions and Approvals" tabindex="0" style="display:none;">
        <h2>Actions &amp; Approvals <span class="pill">owner/admin</span></h2>
        <p class="hint">Read actions run immediately when allowed; actions that change data are proposed and only run when a human approves them.</p>
        <div class="sub" style="margin:12px 0 4px;font-weight:700;">Pending approvals</div>
        <div class="list" id="aiPending"><div class="empty">Loading…</div></div>
        <div class="sub" style="margin:18px 0 4px;font-weight:700;">Available actions</div>
        <div class="filters">
          <input id="aiToolSearch" type="search" placeholder="Search actions…" aria-label="Search actions" />
          <select id="aiToolMode" aria-label="Filter by type"><option value="">All types</option><option value="read">Read (runs now)</option><option value="write">Needs approval</option></select>
        </div>
        <div class="list" id="aiToolsList"><div class="empty">Loading…</div></div>
        <div class="sub" style="margin:18px 0 4px;font-weight:700;">Execution history</div>
        <div class="list" id="aiHistory"><div class="empty">Loading…</div></div>
        <div class="msg" id="aitmsg"></div>
      </div>
      <div class="panel" data-aisub="employees" id="aisub-employees" role="tabpanel" aria-label="AI Employees" tabindex="0" style="display:none;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div><h2>AI Employees <span class="pill">owner/admin</span></h2><p class="hint" style="margin-bottom:0;">Saved AI Employees with their own role, instructions, and a limited set of allowed actions. An AI Employee can only ever do less than your own role allows — never more.</p></div>
          <button class="btn" id="aeCreateBtn" style="width:auto;">+ New AI Employee</button>
        </div>
        <div class="list" id="aiEmployees" style="margin-top:12px;"><div class="empty">Loading…</div></div>
        <div class="msg" id="aemsg"></div>
      </div>
      <div class="panel" data-aisub="knowledge" id="aisub-knowledge" role="tabpanel" aria-label="Knowledge Base" tabindex="0" style="display:none;">
        <h2>Knowledge Base <span class="pill">owner/admin</span></h2>
        <p class="hint">Add text documents to a collection, then ask questions grounded in them — answers cite the documents they used. (Text entry is the supported ingestion method today.)</p>
        <div class="sub" style="margin:10px 0 4px;font-weight:700;">Collections</div>
        <div class="inline">
          <div class="f"><label for="kbcname">New collection</label><input id="kbcname" placeholder="Policies" /></div>
          <button class="btn" id="addCollection" style="width:auto;">Create</button>
        </div>
        <div class="f" style="margin-top:8px;"><label for="kbcollection">Active collection</label><select id="kbcollection"></select></div>
        <div class="sub" style="margin:14px 0 4px;font-weight:700;">Documents</div>
        <div class="list" id="kbdocs"><div class="empty">No documents.</div></div>
        <div class="f" style="margin-top:10px;"><label for="kbdocname">Document name</label><input id="kbdocname" placeholder="Refund policy" /></div>
        <div class="f"><label for="kbdoccontent">Document text</label><textarea id="kbdoccontent" rows="4" placeholder="Paste text content to index…"></textarea></div>
        <button class="btn" id="addDocument" style="width:auto;">Add document</button>
        <div class="sub" style="margin:16px 0 4px;font-weight:700;">Grounded Q&amp;A</div>
        <div class="f"><label for="kbquestion">Ask a question</label><input id="kbquestion" placeholder="What is our refund window?" /></div>
        <button class="btn" id="askKnowledge" style="width:auto;">Ask</button>
        <div id="kbanswer" style="margin-top:10px;"></div>
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
      <div class="panel" id="legalPanel" style="display:none;">
        <h2>Legal &amp; Compliance</h2>
        <div class="dns" style="border-style:solid;border-color:var(--accent);">
          <strong>Templates, not legal advice.</strong> Documents generated here are general, customizable starting points for your own website — not legal advice and not attorney-approved. Review them carefully and consult a qualified attorney when appropriate.
        </div>
        <div class="msg" id="legalMsg" role="status" aria-live="polite"></div>
        <div class="sub" style="margin:16px 0 4px;font-weight:800;">Business questionnaire</div>
        <p class="hint">Your answers are the only facts used to generate documents — nothing is invented. Leave items blank if they do not apply.</p>
        <div class="legal-progress-wrap">
          <div class="hint" id="legalProgressText">Questionnaire progress: 0 of 0 answered</div>
          <div class="progress" id="legalProgress" role="progressbar" aria-label="Questionnaire progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-describedby="legalProgressText">
            <span id="legalProgressBar" style="width:0;"></span>
          </div>
        </div>
        <div id="legalQ"><div class="empty">Loading…</div></div>
        <button class="btn" id="legalSaveQ" style="width:auto;margin-top:12px;display:none;">Save questionnaire</button>
        <div class="sub" style="margin:22px 0 4px;font-weight:800;">Your website legal documents</div>
        <p class="hint">Generate, review, and publish each document. Published documents appear on your site (e.g. <code>/privacy</code>). Members can view; owners and admins manage.</p>
        <div id="legalDocs"><div class="empty">Loading…</div></div>
        <div id="legalEditor"></div>
        <div id="legalPreview" style="margin-top:12px;"></div>
        <div id="privReqSection" style="display:none;">
          <div class="sub" style="margin:24px 0 4px;font-weight:800;">Privacy requests <span class="pill">owner/admin</span></div>
          <p class="hint">Requests submitted through your site's privacy-request form. These may contain personal information — handle carefully. Members cannot view them.</p>
          <div class="msg" id="privReqMsg" role="status" aria-live="polite"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;">
            <label for="privFilterStatus" class="visually-hidden">Filter by status</label>
            <select id="privFilterStatus" style="width:auto;padding:9px 12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--text);">
              <option value="">All statuses</option>
            </select>
          </div>
          <div id="privReqList"><div class="empty">Loading…</div></div>
          <div id="privReqDetail" style="margin-top:12px;"></div>
        </div>
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
      <div class="panel" data-aisub="usage" id="aisub-usage" role="tabpanel" aria-label="Usage and Settings" tabindex="0" style="display:none;">
        <h2>Usage &amp; Settings <span class="pill">owner</span></h2>
        <div class="sub" style="margin:8px 0 4px;font-weight:700;">Current AI source</div>
        <div class="hint" id="aiCurrent">Loading…</div>
        <div class="sub" style="margin:14px 0 4px;font-weight:700;">This month's usage &amp; allowance</div>
        <div class="hint" id="aiUsage"></div>
        <div class="sub" style="margin:14px 0 4px;font-weight:700;">Your own AI key <span class="pill">owner</span></div>
        <p class="hint">Add your own provider key so generation runs on your account. Your key is stored securely and is <strong>never</strong> shown again — only its status and a short fingerprint.</p>
        <label for="aiProvider">Provider</label>
        <select id="aiProvider"><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option></select>
        <label for="aiKey">API key (write-only)</label>
        <input id="aiKey" type="password" placeholder="sk-…" autocomplete="off" />
        <label for="aiModel">Model (optional)</label>
        <input id="aiModel" placeholder="gpt-4o-mini" />
        <div class="inline">
          <button class="btn" id="saveAi" style="width:auto;">Save key</button>
          <button class="btn ghost" id="removeAi" style="width:auto;">Remove key (use platform AI)</button>
        </div>
        <div class="msg" id="aimsg"></div>
      </div>
      <div class="panel" id="brandPanel" data-websub="branding" role="tabpanel" aria-label="Branding" tabindex="0" style="display:none;">
        <h2>Organization branding <span class="pill">owner/admin</span></h2>
        <p class="hint">Workspace-wide white-label identity. This sets the display name and accent applied across <strong>your whole workspace</strong>; each generated website also keeps its own accent chosen when it was created.</p>
        <label for="bname">Display name</label>
        <input id="bname" placeholder="Your organization" />
        <label for="bcolor">Primary color (hex, e.g. #2dd4bf)</label>
        <div style="display:flex;gap:10px;align-items:center;">
          <input id="bcolor" placeholder="#2dd4bf" style="flex:1;" />
          <span id="bswatch" aria-hidden="true" style="width:34px;height:34px;border-radius:9px;border:1px solid var(--border);flex:none;background:var(--accent);"></span>
        </div>
        <p class="hint" id="bcontrast" style="margin-top:6px;"></p>
        <button class="btn" id="saveBrand" style="margin-top:12px;">Save branding</button>
        <div class="msg" id="bmsg"></div>
      </div>
      <div class="panel" id="domainPanel" data-websub="hosting" style="display:none;">
        <h2>Connected domains</h2>
        <p class="hint">White-label: run your workspace and publish sites on your own domain. Add a domain, then verify ownership with a DNS TXT record.</p>
        <div class="list" id="domains"><div class="empty">Loading…</div></div>
        <div class="inline">
          <div class="f"><label for="dname">Domain</label><input id="dname" placeholder="cloud.yourbrand.com" /></div>
          <button class="btn" id="addDomain" style="width:auto;">Add</button>
        </div>
        <div class="msg" id="dmsg"></div>
        <p class="hint" style="margin-top:12px">Point your domain (A/CNAME record) at the platform. DNS changes can take time to propagate; the status shows <strong>Verification required</strong> until the record resolves, then <strong>Connected</strong>. SSL certificates are automatically provisioned and renewed through <strong>AutoSSL</strong> after the domain is connected and DNS is correctly configured. (Live certificate status isn&rsquo;t reported in this workspace yet.)</p>
      </div>
    </div>
    <div id="dlgHost"></div>
  </main>`;
  const script = `
  ${DASHBOARD_HELPERS_JS}
  var slug='', clientsCache=[], myRole='', DEFAULT_ACCENT='#2dd4bf';
  // Apply a tenant brand accent only when it's a valid, legible color; pick a
  // readable ink for accent backgrounds so branded controls never go invisible.
  function applyAccent(color){
    var acc=safeAccent(color, DEFAULT_ACCENT);
    var root=document.documentElement;
    root.style.setProperty('--accent', acc);
    root.style.setProperty('--accent-ink', accentInk(acc));
  }
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
  var onbData=null, onbDismissed=false;
  function canManageWorkspace(){return myRole==='owner'||myRole==='admin';}
  async function loadOnboarding(){
    var r=await api('/api/platform/onboarding');
    onbData=r.ok?await r.json():null;
    var pr=await api('/api/platform/preferences');
    if(pr.ok){var pd=await pr.json();onbDismissed=!!(pd.preferences&&pd.preferences.onboardingDismissed);}
    renderOnboarding();
  }
  function renderOnboarding(){
    var panel=document.getElementById('onboardingPanel');
    var reopen=document.getElementById('onbReopen');
    if(!panel)return;
    var d=onbData;
    if(!d||!d.steps||!d.steps.length){panel.style.display='none';if(reopen)reopen.style.display='none';return;}
    var completed=d.completed||0, total=d.total||0;
    var pct=progressPercent(completed,total);
    var prog=document.getElementById('onbProgress');
    var bar=document.getElementById('onbBar'); if(bar)bar.style.width=pct+'%';
    if(prog){prog.setAttribute('aria-valuenow',String(pct));prog.setAttribute('aria-valuetext',completed+' of '+total+' steps complete');}
    var cnt=document.getElementById('onbCount'); if(cnt)cnt.textContent=completed+' / '+total;
    var list=document.getElementById('onbList'); clear(list);
    d.steps.forEach(function(s){
      var row=document.createElement('div');
      row.style.cssText='display:flex;align-items:flex-start;gap:12px;padding:11px 2px;border-bottom:1px solid var(--line);';
      var mark=document.createElement('div');
      mark.setAttribute('aria-hidden','true');
      mark.style.cssText='flex:0 0 auto;width:22px;height:22px;border-radius:99px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;'+
        (s.done?'background:var(--accent);color:var(--accent-ink);':'background:transparent;border:2px solid var(--muted);color:transparent;');
      mark.textContent=s.done?'\\u2713':'';
      var body=document.createElement('div'); body.style.flex='1';
      var t=document.createElement('div'); t.style.cssText='font-weight:600;font-size:0.9rem;color:var(--text);'+(s.done?'text-decoration:line-through;color:var(--muted);':'');
      // Non-color status cue in addition to the strike-through/checkmark.
      t.textContent=s.title+(s.done?'  \\u2014 done':'');
      var desc=document.createElement('div'); desc.className='hint'; desc.style.margin='2px 0 0'; desc.textContent=s.description;
      body.appendChild(t); body.appendChild(desc);
      row.appendChild(mark); row.appendChild(body);
      if(!s.done && s.href){
        var go=document.createElement('a'); go.href=s.href; go.textContent='Start \\u2192'; go.className='subtle-btn';
        go.style.cssText='flex:0 0 auto;align-self:center;text-decoration:none;';
        row.appendChild(go);
      }
      list.appendChild(row);
    });
    if(d.allDone){
      var done=document.createElement('div'); done.className='empty'; done.style.paddingTop='12px';
      done.textContent='\\ud83c\\udf89 You are all set \\u2014 nicely done.';
      list.appendChild(done);
    }
    // Auto-collapse once the workspace finishes onboarding or dismisses it.
    var collapsed=onbDismissed||d.allDone;
    panel.style.display=collapsed?'none':'';
    if(reopen)reopen.style.display=collapsed?'':'none';
    var dismiss=document.getElementById('onbDismiss');
    if(dismiss)dismiss.style.display=canManageWorkspace()?'':'none';
  }
  async function setOnboardingDismissed(v){
    onbDismissed=v; renderOnboarding();
    // Persist as a shared workspace preference (owner/admin only; enforced
    // server-side too). Members get a session-only reveal, not a saved change.
    if(canManageWorkspace()){
      await api('/api/platform/preferences',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({onboardingDismissed:v})});
    }
  }

  // ---- Dashboard (Home) summary ----
  var currentUser=null, dashData=null;
  var METRIC_DEFS=[
    ['clients','Clients','clients'],
    ['leads','Active leads','clients'],
    ['activeProjects','Active projects','work'],
    ['openTickets','Open requests','work'],
    ['websites','Websites','web'],
    ['campaigns','Campaigns','marketing'],
    ['aiEmployees','AI employees','ai']
  ];
  var QUICK_ACTIONS=[
    {label:'Add client',sec:'clients'},
    {label:'New project',sec:'work'},
    {label:'Support request',sec:'work'},
    {label:'New campaign',sec:'marketing'},
    {label:'Build website',sec:'web',manage:true},
    {label:'Hire AI employee',sec:'ai',manage:true},
    {label:'Invite teammate',sec:'settings',manage:true}
  ];
  async function loadDashboard(){
    var r=await api('/api/platform/dashboard');
    dashData=r.ok?await r.json():{metrics:{},billing:null};
    renderMetrics(); renderSummary(); renderBillingCard();
  }
  function renderGreeting(){
    var el=document.getElementById('greeting'); if(!el||!currentUser)return;
    el.textContent=greetingFor(currentUser.name,currentUser.email,new Date().getHours());
  }
  function renderSummary(){
    var el=document.getElementById('dashSummary'); if(!el)return;
    var m=(dashData&&dashData.metrics)||{};
    var parts=[];
    function add(v,sing,plur){ if(typeof v==='number'){parts.push(v+' '+(v===1?sing:plur));} }
    add(m.clients,'client','clients');
    add(m.activeProjects,'active project','active projects');
    add(m.openTickets,'open request','open requests');
    el.textContent=parts.length?('Here\\u2019s your workspace at a glance \\u2014 '+parts.join(', ')+'.'):'Your workspace is ready \\u2014 add your first client to get started.';
  }
  function renderMetrics(){
    var el=document.getElementById('metrics'); if(!el)return; clear(el);
    var m=(dashData&&dashData.metrics)||{};
    METRIC_DEFS.forEach(function(def){
      var key=def[0], label=def[1], sec=def[2];
      var val=m[key];
      var avail=(typeof val==='number');
      var card=document.createElement(avail?'a':'div');
      card.className='metric'+(avail?'':' unavail');
      if(avail){card.href='#';card.setAttribute('role','link');card.addEventListener('click',function(e){e.preventDefault();showSection(sec);});}
      var n=document.createElement('div');n.className='n';n.textContent=avail?String(val):'\\u2014';
      var l=document.createElement('div');l.className='l';l.textContent=avail?label:(label+' \\u00b7 not set up');
      card.appendChild(n);card.appendChild(l);
      el.appendChild(card);
    });
  }
  function renderQuickActions(){
    var el=document.getElementById('quickActions'); if(!el)return; clear(el);
    QUICK_ACTIONS.forEach(function(a){
      if(a.manage && !canManageWorkspace())return;
      var b=document.createElement('button');
      b.textContent='+ '+a.label;
      b.addEventListener('click',function(){ showSection(a.sec); focusFirstField(a.sec); });
      el.appendChild(b);
    });
  }
  function focusFirstField(sec){
    try{
      var panels=allPanels();
      for(var i=0;i<panels.length;i++){var p=panels[i];
        if(sectionOf(p)===sec && !p.classList.contains('sec-hide')){
          var inp=p.querySelector('input[type=text],input[type=email],input:not([type]),textarea,select');
          if(inp)inp.focus(); return;
        }
      }
    }catch(_){/* focus is best-effort */}
  }
  function renderBillingCard(){
    var b=dashData&&dashData.billing;
    var nameEl=document.getElementById('planName');
    var sumEl=document.getElementById('planSummary');
    var stEl=document.getElementById('planStatus');
    var manage=document.getElementById('managePlan');
    if(!b){
      if(nameEl)nameEl.textContent='Plan';
      if(sumEl)sumEl.textContent='Billing is not configured for this workspace.';
      if(stEl)stEl.style.display='none';
      if(manage)manage.style.display='none';
      return;
    }
    if(nameEl)nameEl.textContent=b.planName||'Plan';
    if(sumEl)sumEl.textContent=planPriceText(b.priceCents,b.interval)+' \\u00b7 '+renewalText(b.currentPeriodEnd);
    if(stEl){stEl.style.display='';stEl.textContent=b.status||'';
      stEl.className='badge '+((b.status==='active'||b.status==='trialing')?'ok':((b.status==='past_due'||b.status==='canceled')?'warn':'muted'));}
    if(manage)manage.style.display=b.canManage?'':'none';
    // Past-due grace warning + update-payment action — owner/admin only,
    // never ordinary members. The plan stays active during Stripe's retry
    // window; this just nudges them to fix the card.
    var warn=document.getElementById('billingWarning');
    var warnText=document.getElementById('billingWarningText');
    var payBtn=document.getElementById('updatePayment');
    if(warn){
      if(b.status==='past_due'&&canManageWorkspace()){
        warn.style.display='';
        if(warnText)warnText.textContent='Your last payment didn\\u2019t go through. Your plan stays active during the retry period \\u2014 update your payment method to avoid any interruption.';
        if(payBtn)payBtn.style.display='';
      }else{
        warn.style.display='none';
        if(payBtn)payBtn.style.display='none';
      }
    }
  }
  async function loadPlans(){
    var sel=document.getElementById('planPicker'); if(!sel||sel.dataset.loaded)return;
    var pr=await api('/api/platform/billing/plans'); if(!pr.ok)return;
    var pd=await pr.json(); clear(sel);
    var currentId=dashData&&dashData.billing&&dashData.billing.planId;
    (pd.plans||[]).forEach(function(p){
      var o=document.createElement('option');o.value=p.id;
      o.textContent=p.name+' \\u2014 '+planPriceText(p.priceCents,p.interval)+(p.selfServe?'':' (contact sales)');
      if(p.id===currentId)o.selected=true;
      sel.appendChild(o);
    });
    sel.dataset.loaded='1';
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
    applyAccent(b.primaryColor);
    if(b.displayName){document.getElementById('orgName').textContent=b.displayName;}
    var bn=document.getElementById('bname'); if(bn)bn.value=b.displayName||'';
    var bc=document.getElementById('bcolor'); if(bc){bc.value=b.primaryColor||'';previewBrand();}
  }
  function previewBrand(){
    var bc=document.getElementById('bcolor'),sw=document.getElementById('bswatch'),ct=document.getElementById('bcontrast');
    if(!bc||!sw)return;
    var v=(bc.value||'').trim();
    var safe=safeAccent(v,DEFAULT_ACCENT);
    sw.style.background=safe;
    if(ct){
      if(v && safe!==v){ct.textContent='That isn\\u2019t a valid #rrggbb color \\u2014 the default accent will be used so text stays readable.';}
      else if(v){ct.textContent='Preview: buttons use '+(accentInk(safe)==='#ffffff'?'white':'dark')+' text on this color for readable contrast.';}
      else{ct.textContent='';}
    }
  }
  async function loadDomains(){
    var r=await api('/api/platform/domains');
    var el=document.getElementById('domains'); if(!el)return;
    if(!r.ok){clear(el);el.appendChild(emptyMsg('Could not load domains.'));return;}
    var d=await r.json();
    clear(el);
    var list=d.domains||[];
    if(!list.length){el.appendChild(emptyMsg('No custom domains yet. Add one above to publish on your own domain.'));return;}
    var manage=canManageWorkspace();
    list.forEach(function(dm){
      var wrap=document.createElement('div');wrap.className='item';wrap.style.flexDirection='column';wrap.style.alignItems='stretch';
      var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;';
      var left=document.createElement('div');
      var nm=document.createElement('div');nm.textContent=esc(dm.domain);nm.style.fontWeight='600';left.appendChild(nm);
      // Honest status: connection state from the verified flag; SSL/AutoSSL is a
      // policy note, not a live certificate status (not queried by this app yet).
      var sub=document.createElement('div');sub.className='sub';sub.style.fontSize='0.74rem';
      sub.textContent=dm.verified?'AutoSSL provisioning expected (live certificate status not reported here)':'DNS changes can take time to propagate';
      left.appendChild(sub);row.appendChild(left);
      var actions=document.createElement('div');actions.style.cssText='display:flex;align-items:center;gap:8px;';
      var st=document.createElement('span');
      if(dm.verified){st.className='badge ok';st.textContent='Connected';}else{st.className='badge warn';st.textContent='Verification required';}
      actions.appendChild(st);
      if(manage&&!dm.verified){var vb=document.createElement('button');vb.className='btn';vb.style.cssText='width:auto;padding:6px 12px;';vb.textContent='Verify';vb.addEventListener('click',function(){verifyDomain(dm.id,vb);});actions.appendChild(vb);}
      if(manage){var rm=document.createElement('button');rm.className='btn ghost';rm.style.padding='6px 12px';rm.textContent='Remove';rm.addEventListener('click',function(){confirmRemoveDomain(dm);});actions.appendChild(rm);}
      row.appendChild(actions);wrap.appendChild(row);
      if(!dm.verified){
        var dns=document.createElement('div');dns.className='dns';
        var h=document.createElement('div');h.className='hint';h.textContent='To verify ownership, add this DNS TXT record at your registrar, then click Verify:';dns.appendChild(h);
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
    if(btn){btn.disabled=true;btn.textContent='Checking\\u2026';}
    var r=await api('/api/platform/domains/'+encodeURIComponent(id)+'/verify',{method:'POST'});
    if(r.ok){setMsg('dmsg','ok','Domain verified \\u2014 it now routes to your workspace. AutoSSL provisioning is expected to follow.');loadDomains();return;}
    var e=await r.json().catch(function(){return{};});
    setMsg('dmsg','err',(e.error&&e.error.message)||'Not verified yet \\u2014 the DNS TXT record may still be propagating.');
    if(btn){btn.disabled=false;btn.textContent='Verify';}
  }
  function confirmRemoveDomain(dm){
    openConfirm({title:'Remove '+dm.domain+'?',intro:'This disconnects the domain from your workspace'+(dm.verified?' and any sites published to it will go offline':'')+'.',confirmLabel:'Remove domain',danger:true,onConfirm:function(){return removeDomain(dm.id);}});
  }
  async function removeDomain(id){
    var r=await api('/api/platform/domains/'+encodeURIComponent(id),{method:'DELETE'});
    if(r.ok){setMsg('dmsg','ok','Domain removed.');loadDomains();return;}
    setMsg('dmsg','err','Could not remove that domain.');throw new Error('rm');
  }
  function hostBadge(s){var b=document.createElement('span');
    if(s==='active'){b.className='badge ok';b.textContent='Active';}
    else if(s==='pending'){b.className='badge warn';b.textContent='Pending provisioning';}
    else if(s==='suspended'){b.className='badge warn';b.textContent='Suspended';}
    else if(s==='cancelled'){b.className='badge muted';b.textContent='Cancelled';}
    else{b.className='badge muted';b.textContent=esc(s||'Unknown');}
    return b;}
  async function loadHosting(){
    var r=await api('/api/platform/hosting');
    var el=document.getElementById('hosting'); if(!el)return;
    if(!r.ok){clear(el);el.appendChild(emptyMsg('Could not load hosting accounts.'));return;}
    var d=await r.json(); clear(el);
    var list=d.hosting||[]; var manage=canManageWorkspace();
    if(!list.length){el.appendChild(emptyMsg('No hosting accounts yet.'));return;}
    list.forEach(function(h){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');
      var nm=document.createElement('div');nm.textContent=esc(h.domain);nm.style.fontWeight='600';left.appendChild(nm);
      var meta=[];if(h.plan)meta.push(esc(h.plan));if(h.notes)meta.push(esc(h.notes));
      if(meta.length){var s=document.createElement('div');s.className='sub';s.textContent=meta.join(' \\u00b7 ');left.appendChild(s);}
      row.appendChild(left);
      var actions=document.createElement('div');actions.style.cssText='display:flex;align-items:center;gap:8px;';
      actions.appendChild(hostBadge(h.status));
      if(manage){var rm=document.createElement('button');rm.className='btn ghost';rm.style.padding='6px 12px';rm.textContent='Delete';rm.addEventListener('click',function(){confirmDeleteHosting(h);});actions.appendChild(rm);}
      row.appendChild(actions);el.appendChild(row);
    });
  }
  function confirmDeleteHosting(h){
    openConfirm({title:'Delete hosting for '+h.domain+'?',intro:'This removes the hosting account record from your workspace.',confirmLabel:'Delete',danger:true,onConfirm:function(){return deleteHosting(h.id);}});
  }
  async function deleteHosting(id){
    var r=await api('/api/platform/hosting/'+encodeURIComponent(id),{method:'DELETE'});
    if(r.ok){setMsg('hmsg','ok','Hosting account deleted.');loadHosting();return;}
    setMsg('hmsg','err','Could not delete that hosting account.');throw new Error('rm');
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
  // Human "time remaining" for a future deadline (e.g. a proposal's expiry).
  // Returns an honest "expired" once the deadline has passed.
  function timeUntil(iso){
    var d=Date.parse(iso); if(!d)return '';
    var s=Math.floor((d-Date.now())/1000);
    if(s<=0)return 'expired';
    if(s<60)return 'in under a minute';
    var m=Math.floor(s/60); if(m<60)return 'in '+m+'m';
    var h=Math.floor(m/60); if(h<24)return 'in '+h+'h';
    return 'in '+Math.floor(h/24)+'d';
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
      row.style.cssText='padding:11px 14px;border-bottom:1px solid var(--line);cursor:pointer;'+(n.readAt?'':'background:rgba(99,102,241,0.07);');
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
    var r=await api('/api/platform/activity?limit=8'); if(!r.ok)return;
    var d=await r.json();
    var el=document.getElementById('activityFeed'); clear(el);
    var list=d.events||[];
    if(!list.length){
      var e0=document.createElement('div');e0.className='empty';
      e0.textContent='No activity yet \\u2014 it will appear here as you and your team work. Start with a quick action:';
      el.appendChild(e0);
      var row=document.createElement('div');row.className='qa';row.style.marginTop='10px';
      [['Add a client','clients'],['Create a project','work']].forEach(function(a){
        var b=document.createElement('button');b.textContent='+ '+a[0];
        b.addEventListener('click',function(){showSection(a[1]);focusFirstField(a[1]);});
        row.appendChild(b);
      });
      el.appendChild(row);
      return;
    }
    list.forEach(function(e){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');left.style.minWidth='0';
      var t=document.createElement('div');t.textContent=esc(e.title);t.style.fontWeight='600';left.appendChild(t);
      // actor (name, else friendly by type) · module · time
      var parts=[actorLabel(e.actorType,e.actorName)];
      if(e.subjectType)parts.push(esc(String(e.subjectType).replace(/_/g,' ')));
      parts.push(timeAgo(e.createdAt));
      var s=document.createElement('div');s.className='sub';s.textContent=parts.join(' \\u00b7 ');left.appendChild(s);
      row.appendChild(left);
      if(e.summary){var p=document.createElement('span');p.className='badge muted';p.textContent=esc(e.summary);p.style.flex='0 0 auto';row.appendChild(p);}
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
  var aiHistory=[], aiConvoId='', aiSending=false;
  function aiBubble(role,text){
    var log=document.getElementById('aiChatLog');
    var b=document.createElement('div');b.className='bubble '+(role==='user'?'user':'assistant');
    var body=document.createElement('div');body.textContent=text;b.appendChild(body);
    if(role==='assistant'){
      var copy=document.createElement('button');copy.className='copy';copy.type='button';copy.textContent='Copy';
      copy.addEventListener('click',function(){try{navigator.clipboard.writeText(body.textContent||'');copy.textContent='Copied';setTimeout(function(){copy.textContent='Copy';},1200);}catch(_){}});
      b.appendChild(copy);
    }
    log.appendChild(b);log.scrollTop=log.scrollHeight;return body;
  }
  function aiSetStatus(t){var s=document.getElementById('aiStatus');if(s)s.textContent=t;}
  async function loadConversations(){
    var r=await api('/api/platform/ai/conversations'); if(!r.ok)return;
    var d=await r.json(); renderThreads(d.conversations||[]);
  }
  function renderThreads(list){
    var el=document.getElementById('aiThreads'); if(!el)return; clear(el);
    if(!list.length){el.appendChild(emptyMsg('No conversations yet.'));return;}
    list.forEach(function(c){
      var b=document.createElement('button');b.className='thread'+(c.id===aiConvoId?' active':'');b.type='button';
      var t=document.createElement('div');t.textContent=esc(c.title);b.appendChild(t);
      var s=document.createElement('div');s.className='sub';s.textContent=timeAgo(c.updatedAt);b.appendChild(s);
      b.addEventListener('click',function(){openConversation(c.id);});
      el.appendChild(b);
    });
  }
  function newConversation(){
    aiConvoId='';aiHistory=[];
    var log=document.getElementById('aiChatLog');clear(log);log.appendChild(emptyMsg('Ask a question to start a conversation.'));
    var t=document.querySelectorAll('#aiThreads .thread');for(var i=0;i<t.length;i++)t[i].classList.remove('active');
    var inp=document.getElementById('aiChatInput');if(inp)inp.focus();
  }
  async function openConversation(id){
    aiConvoId=id;aiHistory=[];
    var log=document.getElementById('aiChatLog');clear(log);
    var t=document.querySelectorAll('#aiThreads .thread');for(var i=0;i<t.length;i++)t[i].classList.remove('active');
    var r=await api('/api/platform/ai/conversations/'+encodeURIComponent(id)+'/messages');
    if(!r.ok){log.appendChild(emptyMsg('Could not load this conversation.'));return;}
    var d=await r.json();var msgs=d.messages||[];
    if(!msgs.length){log.appendChild(emptyMsg('No messages yet.'));return;}
    msgs.forEach(function(m){
      if(m.role==='user'||m.role==='assistant'){aiBubble(m.role,m.content);aiHistory.push({role:m.role,content:m.content});}
    });
    if(aiHistory.length>24)aiHistory=aiHistory.slice(-24);
    loadConversations();
  }
  async function sendAiChat(){
    if(aiSending)return;
    var input=document.getElementById('aiChatInput');var msg=(input.value||'').trim();if(!msg)return;
    var btn=document.getElementById('aiChatSend');
    aiSending=true;if(btn)btn.disabled=true;
    var log=document.getElementById('aiChatLog');var firstEmpty=log.querySelector('.empty');if(firstEmpty)firstEmpty.remove();
    setMsg('aicmsg','','');aiSetStatus('Sending your message…');
    aiBubble('user',msg);
    var thinking=aiBubble('assistant','\\u2026');
    var empSel=document.getElementById('aiEmployeeSelect');
    var employeeId=empSel?empSel.value:'';
    var savedText=input.value;input.value='';
    var r=await api('/api/platform/ai/console/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg,history:aiHistory,employeeId:employeeId,conversationId:aiConvoId||undefined})});
    aiSending=false;if(btn)btn.disabled=false;
    if(!r.ok){
      thinking.textContent='Sorry — the AI Employee is unavailable right now.';
      input.value=savedText; // preserve the message so it can be retried
      aiSetStatus('Message failed. Your text was kept so you can retry.');
      return;
    }
    var d=await r.json();
    thinking.textContent=d.reply||'';
    aiSetStatus('Response received.');
    if(d.conversationId){aiConvoId=d.conversationId;loadConversations();}
    (d.steps||[]).forEach(function(s){
      var line=document.createElement('div');line.className='chat-step';
      line.textContent=(s.mode==='write'?'\\u270e ':'\\u2699 ')+esc(s.tool)+': '+esc(s.summary);
      log.appendChild(line);
    });
    (d.citations||[]).forEach(function(c){/* reserved for future console citations */});
    if((d.pending||[]).length){
      d.pending.forEach(function(inv){renderAiPending(inv);});
      aiSubLoaded.actions=false;
    }
    aiHistory.push({role:'user',content:msg});
    aiHistory.push({role:'assistant',content:d.reply||''});
    if(aiHistory.length>24)aiHistory=aiHistory.slice(-24);
    log.scrollTop=log.scrollHeight;
  }
  function renderAiPending(inv){
    var log=document.getElementById('aiChatLog');
    var card=document.createElement('div');card.className='approve-card';
    var t=document.createElement('div');t.style.fontWeight='700';t.textContent='Approval needed: '+esc(inv.toolName);card.appendChild(t);
    card.appendChild(kvBlock(inv.args));
    var canConfirm=(myRole==='owner'||myRole==='admin');
    if(canConfirm){
      var actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;margin-top:8px;';
      var ok=document.createElement('button');ok.className='btn';ok.style.cssText='width:auto;padding:6px 12px;';ok.textContent='Approve & run';
      ok.addEventListener('click',function(){card.remove();decideAi(inv.id,'confirm');});actions.appendChild(ok);
      var no=document.createElement('button');no.className='btn ghost';no.style.padding='6px 12px';no.textContent='Reject';
      no.addEventListener('click',function(){card.remove();decideAi(inv.id,'reject');});actions.appendChild(no);
      card.appendChild(actions);
    }else{
      var note=document.createElement('div');note.className='sub';note.style.marginTop='6px';note.textContent='An owner or admin can approve this in Actions & Approvals.';card.appendChild(note);
    }
    log.appendChild(card);log.scrollTop=log.scrollHeight;
  }
  // Renders an object's fields as a readable key/value block (escaped).
  function kvBlock(args){
    var kv=document.createElement('div');kv.className='kv';
    if(args)for(var k in args){if(Object.prototype.hasOwnProperty.call(args,k)){
      var kd=document.createElement('div');kd.className='k';kd.textContent=k;kv.appendChild(kd);
      var vd=document.createElement('div');vd.className='v';vd.textContent=String(args[k]);kv.appendChild(vd);
    }}
    return kv;
  }
  // The real tool registry (role-filtered), loaded once and reused by the
  // employee editor's tool picker. Never invents tool names.
  var aiToolCatalog=null;
  async function loadToolCatalog(force){
    if(aiToolCatalog&&!force)return aiToolCatalog;
    var r=await api('/api/platform/ai/tools');
    if(!r.ok){aiToolCatalog=[];return aiToolCatalog;}
    var d=await r.json();aiToolCatalog=d.tools||[];return aiToolCatalog;
  }
  function toolGroupOf(name){var i=String(name).indexOf('.');return i>0?String(name).slice(0,i):'general';}
  async function loadAiEmployees(){
    var r=await api('/api/platform/ai/employees');if(!r.ok)return;
    var d=await r.json();var list=d.employees||[];
    // Populate the Command Center selector (active employees only).
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
    if(!list.length){el.appendChild(emptyMsg('No AI Employees yet. Use “+ New AI Employee” to create one.'));return;}
    var manage=canManageWorkspace();
    list.forEach(function(e){
      var row=document.createElement('div');row.className='item';row.style.alignItems='flex-start';
      var left=document.createElement('div');left.style.minWidth='0';left.style.flex='1';
      var head=document.createElement('div');head.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
      var t=document.createElement('div');t.textContent=esc(e.name);t.style.fontWeight='700';head.appendChild(t);
      if(e.status==='archived'){var pb=document.createElement('span');pb.className='badge muted';pb.textContent='Paused';head.appendChild(pb);}
      else{var ab=document.createElement('span');ab.className='badge ok';ab.textContent='Active';head.appendChild(ab);}
      left.appendChild(head);
      var s=document.createElement('div');s.className='sub';s.textContent=e.title?esc(e.title):'AI Employee';left.appendChild(s);
      var caps=document.createElement('div');caps.className='sub';caps.style.marginTop='2px';
      caps.textContent=(e.toolNames&&e.toolNames.length)?('Allowed actions: '+e.toolNames.length+' selected'):'Allowed actions: any action your role permits';
      left.appendChild(caps);
      if(e.persona){var pv=document.createElement('div');pv.className='sub';pv.style.marginTop='2px';pv.style.opacity='0.85';var txt=String(e.persona);pv.textContent='“'+esc(txt.length>110?txt.slice(0,110)+'…':txt)+'”';left.appendChild(pv);}
      row.appendChild(left);
      if(manage){
        var actions=document.createElement('div');actions.style.cssText='display:flex;gap:6px;flex:none;flex-wrap:wrap;justify-content:flex-end;';
        var edit=document.createElement('button');edit.className='btn ghost';edit.style.cssText='width:auto;padding:6px 12px;';edit.textContent='Edit';
        edit.addEventListener('click',function(){openEmployeeEditor(e);});actions.appendChild(edit);
        var pause=document.createElement('button');pause.className='btn ghost';pause.style.cssText='width:auto;padding:6px 12px;';pause.textContent=e.status==='archived'?'Resume':'Pause';
        pause.addEventListener('click',function(){toggleEmployee(e);});actions.appendChild(pause);
        var del=document.createElement('button');del.className='btn ghost';del.style.cssText='width:auto;padding:6px 12px;';del.textContent='Delete';
        del.addEventListener('click',function(){confirmDeleteEmployee(e);});actions.appendChild(del);
        row.appendChild(actions);
      }
      el.appendChild(row);
    });
  }
  async function toggleEmployee(e){
    var next=e.status==='archived'?'active':'archived';
    var r=await api('/api/platform/ai/employees/'+encodeURIComponent(e.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:next})});
    if(r.ok){setMsg('aemsg','ok',next==='archived'?'AI Employee paused.':'AI Employee resumed.');loadAiEmployees();}
    else{setMsg('aemsg','err','Could not update that AI Employee.');}
  }
  function confirmDeleteEmployee(e){
    openConfirm({title:'Delete AI Employee',intro:'Delete “'+esc(e.name)+'”? This cannot be undone. Existing conversations are kept, but this AI Employee will no longer be selectable.',confirmLabel:'Delete',danger:true,onConfirm:function(){
      return api('/api/platform/ai/employees/'+encodeURIComponent(e.id),{method:'DELETE'}).then(function(r){
        if(r.ok){setMsg('aemsg','ok','AI Employee deleted.');loadAiEmployees();}
        else{setMsg('aemsg','err','Could not delete that AI Employee.');throw new Error('failed');}
      });
    }});
  }
  // Full-screen editor dialog for creating/editing an AI Employee. The tool
  // picker is generated from the real registry — searchable, grouped, with a
  // read/write distinction — so no nonexistent action can ever be selected.
  async function openEmployeeEditor(employee){
    var isEdit=!!employee;
    var catalog=await loadToolCatalog();
    var picked={};(employee&&employee.toolNames||[]).forEach(function(n){picked[n]=true;});
    _dlgPrev=document.activeElement;
    var host=document.getElementById('dlgHost');if(!host)return;clear(host);
    var back=document.createElement('div');back.className='dlg-back';
    back.addEventListener('click',function(ev){if(ev.target===back)closeDlg();});
    var dlg=document.createElement('div');dlg.className='dlg';dlg.style.maxWidth='560px';dlg.setAttribute('role','dialog');dlg.setAttribute('aria-modal','true');dlg.setAttribute('aria-label',isEdit?'Edit AI Employee':'New AI Employee');
    var h=document.createElement('div');h.className='dlg-h';h.textContent=isEdit?'Edit AI Employee':'New AI Employee';dlg.appendChild(h);
    var b=document.createElement('div');b.className='dlg-b';
    function field(labelText,el){var lb=document.createElement('label');lb.textContent=labelText;lb.style.marginTop='12px';b.appendChild(lb);b.appendChild(el);}
    var nameI=document.createElement('input');nameI.value=employee?esc(employee.name):'';nameI.placeholder='e.g. Sales Assistant';
    field('Name',nameI);
    var titleI=document.createElement('input');titleI.value=employee?esc(employee.title):'';titleI.placeholder='e.g. Sales Assistant';
    field('Job title',titleI);
    var personaI=document.createElement('textarea');personaI.rows=4;personaI.value=employee?esc(employee.persona):'';personaI.placeholder='Instructions and persona prepended to every conversation…';
    field('Instructions',personaI);
    // Tool picker
    var tl=document.createElement('label');tl.textContent='Allowed actions';tl.style.marginTop='14px';b.appendChild(tl);
    var help=document.createElement('p');help.className='hint';help.style.margin='2px 0 8px';help.textContent='Select the actions this AI Employee may use. Leave all unchecked to allow any action your own role permits. It can never exceed your role, even if asked.';b.appendChild(help);
    var search=document.createElement('input');search.type='search';search.placeholder='Search actions…';search.setAttribute('aria-label','Search actions');b.appendChild(search);
    var picker=document.createElement('div');picker.className='toolpick';picker.style.marginTop='8px';b.appendChild(picker);
    function renderPicker(){
      clear(picker);
      var q=(search.value||'').toLowerCase();
      var groups={};
      catalog.forEach(function(t){
        if(q&&((esc(t.title)+' '+esc(t.description)+' '+esc(t.name)).toLowerCase().indexOf(q)<0))return;
        var g=toolGroupOf(t.name);(groups[g]=groups[g]||[]).push(t);
      });
      var keys=Object.keys(groups).sort();
      if(!keys.length){picker.appendChild(emptyMsg('No actions match your search.'));return;}
      keys.forEach(function(g){
        var gh=document.createElement('div');gh.className='grp';gh.textContent=g;picker.appendChild(gh);
        groups[g].forEach(function(t){
          var lab=document.createElement('label');lab.style.cssText='display:flex;gap:9px;align-items:flex-start;padding:5px 2px;cursor:pointer;';
          var cb=document.createElement('input');cb.type='checkbox';cb.checked=!!picked[t.name];cb.style.cssText='width:auto;flex:none;margin-top:3px;';
          cb.addEventListener('change',function(){if(cb.checked)picked[t.name]=true;else delete picked[t.name];});
          lab.appendChild(cb);
          var meta=document.createElement('div');meta.style.minWidth='0';
          var top=document.createElement('div');top.style.cssText='display:flex;gap:7px;align-items:center;flex-wrap:wrap;';
          var nm=document.createElement('span');nm.textContent=esc(t.title);nm.style.fontWeight='600';top.appendChild(nm);
          var wtag=document.createElement('span');wtag.className='wtag '+(t.mode==='write'?'w':'r');wtag.textContent=t.mode==='write'?'writes — needs approval':'read only';top.appendChild(wtag);
          meta.appendChild(top);
          var ds=document.createElement('div');ds.className='sub';ds.textContent=esc(t.description);meta.appendChild(ds);
          lab.appendChild(meta);picker.appendChild(lab);
        });
      });
    }
    search.addEventListener('input',renderPicker);renderPicker();
    var msg=document.createElement('div');msg.className='msg';b.appendChild(msg);
    dlg.appendChild(b);
    var f=document.createElement('div');f.className='dlg-f';
    var cancel=document.createElement('button');cancel.className='btn ghost';cancel.textContent='Cancel';cancel.addEventListener('click',closeDlg);
    var save=document.createElement('button');save.className='btn';save.style.width='auto';save.textContent=isEdit?'Save changes':'Create AI Employee';
    save.addEventListener('click',function(){
      var name=(nameI.value||'').trim();
      if(!name){msg.className='msg err';msg.textContent='Give the AI Employee a name.';nameI.focus();return;}
      save.disabled=true;save.textContent='Saving\\u2026';msg.className='msg';msg.textContent='';
      var toolNames=Object.keys(picked);
      var payload={name:name,title:(titleI.value||'').trim(),persona:personaI.value,toolNames:toolNames};
      var url='/api/platform/ai/employees'+(isEdit?('/'+encodeURIComponent(employee.id)):'');
      api(url,{method:isEdit?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){
        return r.json().catch(function(){return {};}).then(function(x){
          if(r.ok){setMsg('aemsg','ok',isEdit?'AI Employee updated.':'AI Employee created.');loadAiEmployees();closeDlg();}
          else{save.disabled=false;save.textContent=isEdit?'Save changes':'Create AI Employee';msg.className='msg err';msg.textContent=(x.error&&x.error.message)||'Could not save.';}
        });
      });
    });
    f.appendChild(cancel);f.appendChild(save);dlg.appendChild(f);
    back.appendChild(dlg);host.appendChild(back);
    document.addEventListener('keydown',_dlgKey,true);
    nameI.focus();
  }
  // Proposals expire on the server one hour after they are created; we surface
  // that same window here so an approver never confirms a stale proposal.
  var AI_PROPOSAL_TTL_MS=60*60*1000;
  var aiToolsAll=[];
  async function loadAiTools(){
    var tools=await loadToolCatalog(true);aiToolsAll=tools;renderAvailableActions();
    var ir=await api('/api/platform/ai/tools/invocations');
    var pel=document.getElementById('aiPending');clear(pel);
    var hel=document.getElementById('aiHistory');clear(hel);
    if(!ir.ok){pel.appendChild(emptyMsg('Could not load actions.'));hel.appendChild(emptyMsg('Could not load history.'));return;}
    var id=await ir.json();var invs=id.invocations||[];
    // Pending approvals — write proposals awaiting a human decision.
    var pending=invs.filter(function(x){return x.status==='pending';});
    if(!pending.length){pel.appendChild(emptyMsg('Nothing awaiting approval.'));}
    else pending.forEach(function(inv){pel.appendChild(pendingCard(inv));});
    // Execution history — everything already run, rejected, expired, or failed.
    var history=invs.filter(function(x){return x.status!=='pending';}).slice(0,40);
    if(!history.length){hel.appendChild(emptyMsg('No actions have run yet.'));}
    else history.forEach(function(inv){
      var row=document.createElement('div');row.className='item';row.style.alignItems='flex-start';
      var left=document.createElement('div');left.style.minWidth='0';
      var n=document.createElement('div');n.textContent=esc(toolTitle(inv.toolName));n.style.fontWeight='600';left.appendChild(n);
      var s=document.createElement('div');s.className='sub';s.textContent=(inv.summary?esc(inv.summary)+' \\u00b7 ':'')+timeAgo(inv.updatedAt||inv.createdAt);left.appendChild(s);
      row.appendChild(left);
      var p=document.createElement('span');p.className='pill';p.style.flex='none';p.textContent=esc(inv.status);
      if(inv.status==='failed'||inv.status==='rejected'||inv.status==='expired')p.style.color='#e5484d';
      row.appendChild(p);hel.appendChild(row);
    });
  }
  function toolTitle(name){for(var i=0;i<aiToolsAll.length;i++){if(aiToolsAll[i].name===name)return aiToolsAll[i].title;}return name;}
  function toolMode(name){for(var i=0;i<aiToolsAll.length;i++){if(aiToolsAll[i].name===name)return aiToolsAll[i].mode;}return 'write';}
  function renderAvailableActions(){
    var tel=document.getElementById('aiToolsList');if(!tel)return;clear(tel);
    var q=((document.getElementById('aiToolSearch')||{}).value||'').toLowerCase();
    var mode=(document.getElementById('aiToolMode')||{}).value||'';
    var list=aiToolsAll.filter(function(t){
      if(mode&&t.mode!==mode)return false;
      if(q&&((esc(t.title)+' '+esc(t.description)+' '+esc(t.name)).toLowerCase().indexOf(q)<0))return false;
      return true;
    });
    if(!list.length){tel.appendChild(emptyMsg('No actions match your filters.'));return;}
    list.forEach(function(t){
      var row=document.createElement('div');row.className='item';
      var left=document.createElement('div');left.style.minWidth='0';
      var n=document.createElement('div');n.textContent=esc(t.title);n.style.fontWeight='600';left.appendChild(n);
      var s=document.createElement('div');s.className='sub';s.textContent=esc(t.description);left.appendChild(s);
      row.appendChild(left);
      var pill=document.createElement('span');pill.className='wtag '+(t.mode==='write'?'w':'r');pill.style.flex='none';pill.textContent=t.mode==='write'?'needs approval':'read only';row.appendChild(pill);
      tel.appendChild(row);
    });
  }
  // A pending write proposal, showing exactly what will change before approval.
  function pendingCard(inv){
    var card=document.createElement('div');card.className='approve-card';
    var head=document.createElement('div');head.style.cssText='display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline;';
    var t=document.createElement('div');t.style.fontWeight='700';t.textContent=esc(toolTitle(inv.toolName));head.appendChild(t);
    var when=document.createElement('div');when.className='sub';when.textContent='Proposed '+timeAgo(inv.createdAt);head.appendChild(when);
    card.appendChild(head);
    var name=document.createElement('div');name.className='sub';name.textContent='Action: '+esc(inv.toolName);card.appendChild(name);
    // Proposed changes — the exact submitted values, immutable and shown in full.
    var lbl=document.createElement('div');lbl.className='sub';lbl.style.cssText='margin-top:6px;font-weight:700;';lbl.textContent='Proposed changes';card.appendChild(lbl);
    var kv=kvBlock(inv.args);if(!kv.childNodes.length){var none=document.createElement('div');none.className='sub';none.textContent='No parameters.';card.appendChild(none);}else card.appendChild(kv);
    var meta=document.createElement('div');meta.className='sub';meta.style.marginTop='6px';
    var exp=inv.createdAt?new Date(Date.parse(inv.createdAt)+AI_PROPOSAL_TTL_MS):null;
    meta.textContent='Requested by '+esc(inv.requestedBy||'the assistant')+(exp?(' \\u00b7 expires '+timeUntil(exp.toISOString())):'');
    card.appendChild(meta);
    var canConfirm=(myRole==='owner'||myRole==='admin');
    if(canConfirm){
      var actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;margin-top:10px;';
      var ok=document.createElement('button');ok.className='btn';ok.style.cssText='width:auto;padding:6px 12px;';ok.textContent='Approve & run';
      ok.addEventListener('click',function(){decideAi(inv.id,'confirm');});actions.appendChild(ok);
      var no=document.createElement('button');no.className='btn ghost';no.style.cssText='width:auto;padding:6px 12px;';no.textContent='Reject';
      no.addEventListener('click',function(){decideAi(inv.id,'reject');});actions.appendChild(no);
      card.appendChild(actions);
    }else{
      var note=document.createElement('div');note.className='sub';note.style.marginTop='8px';note.textContent='An owner or admin can approve this.';card.appendChild(note);
    }
    return card;
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
  // ---- Confirmation dialog (focus-trapped, ESC to close) ----
  var _dlgPrev=null;
  function closeDlg(){var h=document.getElementById('dlgHost');if(h)clear(h);document.removeEventListener('keydown',_dlgKey,true);if(_dlgPrev&&_dlgPrev.focus){try{_dlgPrev.focus();}catch(_){}}}
  function _dlgFocusables(){return document.querySelectorAll('#dlgHost button, #dlgHost a[href], #dlgHost input, #dlgHost select, #dlgHost textarea');}
  function _dlgKey(e){
    if(e.key==='Escape'){e.preventDefault();closeDlg();return;}
    if(e.key==='Tab'){var f=_dlgFocusables();if(!f.length)return;var first=f[0],last=f[f.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  }
  function openConfirm(opts){
    _dlgPrev=document.activeElement;
    var host=document.getElementById('dlgHost'); if(!host)return; clear(host);
    var back=document.createElement('div');back.className='dlg-back';
    back.addEventListener('click',function(e){if(e.target===back)closeDlg();});
    var dlg=document.createElement('div');dlg.className='dlg';dlg.setAttribute('role','dialog');dlg.setAttribute('aria-modal','true');dlg.setAttribute('aria-label',opts.title);
    var h=document.createElement('div');h.className='dlg-h';h.textContent=opts.title;dlg.appendChild(h);
    var b=document.createElement('div');b.className='dlg-b';
    if(opts.intro){var pI=document.createElement('p');pI.textContent=opts.intro;b.appendChild(pI);}
    if(opts.lines&&opts.lines.length){var ul=document.createElement('ul');opts.lines.forEach(function(t){var li=document.createElement('li');li.textContent=t;ul.appendChild(li);});b.appendChild(ul);}
    var fieldEls={};
    (opts.fields||[]).forEach(function(fld){
      if(fld.type==='checkbox'){
        var wrap=document.createElement('label');wrap.style.cssText='display:flex;align-items:center;gap:9px;margin-top:12px;font-size:0.9rem;color:var(--text);cursor:pointer;';
        var cb=document.createElement('input');cb.type='checkbox';cb.checked=!!fld.value;cb.style.cssText='width:auto;flex:none;';
        wrap.appendChild(cb);wrap.appendChild(document.createTextNode(fld.label));b.appendChild(wrap);fieldEls[fld.key]=cb;
      } else {
        var lb=document.createElement('label');lb.textContent=fld.label;lb.style.marginTop='12px';b.appendChild(lb);
        var inp=document.createElement('input');inp.value=fld.value||'';if(fld.placeholder)inp.placeholder=fld.placeholder;b.appendChild(inp);fieldEls[fld.key]=inp;
      }
    });
    if(opts.note){var pN=document.createElement('p');pN.className='hint';pN.style.marginTop='10px';pN.textContent=opts.note;b.appendChild(pN);}
    dlg.appendChild(b);
    var f=document.createElement('div');f.className='dlg-f';
    var cancel=document.createElement('button');cancel.className='btn ghost';cancel.textContent='Cancel';cancel.addEventListener('click',closeDlg);
    var ok=document.createElement('button');ok.className='btn';ok.style.width='auto';ok.textContent=opts.confirmLabel||'Confirm';
    if(opts.danger)ok.style.background='var(--danger)';
    ok.addEventListener('click',function(){if(ok.disabled)return;ok.disabled=true;ok.textContent='Working\\u2026';
      var vals={};for(var k in fieldEls){vals[k]=fieldEls[k].type==='checkbox'?fieldEls[k].checked:fieldEls[k].value;}
      Promise.resolve(opts.onConfirm(vals)).then(function(){closeDlg();}).catch(function(){ok.disabled=false;ok.textContent=opts.confirmLabel||'Confirm';});});
    f.appendChild(cancel);f.appendChild(ok);dlg.appendChild(f);
    back.appendChild(dlg);host.appendChild(back);
    document.addEventListener('keydown',_dlgKey,true);
    ok.focus();
  }
  // ---- Shared catalog helpers ----
  function planHasPremium(){var p=dashData&&dashData.billing&&dashData.billing.planId;return p==='business'||p==='partner'||p==='enterprise';}
  function makeThumb(url,alt){
    if(url){var im=document.createElement('img');im.className='thumb';im.src=url;im.alt=alt||'';im.loading='lazy';im.title='AI-generated sample';
      im.onerror=function(){var ph=document.createElement('div');ph.className='thumb ph';ph.textContent='Preview sample';if(im.parentNode)im.parentNode.replaceChild(ph,im);};return im;}
    var ph=document.createElement('div');ph.className='thumb ph';ph.textContent='Preview sample';return ph;
  }
  function mktError(x,status,fallback){
    if(status===402&&x.error&&x.error.code==='PREMIUM_REQUIRED'){return 'Premium \\u2014 available on the Business plan or higher.';}
    if(status===402&&x.error&&x.error.code==='PLAN_LIMIT'){return 'Your plan\\u2019s website limit is reached \\u2014 upgrade to add more.';}
    if(status===403){return 'Only owners and admins can do that.';}
    return (x.error&&x.error.message)||fallback;
  }
  // ---- AI Employee Marketplace (packages: employee + website design + tools) ----
  var edAll=[], edShown=0, CATALOG_PAGE=6, edWired=false;
  async function loadEditions(){
    var r=await api('/api/platform/marketplace/editions');
    var el=document.getElementById('editions'); if(!el)return;
    if(!r.ok){clear(el);el.appendChild(emptyMsg('The marketplace is unavailable right now.'));return;}
    var d=await r.json(); edAll=d.editions||[]; edShown=CATALOG_PAGE;
    if(!edWired){edWired=true;
      document.getElementById('edSearch').addEventListener('input',function(){edShown=CATALOG_PAGE;renderEditions();});
      document.getElementById('edPlan').addEventListener('change',function(){edShown=CATALOG_PAGE;renderEditions();});
      document.getElementById('edMore').addEventListener('click',function(){edShown+=CATALOG_PAGE;renderEditions();});
    }
    renderEditions();
  }
  function filterCatalog(list,q,plan,extra){
    return list.filter(function(it){
      if(q && ((esc(it.name)+' '+esc(it.description)+' '+esc(it.industry||'')).toLowerCase().indexOf(q)<0))return false;
      if(plan==='premium'&&it.tier!=='premium')return false;
      if(plan==='included'&&!(it.tier!=='premium'||planHasPremium()))return false;
      return extra?extra(it):true;
    });
  }
  function statusBadge(it){
    var s=document.createElement('span');
    if(it.tier==='premium'&&!planHasPremium()){s.className='badge warn';s.textContent='Upgrade required';}
    else if(it.tier==='premium'){s.className='badge muted';s.textContent='Premium';}
    else{s.className='badge ok';s.textContent='Included';}
    return s;
  }
  function renderEditions(){
    var el=document.getElementById('editions'); if(!el)return; clear(el);
    var q=(document.getElementById('edSearch').value||'').toLowerCase();
    var filtered=filterCatalog(edAll,q,document.getElementById('edPlan').value);
    if(!filtered.length){el.appendChild(emptyMsg('No AI employee packages match your search.'));document.getElementById('edMore').style.display='none';return;}
    var grid=document.createElement('div');grid.className='cardgrid';
    filtered.slice(0,edShown).forEach(function(e){grid.appendChild(edCard(e));});
    el.appendChild(grid);
    document.getElementById('edMore').style.display=(filtered.length>edShown)?'':'none';
  }
  function edCard(e){
    var card=document.createElement('div');card.className='tcard';
    card.appendChild(makeThumb(e.previewImage,'Sample of '+e.name));
    var body=document.createElement('div');body.className='body';
    var kind=document.createElement('span');kind.className='kind pkg';kind.textContent='\\ud83e\\udde9 AI Employee Package';body.appendChild(kind);
    var ttl=document.createElement('div');ttl.className='ttl';ttl.textContent=esc(e.name);body.appendChild(ttl);
    var desc=document.createElement('div');desc.className='desc';desc.textContent=esc(e.description);body.appendChild(desc);
    var emps=(e.employees||[]);
    var caps=document.createElement('div');caps.className='desc';
    caps.textContent='Includes '+emps.length+' AI employee'+(emps.length===1?'':'s')+(emps.length?': '+emps.map(function(m){return esc(m.title||m.name);}).join(', '):'')+' \\u00b7 a matching website design';
    body.appendChild(caps);
    var foot=document.createElement('div');foot.className='foot';
    foot.appendChild(statusBadge(e));
    if(canManageWorkspace()){
      var b=document.createElement('button');b.className='btn';b.style.cssText='width:auto;padding:7px 13px;font-size:0.82rem;';b.textContent='Add employee + website';
      b.addEventListener('click',function(){confirmInstallEdition(e);});foot.appendChild(b);
    }
    body.appendChild(foot);card.appendChild(body);
    return card;
  }
  function confirmInstallEdition(e){
    var emps=(e.employees||[]);
    var lines=['Creates a new draft website \\u201c'+e.name+'\\u201d (existing sites are untouched)'];
    emps.forEach(function(m){lines.push('Creates AI employee: '+(m.title||m.name));});
    lines.push('Uses one site from your plan\\u2019s website allowance. No charge.');
    openConfirm({
      title:'Install \\u201c'+e.name+'\\u201d?',
      intro:'This package is additive \\u2014 it creates new resources and will not delete or overwrite existing websites, AI employees, workflows, or published content.',
      lines:lines,
      fields:[{type:'checkbox',key:'applyBranding',label:'Also set my workspace brand color to this package\\u2019s accent (organization-wide)',value:false}],
      note:(e.tier==='premium'&&!planHasPremium())?'Premium package \\u2014 available on Business and higher.':'',
      confirmLabel:'Install package',
      onConfirm:function(v){return applyEdition(e.id,e.name,!!v.applyBranding);}
    });
  }
  async function applyEdition(id,name,applyBranding){
    setMsg('mktmsg','','Installing \\u201c'+esc(name)+'\\u201d\\u2026');
    var r=await api('/api/platform/marketplace/editions/'+encodeURIComponent(id)+'/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({applyBranding:!!applyBranding})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){
      var parts=[];
      if(x.website)parts.push('created 1 draft website');
      parts.push('created '+(x.employeesCreated||0)+' AI employee(s)');
      if(x.accentApplied)parts.push('set your brand accent');
      if(typeof x.employeesRequested==='number'&&x.employeesCreated<x.employeesRequested)parts.push('('+ (x.employeesRequested-x.employeesCreated) +' employee(s) could not be created)');
      setMsg('mktmsg','ok','Installed \\u2014 '+parts.join(', ')+'. Find the site in My Websites.');
      webSubLoaded.mywebsites=false;loadWebsites();if(applyBranding)loadBranding();
      if(typeof loadAiEmployees==='function')loadAiEmployees();
      return;
    }
    setMsg('mktmsg','err',mktError(x,r.status,'Could not install that package.'));
    throw new Error('apply failed');
  }
  // ---- Website Templates (standalone designs; no AI employee) ----
  var tplAll=[], tplShown=0, tplWired=false;
  async function loadMarketplace(){
    var r=await api('/api/platform/marketplace/website-templates');
    var el=document.getElementById('marketplace'); if(!el)return;
    if(!r.ok){clear(el);el.appendChild(emptyMsg('Templates are unavailable right now.'));return;}
    var d=await r.json(); tplAll=d.templates||[]; tplShown=CATALOG_PAGE;
    var ind=document.getElementById('tplIndustry');
    if(ind&&ind.options.length<=1){var seen={};tplAll.forEach(function(t){if(t.industry&&!seen[t.industry]){seen[t.industry]=1;var o=document.createElement('option');o.value=t.industry;o.textContent=t.industry;ind.appendChild(o);}});}
    if(!tplWired){tplWired=true;
      document.getElementById('tplSearch').addEventListener('input',function(){tplShown=CATALOG_PAGE;renderTemplates();});
      document.getElementById('tplIndustry').addEventListener('change',function(){tplShown=CATALOG_PAGE;renderTemplates();});
      document.getElementById('tplPlan').addEventListener('change',function(){tplShown=CATALOG_PAGE;renderTemplates();});
      document.getElementById('tplMore').addEventListener('click',function(){tplShown+=CATALOG_PAGE;renderTemplates();});
    }
    renderTemplates();
  }
  function renderTemplates(){
    var el=document.getElementById('marketplace'); if(!el)return; clear(el);
    var q=(document.getElementById('tplSearch').value||'').toLowerCase();
    var ind=document.getElementById('tplIndustry').value;
    var filtered=filterCatalog(tplAll,q,document.getElementById('tplPlan').value,function(t){return !ind||t.industry===ind;});
    if(!filtered.length){el.appendChild(emptyMsg('No website templates match your search.'));document.getElementById('tplMore').style.display='none';return;}
    var grid=document.createElement('div');grid.className='cardgrid';
    filtered.slice(0,tplShown).forEach(function(t){grid.appendChild(tplCard(t));});
    el.appendChild(grid);
    document.getElementById('tplMore').style.display=(filtered.length>tplShown)?'':'none';
  }
  function tplCard(t){
    var card=document.createElement('div');card.className='tcard';
    card.appendChild(makeThumb(t.previewImage,'Sample of the '+t.name+' template'));
    var body=document.createElement('div');body.className='body';
    var kind=document.createElement('span');kind.className='kind tpl';kind.textContent='\\ud83c\\udfa8 Website Template';body.appendChild(kind);
    var ttl=document.createElement('div');ttl.className='ttl';ttl.textContent=esc(t.name);body.appendChild(ttl);
    var meta=document.createElement('div');meta.className='desc';meta.style.color='var(--muted-strong)';meta.textContent=esc(t.industry||'');body.appendChild(meta);
    var desc=document.createElement('div');desc.className='desc';desc.textContent=esc(t.description);body.appendChild(desc);
    var foot=document.createElement('div');foot.className='foot';
    foot.appendChild(statusBadge(t));
    if(canManageWorkspace()){
      var b=document.createElement('button');b.className='btn ghost';b.style.cssText='padding:7px 13px;font-size:0.82rem;';b.textContent='Use template';
      b.addEventListener('click',function(){confirmUseTemplate(t);});foot.appendChild(b);
    }
    body.appendChild(foot);card.appendChild(body);
    return card;
  }
  function confirmUseTemplate(t){
    openConfirm({
      title:'Use \\u201c'+t.name+'\\u201d?',
      intro:'This creates a brand-new draft website from this standalone design. No AI employee is included, and no existing website is changed.',
      lines:['Creates a new draft site seeded with this template\\u2019s brief and accent','You then Generate and Publish it from My Websites'],
      note:(t.tier==='premium'&&!planHasPremium())?'Premium template \\u2014 available on Business and higher.':'Counts one draft toward your plan\\u2019s website limit. No charge.',
      confirmLabel:'Create draft',
      onConfirm:function(){return useTemplate(t.id,t.name);}
    });
  }
  async function useTemplate(id,name){
    setMsg('tplmsg','','Creating a draft from \\u201c'+esc(name)+'\\u201d\\u2026');
    var r=await api('/api/platform/marketplace/website-templates/'+encodeURIComponent(id)+'/use',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){setMsg('tplmsg','ok','Draft created \\u2014 open My Websites and click Generate to build it.');webSubLoaded.mywebsites=false;loadWebsites();return;}
    setMsg('tplmsg','err',mktError(x,r.status,'Could not use that template.'));
    throw new Error('use failed');
  }
  async function loadWebsites(){
    var el=document.getElementById('websites'); if(!el)return;
    var r=await api('/api/platform/websites');
    if(!r.ok){clear(el);el.appendChild(emptyMsg('Could not load your websites.'));return;}
    var d=await r.json(); aiReady=d.generationAvailable!==false; setGenNote();
    var verified=[];
    var dr=await api('/api/platform/domains');
    if(dr.ok){var dd=await dr.json();(dd.domains||[]).forEach(function(x){if(x.verified)verified.push(x.domain);});}
    clear(el);
    var list=d.websites||[];
    if(!list.length){el.appendChild(websitesEmpty());return;}
    var manage=canManageWorkspace();
    list.forEach(function(w){el.appendChild(websiteRow(w,verified,manage));});
  }
  function websitesEmpty(){
    var box=document.createElement('div');
    var e=document.createElement('div');e.className='empty';e.textContent='No websites yet. Start one of these ways:';box.appendChild(e);
    var qa=document.createElement('div');qa.className='qa';qa.style.marginTop='10px';
    [['Create with AI','create'],['AI Employee Marketplace','marketplace'],['Website Templates','templates']].forEach(function(a){
      if(a[1]==='create'&&!canManageWorkspace())return;
      var b=document.createElement('button');b.textContent=a[0];b.addEventListener('click',function(){location.hash='#web/'+a[1];});qa.appendChild(b);
    });
    box.appendChild(qa);return box;
  }
  function websiteRow(w,verified,manage){
    var wrap=document.createElement('div');wrap.className='item';wrap.style.flexDirection='column';wrap.style.alignItems='stretch';
    var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;';
    var left=document.createElement('div');left.style.minWidth='0';
    var nm=document.createElement('div');nm.textContent=esc(w.name);nm.style.fontWeight='600';left.appendChild(nm);
    if(w.brief){var s=document.createElement('div');s.className='sub';s.textContent=esc(w.brief);left.appendChild(s);}
    var meta=document.createElement('div');meta.className='sub';meta.style.cssText='font-size:0.72rem;opacity:0.8;';
    meta.textContent='Updated '+timeAgo(w.updatedAt)+(w.domain?(' \\u00b7 '+esc(w.domain)):'');left.appendChild(meta);
    row.appendChild(left);
    var actions=document.createElement('div');actions.style.cssText='display:flex;align-items:center;gap:8px;flex:none;flex-wrap:wrap;justify-content:flex-end;';
    // Status conveyed by words + shape, not color alone.
    var st=document.createElement('span');
    if(!w.hasContent){st.className='badge muted';st.textContent='Draft \\u00b7 not generated';}
    else if(w.status==='published'){st.className='badge ok';st.textContent='Published';}
    else{st.className='badge warn';st.textContent='Generated \\u00b7 draft';}
    actions.appendChild(st);
    if(manage){var gen=document.createElement('button');gen.className='btn';gen.style.cssText='width:auto;padding:6px 12px;';gen.textContent=w.hasContent?'Regenerate':'Generate';
      gen.addEventListener('click',function(){generateWebsite(w.id,gen);});actions.appendChild(gen);}
    if(w.hasContent){var pv=document.createElement('a');pv.className='btn ghost';pv.style.padding='6px 12px';pv.textContent='Preview';
      pv.href='/api/platform/websites/'+encodeURIComponent(w.id)+'/preview';pv.target='_blank';pv.rel='noopener';actions.appendChild(pv);}
    if(manage){
      var ed=document.createElement('button');ed.className='btn ghost';ed.style.padding='6px 12px';ed.textContent='Edit';ed.addEventListener('click',function(){editWebsite(w);});actions.appendChild(ed);
      var rm=document.createElement('button');rm.className='btn ghost';rm.style.padding='6px 12px';rm.textContent='Delete';rm.addEventListener('click',function(){confirmDeleteWebsite(w);});actions.appendChild(rm);
    }
    row.appendChild(actions);wrap.appendChild(row);
    if(w.hasContent){
      var pub=document.createElement('div');pub.style.cssText='margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
      if(w.status==='published'&&w.domain){
        var live=document.createElement('a');live.className='btn';live.style.cssText='width:auto;padding:6px 12px;';live.textContent='View live at '+esc(w.domain)+' \\u2197';
        live.href='https://'+w.domain;live.target='_blank';live.rel='noopener';pub.appendChild(live);
        if(manage){var unp=document.createElement('button');unp.className='btn ghost';unp.style.padding='6px 12px';unp.textContent='Unpublish';unp.addEventListener('click',function(){unpublishWebsite(w.id);});pub.appendChild(unp);}
      }else if(manage&&verified.length){
        var lbl=document.createElement('span');lbl.className='hint';lbl.textContent='Publish to:';pub.appendChild(lbl);
        var sel=document.createElement('select');sel.style.width='auto';verified.forEach(function(dn){var o=document.createElement('option');o.value=dn;o.textContent=dn;sel.appendChild(o);});pub.appendChild(sel);
        var pb=document.createElement('button');pb.className='btn';pb.style.cssText='width:auto;padding:6px 12px;';pb.textContent='Publish';pb.addEventListener('click',function(){publishWebsite(w.id,sel.value);});pub.appendChild(pb);
      }else if(manage){
        var hint=document.createElement('div');hint.className='hint';hint.textContent='Add & verify a custom domain in Hosting & Domains to publish this site live.';pub.appendChild(hint);
      }
      wrap.appendChild(pub);
    }
    return wrap;
  }
  async function publishWebsite(id,domain){
    if(!domain){setMsg('wlmsg','err','Choose a verified domain.');return;}
    setMsg('wlmsg','','Publishing\\u2026');
    var r=await api('/api/platform/websites/'+encodeURIComponent(id)+'/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({domain:domain})});
    var x=await r.json().catch(function(){return {};});
    if(r.ok){setMsg('wlmsg','ok','Published \\u2014 live at '+domain+'.');webSubLoaded.mywebsites=false;loadWebsites();}
    else{setMsg('wlmsg','err',(x.error&&x.error.message)||'Could not publish.');}
  }
  async function unpublishWebsite(id){
    var r=await api('/api/platform/websites/'+encodeURIComponent(id)+'/unpublish',{method:'POST'});
    if(r.ok){setMsg('wlmsg','ok','Unpublished \\u2014 the site is back to draft.');webSubLoaded.mywebsites=false;loadWebsites();}
  }
  async function generateWebsite(id,btn){
    if(btn){if(btn.disabled)return;btn.disabled=true;btn.dataset.t=btn.textContent;btn.textContent='Generating\\u2026';}
    setMsg('wlmsg','','Generating the site with AI\\u2026');
    // Idempotency key so a retried/duplicate request is not metered twice.
    var key=((currentUser&&currentUser.id)||'u')+'-'+id+'-'+Date.now();
    var r=await api('/api/platform/websites/'+encodeURIComponent(id)+'/generate',{method:'POST',headers:{'X-Idempotency-Key':key}});
    var e=await r.json().catch(function(){return {};});
    if(r.ok){setMsg('wlmsg','ok','Site generated. Click Preview to view it.');webSubLoaded.mywebsites=false;loadWebsites();return;}
    var msg=r.status===409?'A generation is already running for this site \\u2014 please wait a moment.':
      (r.status===503?'AI generation isn\\u2019t configured. Add your AI key in the AI section, or use the platform\\u2019s included AI.':
      (r.status===402?'Your monthly AI generation allowance is used up \\u2014 upgrade your plan or add your own AI key.':
      ((e.error&&e.error.message)||'Could not generate.')));
    setMsg('wlmsg','err',msg);
    if(btn){btn.disabled=false;btn.textContent=btn.dataset.t||'Generate';}
  }
  function editWebsite(w){
    openConfirm({title:'Edit website',
      fields:[{type:'text',key:'name',label:'Website name',value:w.name},{type:'text',key:'brief',label:'Description',value:w.brief||''}],
      confirmLabel:'Save changes',
      onConfirm:function(v){return saveWebsite(w.id,v);}});
  }
  async function saveWebsite(id,v){
    if(!v.name||!v.name.trim()){setMsg('wlmsg','err','A website name is required.');throw new Error('name');}
    var r=await api('/api/platform/websites/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:v.name.trim(),brief:(v.brief||'').trim()})});
    if(r.ok){setMsg('wlmsg','ok','Saved.');webSubLoaded.mywebsites=false;loadWebsites();return;}
    var e=await r.json().catch(function(){return {};});setMsg('wlmsg','err',(e.error&&e.error.message)||'Could not save.');throw new Error('save');
  }
  function confirmDeleteWebsite(w){
    openConfirm({title:'Delete \\u201c'+w.name+'\\u201d?',
      intro:'This permanently removes the website'+(w.status==='published'?' and takes it offline':'')+'. This cannot be undone.',
      confirmLabel:'Delete website',danger:true,
      onConfirm:function(){return removeWebsite(w.id);}});
  }
  async function removeWebsite(id){
    var r=await api('/api/platform/websites/'+encodeURIComponent(id),{method:'DELETE'});
    if(r.ok){setMsg('wlmsg','ok','Website deleted.');webSubLoaded.mywebsites=false;loadWebsites();return;}
    setMsg('wlmsg','err','Could not delete that website.');throw new Error('del');
  }
  function setGenNote(){
    var n=document.getElementById('wgenNote'); if(!n)return;
    n.textContent=aiReady
      ? 'Creating a website makes a draft record. It does not generate or publish anything yet \\u2014 open My Websites to Generate the content, then Publish to a verified domain. Generation uses your plan\\u2019s monthly AI allowance (or your own AI key).'
      : 'Creating a website makes a draft record. AI generation isn\\u2019t configured yet \\u2014 add an AI key in the AI section to generate content.';
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
  // Billing now comes from the aggregate dashboard summary; refreshing billing
  // means refreshing the dashboard (metrics + billing card).
  async function loadBilling(){ await loadDashboard(); if(document.getElementById('planPicker')){document.getElementById('planPicker').dataset.loaded='';await loadPlans();} }

  // ---- Legal & Compliance workspace (tenant's own website legal documents) ----
  var LEGAL='/api/platform/legal-workspace';
  var legalFields=[], legalAnswers={}, legalDocs=[], legalKinds=[];
  var LEGAL_REQUIRED={legalName:1,infoCollected:1,infoUse:1,privacyContact:1,jurisdiction:1,services:1,cookiesUsed:1,paymentModel:1,refund:1,cancellation:1,contactEmail:1,aiFeatures:1,providers:1};
  function legalMsg(t,ok){var m=document.getElementById('legalMsg');if(!m)return;m.className='msg'+(ok===true?' ok':ok===false?' err':'');m.textContent=t||'';}
  function canWriteLegal(){return myRole==='owner'||myRole==='admin';}
  async function loadLegalWorkspace(){
    try{
      var qr=await api(LEGAL+'/questionnaire');
      if(!qr.ok){legalMsg('Could not load the questionnaire. Try again.',false);var qh=document.getElementById('legalQ');if(qh){clear(qh);qh.appendChild(emptyMsg('Questionnaire unavailable.'));}return;}
      var q=await qr.json();
      legalFields=q.fields||[]; legalAnswers=q.answers||{}; renderLegalQuestionnaire();
      var dr=await api(LEGAL+'/documents');
      if(dr.ok){var d=await dr.json();legalDocs=d.documents||[];legalKinds=d.kinds||[];renderLegalDocs();}
      else{legalMsg('Questionnaire loaded, but legal documents could not be loaded. Try again.',false);var dh=document.getElementById('legalDocs');if(dh){clear(dh);dh.appendChild(emptyMsg('Documents unavailable.'));}}
    }catch(_){legalMsg('Could not load the legal workspace. Check your connection and try again.',false);}
  }
  function updateLegalQuestionnaireState(){
    var answered=0,requiredMissing=0;
    legalFields.forEach(function(f){
      var input=document.getElementById('lq_'+f.key);if(!input)return;
      var has=!!input.value.trim(),required=!!LEGAL_REQUIRED[f.key];if(has)answered++;
      input.classList.toggle('unanswered',required&&!has);
      if(required){input.setAttribute('aria-invalid',has?'false':'true');if(!has)requiredMissing++;var state=document.getElementById('lq_state_'+f.key);if(state){state.className='legal-required'+(has?' answered':'');state.textContent=has?'Required — answered':'Required — unanswered';}}
    });
    var total=legalFields.length,pct=total?Math.round(answered*100/total):0;
    var text=document.getElementById('legalProgressText');if(text)text.textContent='Questionnaire progress: '+answered+' of '+total+' answered'+(requiredMissing?' · '+requiredMissing+' required unanswered':' · all required fields answered');
    var progress=document.getElementById('legalProgress');if(progress)progress.setAttribute('aria-valuenow',String(pct));
    var bar=document.getElementById('legalProgressBar');if(bar)bar.style.width=pct+'%';
  }
  function renderLegalQuestionnaire(){
    var host=document.getElementById('legalQ'); if(!host)return; clear(host);
    var write=canWriteLegal(), cats={};
    legalFields.forEach(function(f){(cats[f.category]=cats[f.category]||[]).push(f);});
    Object.keys(cats).forEach(function(cat){
      var h=document.createElement('div');h.className='sub';h.style.cssText='margin:12px 0 6px;font-weight:700;color:var(--muted);';h.textContent=cat;host.appendChild(h);
      cats[cat].forEach(function(f){
        var required=!!LEGAL_REQUIRED[f.key],helpId='lq_help_'+f.key,stateId='lq_state_'+f.key;
        var lab=document.createElement('label');lab.setAttribute('for','lq_'+f.key);lab.textContent=f.label+(required?' *':'');host.appendChild(lab);
        var input=f.multiline?document.createElement('textarea'):document.createElement('input');
        input.id='lq_'+f.key;input.value=legalAnswers[f.key]||'';input.disabled=!write;input.title=f.help||'';input.setAttribute('aria-describedby',helpId+(required?' '+stateId:''));
        if(required){input.required=true;input.setAttribute('aria-required','true');}
        input.addEventListener('input',updateLegalQuestionnaireState);
        if(f.multiline)input.style.minHeight='68px';
        host.appendChild(input);
        var help=document.createElement('div');help.className='hint legal-field-help';help.id=helpId;help.textContent=f.help||'';host.appendChild(help);
        if(required){var state=document.createElement('div');state.id=stateId;state.className='legal-required';host.appendChild(state);}
      });
    });
    var save=document.getElementById('legalSaveQ'); if(save){save.style.display=write?'':'none';save.onclick=saveLegalQuestionnaire;}
    updateLegalQuestionnaireState();
  }
  async function saveLegalQuestionnaire(){
    var answers={};legalFields.forEach(function(f){var v=document.getElementById('lq_'+f.key);if(v&&v.value.trim())answers[f.key]=v.value.trim();});
    legalMsg('Saving…');
    var r=await api(LEGAL+'/questionnaire',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers:answers})});
    if(r.ok){var d=await r.json();legalAnswers=d.answers||{};legalMsg('Questionnaire saved.',true);updateLegalQuestionnaireState();}
    else{var x=await r.json().catch(function(){return{};});legalMsg((x.error&&x.error.message)||'Could not save.',false);}
  }
  function renderLegalDocs(){
    var host=document.getElementById('legalDocs'); if(!host)return; clear(host);
    var write=canWriteLegal(), byKind={};
    legalDocs.forEach(function(d){(byKind[d.kind]=byKind[d.kind]||[]).push(d);});
    legalKinds.forEach(function(k){
      var versions=(byKind[k.kind]||[]).slice().sort(function(a,b){return b.version-a.version;});
      var pub=versions.filter(function(v){return v.status==='published';})[0];
      var row=document.createElement('div');row.style.cssText='padding:12px 0;border-bottom:1px solid var(--border);';
      var head=document.createElement('div');head.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;';
      var title=document.createElement('div');title.style.fontWeight='700';title.textContent=k.title+'  /'+k.slug;
      var status=document.createElement('span');status.className='td-sub';status.textContent=pub?('Published v'+pub.version):(versions.length?'Draft':'Not created');
      head.appendChild(title);head.appendChild(status);row.appendChild(head);
      if(write){
        var actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;';
        var gen=document.createElement('button');gen.className='btn ghost';gen.style.width='auto';gen.textContent=versions.length?'Regenerate draft':'Generate draft';
        gen.onclick=function(){legalGenerate(k.kind);};actions.appendChild(gen);
        if(pub){var nv=document.createElement('button');nv.className='btn ghost';nv.style.width='auto';nv.textContent='New version';nv.onclick=function(){legalNewVersion(k.kind);};actions.appendChild(nv);}
        row.appendChild(actions);
      }
      versions.forEach(function(v){
        var vr=document.createElement('div');vr.style.cssText='display:flex;align-items:center;gap:8px;justify-content:space-between;margin-top:6px;font-size:.85rem;';
        var left=document.createElement('span');left.textContent='v'+v.version+' · '+v.status+(v.humanReviewed?' · reviewed':'')+(v.effectiveDate?' · eff '+v.effectiveDate:'');
        var open=document.createElement('button');open.className='btn ghost';open.style.width='auto';open.textContent='Open';open.onclick=function(){legalOpen(v.id);};
        vr.appendChild(left);vr.appendChild(open);row.appendChild(vr);
      });
      host.appendChild(row);
    });
    if(!legalKinds.length){host.innerHTML='<div class="empty">No document types.</div>';}
  }
  async function legalGenerate(kind){legalMsg('Generating…');var r=await api(LEGAL+'/documents/'+encodeURIComponent(kind)+'/generate',{method:'POST'});var x=await r.json().catch(function(){return{};});if(r.ok){legalMsg(x.missingFacts&&x.missingFacts.length?('Draft created — '+x.missingFacts.length+' material field(s) still needed before publishing.'):'Draft created — review, then publish.',true);await loadLegalWorkspace();legalOpen(x.document.id);}else legalMsg((x.error&&x.error.message)||'Generate failed.',false);}
  async function legalNewVersion(kind){var r=await api(LEGAL+'/documents/'+encodeURIComponent(kind)+'/new-version',{method:'POST'});var x=await r.json().catch(function(){return{};});if(r.ok){await loadLegalWorkspace();legalOpen(x.document.id);}else legalMsg((x.error&&x.error.message)||'Failed.',false);}
  async function legalOpen(id){var r=await api(LEGAL+'/documents/'+encodeURIComponent(id)+'/preview');if(!r.ok){legalMsg('Could not open.',false);return;}var d=await r.json();renderLegalEditor(d.document);var pv=document.getElementById('legalPreview');if(pv)pv.innerHTML='<div class="sub" style="font-weight:700;margin-bottom:6px;">Preview</div>'+d.html;}
  function renderLegalEditor(doc){
    var box=document.getElementById('legalEditor');if(!box)return;clear(box);
    var write=canWriteLegal(), editable=write&&doc.status==='draft';
    var wrap=document.createElement('div');wrap.style.cssText='margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:12px;';
    var meta=document.createElement('div');meta.className='td-sub';meta.textContent=doc.title+' · v'+doc.version+' · '+doc.status+(editable?' (editable)':' (read-only)');wrap.appendChild(meta);
    var title=document.createElement('input');title.value=doc.title;title.disabled=!editable;title.style.marginTop='8px';
    var body=document.createElement('textarea');body.value=doc.bodyMarkdown;body.disabled=!editable;body.style.cssText='min-height:220px;font-family:ui-monospace,Menlo,monospace;font-size:.82rem;margin-top:8px;';
    wrap.appendChild(title);wrap.appendChild(body);
    if(write){
      var actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;';
      function btn(txt,cls,fn){var b=document.createElement('button');b.className='btn '+(cls||'ghost');b.style.width='auto';b.textContent=txt;b.onclick=fn;return b;}
      if(editable){
        actions.appendChild(btn('Save draft','ghost',function(){legalDocAction('/documents/'+doc.id,{method:'PUT',body:{title:title.value,bodyMarkdown:body.value}},'Saved.');}));
        actions.appendChild(btn(doc.humanReviewed?'Reviewed ✓':'Mark reviewed','ghost',function(){legalDocAction('/documents/'+doc.id+'/review',{method:'POST'},'Marked reviewed.');}));
        var eff=document.createElement('input');eff.type='date';eff.style.width='auto';actions.appendChild(eff);
        actions.appendChild(btn('Publish','',function(){if(!confirm('Publish '+doc.title+' v'+doc.version+' to your public site?'))return;legalDocAction('/documents/'+doc.id+'/publish',{method:'POST',body:eff.value?{effectiveDate:eff.value}:{}},'Published.');}));
      }
      if(doc.status==='published'){actions.appendChild(btn('Unpublish','',function(){legalDocAction('/documents/'+doc.id+'/unpublish',{method:'POST'},'Unpublished.');}));}
      if(doc.status!=='draft'){actions.appendChild(btn('Restore as new draft','ghost',function(){legalDocAction('/documents/'+doc.id+'/restore',{method:'POST'},'Restored as draft.');}));}
      wrap.appendChild(actions);
    }
    box.appendChild(wrap);
  }
  async function legalDocAction(path,opts,okText){opts=opts||{};legalMsg('Working…');var r=await api(LEGAL+path,{method:opts.method||'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(opts.body||{})});var x=await r.json().catch(function(){return{};});if(r.ok){legalMsg(okText||'Done.',true);await loadLegalWorkspace();if(x.document)legalOpen(x.document.id);}else legalMsg((x.error&&x.error.message)||'Action failed.',false);}

  // ---- Privacy requests (owner/admin only) ----
  var PRIV='/api/platform/privacy-requests/manage';
  var PRIV_STATUSES=['pending_verification','received','identity_verification_required','in_review','awaiting_requester','fulfilled','partially_fulfilled','denied','withdrawn','closed'];
  var PRIV_NEXT={pending_verification:['withdrawn','closed'],received:['in_review','identity_verification_required','withdrawn','closed'],identity_verification_required:['in_review','awaiting_requester','denied','withdrawn','closed'],in_review:['awaiting_requester','identity_verification_required','fulfilled','partially_fulfilled','denied','withdrawn','closed'],awaiting_requester:['in_review','fulfilled','partially_fulfilled','denied','withdrawn','closed'],fulfilled:['closed'],partially_fulfilled:['in_review','fulfilled','closed'],denied:['in_review','closed'],withdrawn:['closed'],closed:[]};
  function privMsg(t,ok){var m=document.getElementById('privReqMsg');if(!m)return;m.className='msg'+(ok===true?' ok':ok===false?' err':'');m.textContent=t||'';}
  function prettyStatus(s){return String(s||'').replace(/_/g,' ');}
  async function loadPrivacyRequests(){
    if(myRole!=='owner'&&myRole!=='admin')return;
    var sec=document.getElementById('privReqSection');if(sec)sec.style.display='';
    var sel=document.getElementById('privFilterStatus');
    if(sel&&sel.options.length<=1){PRIV_STATUSES.forEach(function(s){var o=document.createElement('option');o.value=s;o.textContent=prettyStatus(s);sel.appendChild(o);});sel.onchange=loadPrivacyRequests;}
    var q=sel&&sel.value?('?status='+encodeURIComponent(sel.value)):'';
    var r=await api(PRIV+q);if(!r.ok)return;var d=await r.json();renderPrivacyList(d.requests||[]);
  }
  function renderPrivacyList(rows){
    var host=document.getElementById('privReqList');if(!host)return;clear(host);
    if(!rows.length){host.innerHTML='<div class="empty">No privacy requests.</div>';return;}
    var table=document.createElement('table');var tb=document.createElement('tbody');
    rows.forEach(function(rq){
      var tr=document.createElement('tr');
      var td1=document.createElement('td');var ref=document.createElement('div');ref.className='o-name';ref.textContent=rq.id.slice(0,8).toUpperCase();var sub=document.createElement('div');sub.className='td-sub';sub.textContent=prettyStatus(rq.category)+' · '+(rq.verificationState==='email_verified'?'email verified':'unverified');td1.appendChild(ref);td1.appendChild(sub);
      var td2=document.createElement('td');var pill=document.createElement('span');pill.className='pill';pill.textContent=prettyStatus(rq.status);td2.appendChild(pill);
      var td3=document.createElement('td');td3.className='td-sub';td3.textContent=(rq.createdAt||'').slice(0,10);
      var td4=document.createElement('td');var b=document.createElement('button');b.className='btn ghost btn-sm';b.style.width='auto';b.textContent='Open';b.onclick=function(){openPrivacyRequest(rq.id);};td4.appendChild(b);
      tr.appendChild(td1);tr.appendChild(td2);tr.appendChild(td3);tr.appendChild(td4);tb.appendChild(tr);
    });
    table.appendChild(tb);host.appendChild(table);
  }
  async function openPrivacyRequest(id){
    var r=await api(PRIV+'/'+encodeURIComponent(id));if(!r.ok){privMsg('Could not open.',false);return;}
    var d=await r.json();renderPrivacyDetail(d.request,d.notes||[]);
  }
  function renderPrivacyDetail(rq,notes){
    var box=document.getElementById('privReqDetail');if(!box)return;clear(box);
    var wrap=document.createElement('div');wrap.style.cssText='margin-top:12px;padding:16px;border:1px solid var(--border);border-radius:12px;';
    function line(k,v){var p=document.createElement('div');p.style.cssText='display:flex;gap:10px;font-size:.9rem;margin:2px 0;';var a=document.createElement('span');a.className='td-sub';a.style.minWidth='110px';a.textContent=k;var b=document.createElement('span');b.textContent=v;p.appendChild(a);p.appendChild(b);return p;}
    var h=document.createElement('div');h.style.fontWeight='800';h.textContent='Request '+rq.id.slice(0,8).toUpperCase();wrap.appendChild(h);
    wrap.appendChild(line('Type',prettyStatus(rq.category)));
    wrap.appendChild(line('From',rq.name+' <'+rq.email+'>'));
    wrap.appendChild(line('Relationship',rq.relationship||'—'));
    wrap.appendChild(line('Verified',rq.verificationState==='email_verified'?'Yes':'No'));
    if(rq.verifyEmailState&&rq.verifyEmailState!=='sent'){var vem=rq.verifyEmailState==='failed'?'Verification email FAILED to send':rq.verifyEmailState==='logged'?'No email provider configured — not delivered':'Verification email pending';wrap.appendChild(line('Email',vem+(rq.verifyEmailAttempts?' ('+rq.verifyEmailAttempts+' attempt'+(rq.verifyEmailAttempts>1?'s':'')+')':'')));}
    wrap.appendChild(line('Status',prettyStatus(rq.status)));
    var desc=document.createElement('div');desc.style.cssText='margin:10px 0;padding:10px;background:var(--surface);border-radius:8px;white-space:pre-wrap;font-size:.9rem;';desc.textContent=rq.description;wrap.appendChild(desc);
    // Transition controls
    var next=PRIV_NEXT[rq.status]||[];
    if(next.length){
      var trow=document.createElement('div');trow.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;';
      var tsel=document.createElement('select');tsel.style.cssText='width:auto;padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);';
      next.forEach(function(s){var o=document.createElement('option');o.value=s;o.textContent=prettyStatus(s);tsel.appendChild(o);});
      var reason=document.createElement('input');reason.placeholder='Explanation (required to fulfill/deny)';reason.style.cssText='flex:1;min-width:180px;padding:8px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);';
      var apply=document.createElement('button');apply.className='btn';apply.style.width='auto';apply.textContent='Apply';
      apply.onclick=function(){var to=tsel.value;var substantive=(to==='fulfilled'||to==='partially_fulfilled'||to==='denied');if(substantive&&!reason.value.trim()){privMsg('An explanation is required for this decision.',false);return;}if(!confirm('Change status to '+prettyStatus(to)+'?'))return;privAction('/'+rq.id+'/transition',{to:to,resolutionSummary:reason.value.trim()||undefined});};
      trow.appendChild(tsel);trow.appendChild(reason);trow.appendChild(apply);wrap.appendChild(trow);
    }
    // Notes
    var nh=document.createElement('div');nh.style.cssText='font-weight:700;margin:14px 0 4px;font-size:.9rem;';nh.textContent='Timeline / notes';wrap.appendChild(nh);
    (notes||[]).forEach(function(n){var nn=document.createElement('div');nn.style.cssText='font-size:.85rem;margin:3px 0;';nn.textContent='['+n.visibility+'] '+n.body+' ('+(n.createdAt||'').slice(0,10)+')';wrap.appendChild(nn);});
    var nb=document.createElement('input');nb.placeholder='Add a note';nb.style.cssText='width:100%;padding:8px 10px;margin-top:8px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);';
    var nv=document.createElement('select');nv.style.cssText='width:auto;padding:8px 10px;margin-top:6px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);';['internal','requester'].forEach(function(v){var o=document.createElement('option');o.value=v;o.textContent=v+' note';nv.appendChild(o);});
    var nadd=document.createElement('button');nadd.className='btn ghost';nadd.style.cssText='width:auto;margin-left:6px;';nadd.textContent='Add note';nadd.onclick=function(){if(!nb.value.trim())return;privAction('/'+rq.id+'/note',{body:nb.value.trim(),visibility:nv.value});};
    var nrow=document.createElement('div');nrow.style.cssText='display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px;';nrow.appendChild(nv);nrow.appendChild(nadd);
    wrap.appendChild(nb);wrap.appendChild(nrow);
    box.appendChild(wrap);
  }
  async function privAction(path,body){privMsg('Working…');var r=await api(PRIV+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});var x=await r.json().catch(function(){return{};});if(r.ok){privMsg('Done.',true);await loadPrivacyRequests();if(x.request)openPrivacyRequest(x.request.id);}else privMsg((x.error&&x.error.message)||'Action failed.',false);}
  // The dashboard is organized into a few sections shown one at a time, so the
  // owner lands on a clean page instead of every panel at once. A panel's
  // section is decided by its id, else by its heading text.
  var SECTIONS=[
    ['home','Dashboard'],
    ['clients','Clients & Sales'],
    ['work','Projects & Support'],
    ['web','Website'],
    ['marketing','Marketing'],
    ['ai','AI'],
    ['catalog','Catalog'],
    ['legal','Legal & Compliance'],
    ['settings','Settings']
  ];
  var SEC_BY_ID={
    dashHero:'home',onboardingPanel:'home',billingPanel:'home',activityPanel:'home',
    brandPanel:'web',domainPanel:'web',brandsPanel:'web',
    calendarPanel:'work',filesPanel:'work',
    formsPanel:'marketing',dripPanel:'marketing',emailPanel:'marketing',workflowsPanel:'marketing',
    aiConsolePanel:'ai',aiToolsPanel:'ai',aiEmployeesPanel:'ai',knowledgePanel:'ai',aiPanel:'ai',
    legalPanel:'legal',
    teamPanel:'settings',portalPanel:'settings',auditPanel:'settings'
  };
  var SEC_BY_LABEL={
    'Clients':'clients','Invoices':'clients','Sales pipeline':'clients','Proposals':'clients',
    'Projects':'work','Support tickets':'work',
    'AI Website Builder':'web','Marketplace':'web','Hosting accounts':'web',
    'Marketing campaigns':'marketing','Reviews':'marketing',
    'Products':'catalog','Books':'catalog','Programs':'catalog',
    'Account':'settings'
  };
  function panelLabel(p){var h=p.querySelector('h2');return h?((h.firstChild&&h.firstChild.textContent||h.textContent||'').trim()):'';}
  // A panel tagged with data-websub belongs to the Website workspace.
  function sectionOf(p){if(p.getAttribute&&p.getAttribute('data-websub'))return 'web';if(p.getAttribute&&p.getAttribute('data-aisub'))return 'ai';return SEC_BY_ID[p.id]||SEC_BY_LABEL[panelLabel(p)]||'settings';}
  function allPanels(){return document.querySelectorAll('.wrap .panel');}
  // A panel is role-hidden when the init logic set an inline display:none.
  function roleHidden(p){return p.style.display==='none';}
  var activeSection='home';
  function showSection(key){
    activeSection=key;
    var panels=allPanels();
    for(var i=0;i<panels.length;i++){
      var p=panels[i];
      if(sectionOf(p)===key)p.classList.remove('sec-hide');
      else p.classList.add('sec-hide');
    }
    // The Website workspace sub-navigation shows only inside the web section.
    var wsn=document.getElementById('websubnav');
    if(wsn)wsn.classList.toggle('sec-hide',key!=='web');
    if(key==='web')showWebSub(activeWebSub);
    // The AI workspace sub-navigation shows only inside the ai section.
    var asn=document.getElementById('aisubnav');
    if(asn)asn.classList.toggle('sec-hide',key!=='ai');
    if(key==='ai')showAiSub(activeAiSub);
    var nav=document.getElementById('secnav');
    if(nav){var tabs=nav.querySelectorAll('a');for(var j=0;j<tabs.length;j++){tabs[j].classList.toggle('active',tabs[j].getAttribute('data-sec')===key);}}
    try{window.scrollTo(0,0);}catch(_){/* noop */}
  }
  function buildSecNav(){
    var nav=document.getElementById('secnav'); if(!nav)return; clear(nav);
    // Which sections have at least one visible (role-allowed) panel? The Website
    // workspace is always available (members can view it), so force it present.
    var present={web:true,ai:true}; var panels=allPanels();
    for(var i=0;i<panels.length;i++){var p=panels[i];if(!roleHidden(p))present[sectionOf(p)]=true;}
    SECTIONS.forEach(function(s){
      if(!present[s[0]])return;
      var a=document.createElement('a');a.setAttribute('data-sec',s[0]);a.textContent=s[1];
      a.addEventListener('click',function(){
        location.hash = s[0]==='web' ? ('#web/'+activeWebSub) : (s[0]==='ai' ? ('#ai/'+activeAiSub) : ('#'+s[0]));
      });
      nav.appendChild(a);
    });
    buildWebSubNav();
    buildAiSubNav();
    routeFromHash();
  }
  // ---- Website workspace sub-navigation ----
  var WEB_SUBS=[
    ['mywebsites','My Websites',false],
    ['create','Create Website',true],
    ['marketplace','AI Employee Marketplace',false],
    ['templates','Website Templates',false],
    ['hosting','Hosting & Domains',false],
    ['branding','Branding',true]
  ];
  var activeWebSub='mywebsites', webSubLoaded={};
  function allowedWebSubs(){return WEB_SUBS.filter(function(s){return !(s[2]&&!canManageWorkspace());}).map(function(s){return s[0];});}
  function buildWebSubNav(){
    var nav=document.getElementById('websubnav'); if(!nav)return; clear(nav);
    WEB_SUBS.forEach(function(s){
      if(s[2]&&!canManageWorkspace())return; // manage-only tabs hidden from members
      var b=document.createElement('button');b.setAttribute('role','tab');b.setAttribute('data-websub',s[0]);
      b.setAttribute('aria-controls','wsub-'+s[0]);b.setAttribute('aria-selected','false');b.textContent=s[1];b.tabIndex=-1;
      b.addEventListener('click',function(){location.hash='#web/'+s[0];});
      b.addEventListener('keydown',function(e){webSubKey(e,s[0]);});
      nav.appendChild(b);
    });
  }
  function webSubKey(e,key){
    var order=allowedWebSubs(); var i=order.indexOf(key); if(i<0)return;
    var nx=null;
    if(e.key==='ArrowRight'||e.key==='ArrowDown')nx=order[(i+1)%order.length];
    else if(e.key==='ArrowLeft'||e.key==='ArrowUp')nx=order[(i-1+order.length)%order.length];
    else if(e.key==='Home')nx=order[0];
    else if(e.key==='End')nx=order[order.length-1];
    if(nx){e.preventDefault();location.hash='#web/'+nx;var b=document.querySelector('#websubnav [data-websub="'+nx+'"]');if(b)b.focus();}
  }
  function showWebSub(key){
    var allowed=allowedWebSubs();
    if(allowed.indexOf(key)<0)key=allowed[0]||'mywebsites';
    activeWebSub=key;
    var subs=document.querySelectorAll('[data-websub]');
    for(var i=0;i<subs.length;i++){var p=subs[i];
      if(p.parentElement&&p.parentElement.id==='websubnav')continue; // skip the tab buttons
      p.classList.toggle('websub-hide',p.getAttribute('data-websub')!==key);
    }
    var nav=document.getElementById('websubnav');
    if(nav){var tabs=nav.querySelectorAll('[role=tab]');for(var j=0;j<tabs.length;j++){var on=tabs[j].getAttribute('data-websub')===key;tabs[j].classList.toggle('active',on);tabs[j].setAttribute('aria-selected',on?'true':'false');tabs[j].tabIndex=on?0:-1;}}
    loadWebSub(key);
  }
  function loadWebSub(key){
    if(key==='create'){setGenNote();return;}
    if(webSubLoaded[key])return; webSubLoaded[key]=true;
    if(key==='mywebsites')loadWebsites();
    else if(key==='marketplace')loadEditions();
    else if(key==='templates')loadMarketplace();
    else if(key==='hosting'){loadHosting();loadDomains();}
    else if(key==='branding'){loadBrands();}
  }
  // ---- AI workspace sub-navigation ----
  var AI_SUBS=[
    ['command','Command Center','all'],
    ['employees','AI Employees','manage'],
    ['actions','Actions & Approvals','manage'],
    ['knowledge','Knowledge Base','manage'],
    ['usage','Usage & Settings','owner']
  ];
  var activeAiSub='command', aiSubLoaded={};
  function aiSubOk(min){return min==='all'||(min==='manage'&&canManageWorkspace())||(min==='owner'&&myRole==='owner');}
  function allowedAiSubs(){return AI_SUBS.filter(function(s){return aiSubOk(s[2]);}).map(function(s){return s[0];});}
  function buildAiSubNav(){
    var nav=document.getElementById('aisubnav'); if(!nav)return; clear(nav);
    AI_SUBS.forEach(function(s){
      if(!aiSubOk(s[2]))return;
      var b=document.createElement('button');b.setAttribute('role','tab');b.setAttribute('data-aisub',s[0]);
      b.setAttribute('aria-controls','aisub-'+s[0]);b.setAttribute('aria-selected','false');b.textContent=s[1];b.tabIndex=-1;
      b.addEventListener('click',function(){location.hash='#ai/'+s[0];});
      b.addEventListener('keydown',function(e){aiSubKey(e,s[0]);});
      nav.appendChild(b);
    });
  }
  function aiSubKey(e,key){
    var order=allowedAiSubs(); var i=order.indexOf(key); if(i<0)return;
    var nx=null;
    if(e.key==='ArrowRight'||e.key==='ArrowDown')nx=order[(i+1)%order.length];
    else if(e.key==='ArrowLeft'||e.key==='ArrowUp')nx=order[(i-1+order.length)%order.length];
    else if(e.key==='Home')nx=order[0];
    else if(e.key==='End')nx=order[order.length-1];
    if(nx){e.preventDefault();location.hash='#ai/'+nx;var b=document.querySelector('#aisubnav [data-aisub="'+nx+'"]');if(b)b.focus();}
  }
  function showAiSub(key){
    var allowed=allowedAiSubs();
    if(allowed.indexOf(key)<0)key=allowed[0]||'command';
    activeAiSub=key;
    var subs=document.querySelectorAll('[data-aisub]');
    for(var i=0;i<subs.length;i++){var p=subs[i];
      if(p.parentElement&&p.parentElement.id==='aisubnav')continue;
      p.classList.toggle('aisub-hide',p.getAttribute('data-aisub')!==key);
    }
    var nav=document.getElementById('aisubnav');
    if(nav){var tabs=nav.querySelectorAll('[role=tab]');for(var j=0;j<tabs.length;j++){var on=tabs[j].getAttribute('data-aisub')===key;tabs[j].classList.toggle('active',on);tabs[j].setAttribute('aria-selected',on?'true':'false');tabs[j].tabIndex=on?0:-1;}}
    loadAiSub(key);
  }
  function loadAiSub(key){
    if(key==='command'){ if(!aiSubLoaded.command){aiSubLoaded.command=true;loadAiEmployees();loadConversations();} return; }
    if(aiSubLoaded[key])return; aiSubLoaded[key]=true;
    if(key==='employees')loadAiEmployees();
    else if(key==='actions')loadAiTools();
    else if(key==='knowledge')loadCollections();
    else if(key==='usage')loadAiSettings();
  }
  function routeFromHash(){
    var h=(location.hash||'').replace(/^#/,'');
    if(h.indexOf('web/')===0){ if(activeSection!=='web')showSection('web'); showWebSub(h.slice(4)); return; }
    if(h.indexOf('ai/')===0){ if(activeSection!=='ai')showSection('ai'); showAiSub(h.slice(3)); return; }
    var sec=h||'home';
    var valid=false; for(var i=0;i<SECTIONS.length;i++){if(SECTIONS[i][0]===sec)valid=true;}
    showSection(valid?sec:'home');
  }
  window.addEventListener('hashchange',routeFromHash);
  async function init(){
    var me=await api('/auth/me');
    if(!me.ok){window.location='/login';return;}
    var d=await me.json(); var u=d.user||{}; var org=d.organization||{};
    slug=org.slug||'';
    currentUser=u;
    // Show the name (not the email) as the primary identity; the account panel
    // holds the full email.
    document.getElementById('who').textContent=displayName(u.name,u.email)+' · '+esc(u.role);
    if(org.name){document.getElementById('orgName').textContent=esc(org.name);}
    myRole=u.role||'';
    renderGreeting();
    renderQuickActions();
    if(u.role==='owner'||u.role==='admin'){
      document.getElementById('brandPanel').style.display='';
      document.getElementById('domainPanel').style.display='';
      document.getElementById('brandsPanel').style.display='';
      document.getElementById('teamPanel').style.display='';
      document.getElementById('portalPanel').style.display='';
      document.getElementById('emailPanel').style.display='';
      document.getElementById('dripPanel').style.display='';
      document.getElementById('formsPanel').style.display='';
      document.getElementById('aisub-knowledge').style.display='';
      document.getElementById('workflowsPanel').style.display='';
      document.getElementById('aisub-actions').style.display='';
      document.getElementById('aisub-employees').style.display='';
      document.getElementById('auditPanel').style.display='';
      loadPrivacyRequests();
      loadTeam();
      loadPortalUsers();
      loadEmails();
      loadDrip();
      loadDripEnrollments();
      loadForms();
      loadWorkflows();
      loadAudit();
    }
    if(u.role==='owner'){
      document.getElementById('aisub-usage').style.display='';
    }
    // Legal & Compliance is visible to all authenticated users; owners/admins
    // manage, members view. Write controls are gated by role inside the panel.
    document.getElementById('legalPanel').style.display='';
    loadLegalWorkspace();
    // Website + AI sub-sections load lazily when their tab is first opened
    // (see loadWebSub / loadAiSub) — so the AI section isn't fetched up front.
    await loadDashboard(); await loadBranding(); await loadClients(); await loadProjects(); await loadInvoices(); await loadTickets(); await loadLeads(); await loadProposals(); await loadCampaigns(); await loadReviews(); await loadProducts(); await loadBooks(); await loadPrograms();
    await loadActivity();
    await loadFiles();
    await loadCalendar();
    document.getElementById('aisub-command').style.display='';
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
      {label:'Build a website',hint:'Create Website',run:function(){close();location.hash='#web/create';setTimeout(function(){var w=document.getElementById('wname');if(w)w.focus();},60);}},
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
  // Enter sends; Shift+Enter inserts a newline (standard chat composer behavior).
  document.getElementById('aiChatInput').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendAiChat();}});
  document.getElementById('aiNewConvo').addEventListener('click',newConversation);
  document.getElementById('aeCreateBtn').addEventListener('click',function(){openEmployeeEditor(null);});
  document.getElementById('aiToolSearch').addEventListener('input',renderAvailableActions);
  document.getElementById('aiToolMode').addEventListener('change',renderAvailableActions);
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
  document.getElementById('removeAi').addEventListener('click',function(){
    openConfirm({title:'Remove your AI key',intro:'Remove your stored provider key? Generation will fall back to the platform\\u2019s included AI. Your key cannot be recovered — you would need to enter it again.',confirmLabel:'Remove key',danger:true,onConfirm:function(){
      return api('/api/platform/ai-settings',{method:'DELETE'}).then(function(r){
        if(r.ok){setMsg('aimsg','ok','Removed. Using the platform\\u2019s included AI.');loadAiSettings();}
        else{setMsg('aimsg','err','Could not remove the key.');throw new Error('failed');}
      });
    }});
  });
  document.getElementById('addWebsite').addEventListener('click',async function(){
    var btn=this;if(btn.disabled)return;
    var nm=document.getElementById('wname'),br=document.getElementById('wbrief'),cl=document.getElementById('wclient');
    if(!nm.value.trim()){setMsg('wmsg','err','A website name is required.');return;}
    btn.disabled=true;btn.textContent='Creating\\u2026';setMsg('wmsg','','Creating a draft website\\u2026');
    var r=await api('/api/platform/websites',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:nm.value.trim(),brief:br.value.trim()||undefined,clientId:cl.value||undefined})});
    var x=await r.json().catch(function(){return {};});
    btn.disabled=false;btn.textContent='Create website';
    if(r.ok){nm.value='';br.value='';setMsg('wmsg','ok','Draft website created \\u2014 open My Websites to Generate it with AI.');webSubLoaded.mywebsites=false;loadWebsites();}
    else if(r.status===402){setMsg('wmsg','err','Your plan\\u2019s website limit is reached \\u2014 upgrade to add more.');}
    else if(r.status===403){setMsg('wmsg','err','Only owners and admins can create websites.');}
    else{setMsg('wmsg','err',(x.error&&x.error.message)||'Could not create the website.');}
    // entered values are preserved above (only cleared on success).
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
  (function(){
    var dismiss=document.getElementById('onbDismiss');
    if(dismiss)dismiss.addEventListener('click',function(){setOnboardingDismissed(true);});
    var reopen=document.getElementById('onbReopen');
    if(reopen)reopen.addEventListener('click',function(){
      // Owner/admin restore the checklist for the whole workspace; a member
      // just reveals it for their own session.
      if(canManageWorkspace()){setOnboardingDismissed(false);}
      else{onbDismissed=false;renderOnboarding();}
    });
    var manage=document.getElementById('managePlan');
    if(manage)manage.addEventListener('click',function(){
      var w=document.getElementById('planPickerWrap');
      var show=(w.style.display==='none'||!w.style.display);
      w.style.display=show?'flex':'none';
      if(show)loadPlans();
    });
    var payBtn=document.getElementById('updatePayment');
    if(payBtn)payBtn.addEventListener('click',async function(){
      if(payBtn.disabled)return;payBtn.disabled=true;setMsg('plmsg','','Opening secure billing portal\\u2026');
      var r=await api('/api/platform/billing/portal',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      payBtn.disabled=false;
      if(r.ok){var d=await r.json();if(d.url){window.location=d.url;return;}}
      var x=await r.json().catch(function(){return {};});
      setMsg('plmsg','err',(x.error&&x.error.message)||'Could not open the billing portal.');
    });
  })();
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
  (function(){var bc=document.getElementById('bcolor');if(bc)bc.addEventListener('input',previewBrand);})();
  document.getElementById('saveBrand').addEventListener('click',async function(){
    var btn=this;if(btn.disabled)return;btn.disabled=true;setMsg('bmsg','','Saving\\u2026');
    var r=await api('/api/platform/branding',{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({displayName:document.getElementById('bname').value.trim(),
        primaryColor:document.getElementById('bcolor').value.trim()})});
    var d=await r.json().catch(function(){return {};});
    btn.disabled=false;
    if(r.ok){setMsg('bmsg','ok','Saved \\u2014 this workspace-wide branding is live.');var b=d.branding||{};
      applyAccent(b.primaryColor);previewBrand();
      if(b.displayName){document.getElementById('orgName').textContent=b.displayName;}}
    else if(r.status===403){setMsg('bmsg','err','Only owners and admins can change branding.');}
    else{setMsg('bmsg','err',(d.error&&d.error.message)||'Could not save \\u2014 check the color is a valid #rrggbb value.');}
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
