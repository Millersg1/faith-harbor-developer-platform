import PDFDocument from "pdfkit";

import type { OrganizationBrandingRecord } from "../branding/OrganizationBranding";
import {
  brandAccent,
  brandName,
  brandSupportEmail,
} from "../branding/brandingTheme";
import type { PlatformInvoiceRecord } from "./PlatformInvoice";

/** The minimal client shape the PDF needs. */
export interface InvoicePdfClient {
  name: string;
  email?: string;
}

export interface InvoicePdfInput {
  invoice: PlatformInvoiceRecord;
  client?: InvoicePdfClient;
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

  return `${currency} ${value}`;
}

function fmtDate(
  iso: string | undefined,
): string {
  if (!iso) {
    return "—";
  }

  const parsed = Date.parse(iso);

  if (Number.isNaN(parsed)) {
    return iso;
  }

  return new Date(parsed)
    .toISOString()
    .slice(0, 10);
}

/**
 * Renders a branded invoice as a real PDF (server-side, via pdfkit — pure JS,
 * no headless browser). Uses the 14 standard PDF fonts (Helvetica) so it needs
 * no external font files or network. Returns the finished PDF as a Buffer.
 *
 * The layout mirrors the printable HTML invoice: an accent bar, the tenant's
 * brand, invoice meta, a line-item table, and the total. The remote logo image
 * is intentionally NOT fetched (that would be a network/SSRF dependency); the
 * brand name is drawn in the accent color instead.
 */
export function renderInvoicePdf(
  input: InvoicePdfInput,
): Promise<Buffer> {
  const { invoice, client, branding } =
    input;
  const accent = brandAccent(branding);
  const name = brandName(branding);
  const support =
    brandSupportEmail(branding);
  const currency = invoice.currency;

  return new Promise<Buffer>(
    (resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) =>
        chunks.push(c),
      );
      doc.on("end", () =>
        resolve(
          Buffer.concat(chunks),
        ),
      );
      doc.on("error", reject);

      const left = doc.page.margins.left;
      const right =
        doc.page.width -
        doc.page.margins.right;
      const width = right - left;

      // Accent bar across the top.
      doc
        .rect(0, 0, doc.page.width, 10)
        .fill(accent);

      // Brand + invoice heading.
      doc
        .fill(accent)
        .font("Helvetica-Bold")
        .fontSize(20)
        .text(name, left, 46);

      doc
        .fill("#111827")
        .font("Helvetica-Bold")
        .fontSize(24)
        .text(
          invoice.number,
          left,
          44,
          {
            width,
            align: "right",
          },
        );

      doc
        .fill("#6b7280")
        .font("Helvetica")
        .fontSize(10)
        .text("INVOICE", left, 72)
        .text(
          invoice.status.toUpperCase(),
          left,
          72,
          { width, align: "right" },
        );

      // Meta row: billed to / issued / due.
      const metaY = 120;
      const colW = width / 3;
      const metaCol = (
        x: number,
        label: string,
        value: string,
        sub?: string,
      ): void => {
        doc
          .fill("#9ca3af")
          .font("Helvetica")
          .fontSize(8)
          .text(
            label.toUpperCase(),
            x,
            metaY,
            { width: colW },
          );
        doc
          .fill("#111827")
          .font("Helvetica")
          .fontSize(11)
          .text(
            value,
            x,
            metaY + 12,
            { width: colW },
          );
        if (sub) {
          doc
            .fill("#9ca3af")
            .fontSize(9)
            .text(
              sub,
              x,
              metaY + 27,
              { width: colW },
            );
        }
      };

      metaCol(
        left,
        "Billed to",
        client?.name || "—",
        client?.email,
      );
      metaCol(
        left + colW,
        "Issued",
        fmtDate(invoice.issueDate),
      );
      metaCol(
        left + colW * 2,
        "Due",
        fmtDate(invoice.dueDate),
      );

      // Line-item table.
      let y = metaY + 60;
      const cDesc = left;
      const cQty = left + width * 0.55;
      const cUnit = left + width * 0.7;
      const cAmt = left + width * 0.85;
      const rightText = (
        x: number,
        text: string,
        top: number,
      ): void => {
        doc.text(text, x, top, {
          width: right - x,
          align: "right",
        });
      };

      doc
        .fill("#9ca3af")
        .font("Helvetica-Bold")
        .fontSize(9);
      doc.text(
        "DESCRIPTION",
        cDesc,
        y,
      );
      rightText(cQty, "QTY", y);
      rightText(cUnit, "UNIT", y);
      rightText(cAmt, "AMOUNT", y);

      y += 16;
      doc
        .moveTo(left, y)
        .lineTo(right, y)
        .lineWidth(1)
        .stroke("#e5e7eb");
      y += 8;

      doc
        .fill("#111827")
        .font("Helvetica")
        .fontSize(10);

      for (const item of invoice.lineItems) {
        const lineTotal =
          item.quantity *
          item.unitPrice;

        const descHeight =
          doc.heightOfString(
            item.description,
            {
              width:
                cQty - cDesc - 10,
            },
          );

        doc
          .fill("#111827")
          .text(
            item.description,
            cDesc,
            y,
            {
              width:
                cQty - cDesc - 10,
            },
          );
        rightText(
          cQty,
          String(item.quantity),
          y,
        );
        rightText(
          cUnit,
          money(
            item.unitPrice,
            currency,
          ),
          y,
        );
        rightText(
          cAmt,
          money(lineTotal, currency),
          y,
        );

        y += Math.max(descHeight, 12) + 10;
        doc
          .moveTo(left, y - 5)
          .lineTo(right, y - 5)
          .lineWidth(0.5)
          .stroke("#f0f1f3");
      }

      // Total.
      y += 10;
      doc
        .fill("#111827")
        .font("Helvetica-Bold")
        .fontSize(13);
      doc.text("Total", cUnit, y, {
        width: cAmt - cUnit - 10,
      });
      rightText(
        cAmt,
        money(invoice.amount, currency),
        y,
      );

      // Footer.
      const footer = support
        ? `${name}  ·  ${support}`
        : name;
      doc
        .fill("#9ca3af")
        .font("Helvetica")
        .fontSize(9)
        .text(
          footer,
          left,
          doc.page.height - 60,
          { width, align: "center" },
        );

      doc.end();
    },
  );
}
