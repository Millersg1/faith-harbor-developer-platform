import type { OrganizationBrandingRecord } from "../branding/OrganizationBranding";
import {
  brandAccent,
  brandLockupHtml,
  brandName,
  brandSupportEmail,
  escapeHtml,
} from "../branding/brandingTheme";
import type { PlatformInvoiceRecord } from "./PlatformInvoice";

/** The minimal client shape the document needs (name + optional email). */
export interface InvoiceDocumentClient {
  name: string;
  email?: string;
}

export interface InvoiceDocumentInput {
  invoice: PlatformInvoiceRecord;
  client?: InvoiceDocumentClient;
  branding?: OrganizationBrandingRecord;
}

function money(
  amount: number,
  currency: string,
): string {
  const value = Number(
    amount || 0,
  ).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${escapeHtml(currency)} ${value}`;
}

function fmtDate(
  iso: string | undefined,
): string {
  if (!iso) {
    return "—";
  }

  const parsed = Date.parse(iso);

  if (Number.isNaN(parsed)) {
    return escapeHtml(iso);
  }

  // Deterministic YYYY-MM-DD (no locale/timezone surprises in a document).
  return new Date(parsed)
    .toISOString()
    .slice(0, 10);
}

/**
 * Renders a self-contained, branded, print-ready HTML invoice. It carries no
 * external assets and a "Print / Save as PDF" button that calls the browser's
 * native print dialog — an honest, dependency-free PDF path (no server-side
 * PDF engine on the shared host). All tenant/client values are HTML-escaped.
 */
export function renderInvoiceDocument(
  input: InvoiceDocumentInput,
): string {
  const { invoice, client, branding } =
    input;
  const accent = brandAccent(branding);
  const name = brandName(branding);
  const support =
    brandSupportEmail(branding);

  const rows = invoice.lineItems
    .map((item) => {
      const lineTotal =
        item.quantity *
        item.unitPrice;

      return `<tr>
        <td>${escapeHtml(item.description)}</td>
        <td class="num">${item.quantity}</td>
        <td class="num">${money(item.unitPrice, invoice.currency)}</td>
        <td class="num">${money(lineTotal, invoice.currency)}</td>
      </tr>`;
    })
    .join("");

  const statusColor =
    invoice.status === "paid"
      ? "#16a34a"
      : invoice.status === "overdue"
        ? "#dc2626"
        : accent;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(invoice.number)} · ${escapeHtml(name)}</title>
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    color: #1f2937; background: #f3f4f6; padding: 32px 16px; }
  .sheet { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 14px;
    box-shadow: 0 10px 40px rgba(0,0,0,.08); overflow: hidden; }
  .bar { height: 8px; background: var(--accent); }
  .pad { padding: 36px 40px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
  h1 { font-size: 26px; margin: 0; letter-spacing: -0.01em; }
  .muted { color: #6b7280; font-size: 13px; }
  .status { display: inline-block; font-size: 11px; font-weight: 800; text-transform: uppercase;
    letter-spacing: .05em; padding: 4px 10px; border-radius: 999px; color: #fff; background: ${statusColor}; }
  .meta { display: flex; gap: 40px; flex-wrap: wrap; margin: 28px 0 8px; }
  .meta div { font-size: 13px; }
  .meta .k { color: #9ca3af; text-transform: uppercase; letter-spacing: .04em; font-size: 11px; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 14px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
    color: #9ca3af; border-bottom: 2px solid #e5e7eb; padding: 8px 10px; }
  td { padding: 11px 10px; border-bottom: 1px solid #f0f1f3; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .total { display: flex; justify-content: flex-end; margin-top: 18px; }
  .total .box { min-width: 240px; }
  .total .line { display: flex; justify-content: space-between; padding: 6px 10px; font-size: 14px; }
  .total .grand { font-size: 18px; font-weight: 800; border-top: 2px solid #e5e7eb; margin-top: 4px; padding-top: 12px; }
  .foot { color: #9ca3af; font-size: 12px; padding: 20px 40px 32px; border-top: 1px solid #f0f1f3; }
  .actions { max-width: 720px; margin: 0 auto 18px; display: flex; justify-content: flex-end; }
  .print { border: none; background: var(--accent); color: #04211d; font-weight: 700;
    padding: 10px 18px; border-radius: 9px; cursor: pointer; font-size: 14px; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { box-shadow: none; border-radius: 0; }
    .actions { display: none; }
  }
</style>
</head>
<body>
  <div class="actions"><button class="print" onclick="window.print()">Print / Save as PDF</button></div>
  <div class="sheet">
    <div class="bar"></div>
    <div class="pad">
      <div class="head">
        <div>
          ${brandLockupHtml(branding, { color: accent })}
          <div class="muted" style="margin-top:8px;">Invoice</div>
        </div>
        <div style="text-align:right;">
          <h1>${escapeHtml(invoice.number)}</h1>
          <div style="margin-top:8px;"><span class="status">${escapeHtml(invoice.status)}</span></div>
        </div>
      </div>

      <div class="meta">
        <div>
          <div class="k">Billed to</div>
          <div>${escapeHtml(client?.name || "—")}</div>
          ${client?.email ? `<div class="muted">${escapeHtml(client.email)}</div>` : ""}
        </div>
        <div>
          <div class="k">Issued</div>
          <div>${fmtDate(invoice.issueDate)}</div>
        </div>
        <div>
          <div class="k">Due</div>
          <div>${fmtDate(invoice.dueDate)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="total">
        <div class="box">
          <div class="line grand"><span>Total</span><span>${money(invoice.amount, invoice.currency)}</span></div>
        </div>
      </div>
    </div>
    <div class="foot">
      ${escapeHtml(name)}${support ? ` · ${escapeHtml(support)}` : ""}
    </div>
  </div>
</body>
</html>`;
}
