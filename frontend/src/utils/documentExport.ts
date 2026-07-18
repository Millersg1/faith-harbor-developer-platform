import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

export interface ExportMetadataItem {
  label: string;
  value: string;
}

export interface ExportSection {
  heading?: string;
  paragraphs: string[];
}

export interface ExportDocumentData {
  title: string;
  subtitle?: string;
  filename: string;
  metadata?: ExportMetadataItem[];
  sections: ExportSection[];
}

function sanitizeFilename(
  value: string,
): string {
  return (
    value
      .trim()
      .replace(
        /[<>:"/\\|?*]/g,
        "-",
      )
      .replace(/\s+/g, " ")
      .replace(/-+/g, "-")
      .replace(
        /^[.\s-]+|[.\s-]+$/g,
        "",
      )
      .slice(0, 100) ||
    "Faith Harbor Document"
  );
}

function escapeHtml(
  value: string,
): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textToHtml(
  value: string,
): string {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((line) =>
          escapeHtml(line),
        )
        .join("<br>");

      return `<p>${lines}</p>`;
    })
    .join("");
}

function buildDocumentHtml(
  documentData: ExportDocumentData,
): string {
  const metadataHtml =
    documentData.metadata?.length
      ? `
        <dl class="metadata">
          ${documentData.metadata
            .map(
              (item) => `
                <div>
                  <dt>
                    ${escapeHtml(
                      item.label,
                    )}
                  </dt>

                  <dd>
                    ${escapeHtml(
                      item.value,
                    )}
                  </dd>
                </div>
              `,
            )
            .join("")}
        </dl>
      `
      : "";

  const sectionsHtml =
    documentData.sections
      .map(
        (section) => `
          <section>
            ${
              section.heading
                ? `
                  <h2>
                    ${escapeHtml(
                      section.heading,
                    )}
                  </h2>
                `
                : ""
            }

            ${section.paragraphs
              .map((paragraph) =>
                textToHtml(
                  paragraph,
                ),
              )
              .join("")}
          </section>
        `,
      )
      .join("");

  return `
    <article class="faith-harbor-document">
      <header>
        <p class="organization">
          Faith Harbor LLC
        </p>

        <h1>
          ${escapeHtml(
            documentData.title,
          )}
        </h1>

        ${
          documentData.subtitle
            ? `
              <p class="subtitle">
                ${escapeHtml(
                  documentData.subtitle,
                )}
              </p>
            `
            : ""
        }
      </header>

      ${metadataHtml}

      ${sectionsHtml}

      <footer>
        <p>
          Technology is our tool. People
          are our purpose. Christ is our
          foundation.
        </p>

        <p>
          AI-assisted content must be
          reviewed and approved by human
          leadership before final use or
          client delivery.
        </p>
      </footer>
    </article>
  `;
}

function buildPrintablePage(
  documentData: ExportDocumentData,
): string {
  const documentHtml =
    buildDocumentHtml(
      documentData,
    );

  return `
    <!doctype html>

    <html lang="en">
      <head>
        <meta charset="UTF-8">

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        >

        <title>
          ${escapeHtml(
            documentData.title,
          )}
        </title>

        <style>
          @page {
            size: letter;
            margin: 0.75in;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            background: #ffffff;
            color: #1f2937;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
            font-size: 11pt;
            line-height: 1.55;
          }

          .faith-harbor-document {
            max-width: 8in;
            margin: 0 auto;
          }

          header {
            margin-bottom: 28px;
            padding-bottom: 18px;
            border-bottom:
              2px solid #1f3a5f;
          }

          .organization {
            margin: 0 0 8px;
            color: #2ca6a4;
            font-size: 9pt;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }

          h1 {
            margin: 0;
            color: #1f3a5f;
            font-family:
              Georgia,
              "Times New Roman",
              serif;
            font-size: 25pt;
            line-height: 1.2;
          }

          .subtitle {
            margin: 9px 0 0;
            color: #5a3e85;
            font-size: 12pt;
          }

          .metadata {
            display: grid;
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
            gap: 10px 24px;
            margin: 0 0 28px;
            padding: 16px;
            border:
              1px solid #d7e0e8;
            background: #f5f7fa;
          }

          .metadata div {
            break-inside: avoid;
          }

          dt {
            color: #64748b;
            font-size: 8pt;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          dd {
            margin: 3px 0 0;
            font-weight: 700;
          }

          section {
            margin-bottom: 24px;
          }

          h2 {
            margin: 0 0 10px;
            padding-bottom: 5px;
            border-bottom:
              1px solid #d7e0e8;
            color: #1f3a5f;
            font-family:
              Georgia,
              "Times New Roman",
              serif;
            font-size: 16pt;
          }

          p {
            margin: 0 0 11px;
          }

          footer {
            margin-top: 34px;
            padding-top: 14px;
            border-top:
              1px solid #d7e0e8;
            color: #64748b;
            font-size: 8.5pt;
          }

          footer p {
            margin-bottom: 5px;
          }

          @media print {
            body {
              print-color-adjust:
                exact;
              -webkit-print-color-adjust:
                exact;
            }
          }
        </style>
      </head>

      <body>
        ${documentHtml}
      </body>
    </html>
  `;
}

function buildWordParagraphs(
  documentData: ExportDocumentData,
): Paragraph[] {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      alignment:
        AlignmentType.CENTER,

      children: [
        new TextRun({
          text:
            "FAITH HARBOR LLC",
          bold: true,
          color: "2CA6A4",
          size: 18,
          characterSpacing: 40,
        }),
      ],

      spacing: {
        after: 160,
      },
    }),

    new Paragraph({
      text: documentData.title,
      heading:
        HeadingLevel.TITLE,
      alignment:
        AlignmentType.CENTER,

      spacing: {
        after:
          documentData.subtitle
            ? 120
            : 300,
      },
    }),
  ];

  if (documentData.subtitle) {
    paragraphs.push(
      new Paragraph({
        alignment:
          AlignmentType.CENTER,

        children: [
          new TextRun({
            text:
              documentData.subtitle,
            italics: true,
            color: "5A3E85",
            size: 22,
          }),
        ],

        spacing: {
          after: 300,
        },
      }),
    );
  }

  if (
    documentData.metadata?.length
  ) {
    for (
      const item of
      documentData.metadata
    ) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text:
                `${item.label}: `,
              bold: true,
              color: "1F3A5F",
            }),

            new TextRun({
              text: item.value,
            }),
          ],

          spacing: {
            after: 80,
          },
        }),
      );
    }

    paragraphs.push(
      new Paragraph({
        text: "",

        spacing: {
          after: 120,
        },
      }),
    );
  }

  for (
    const section of
    documentData.sections
  ) {
    if (section.heading) {
      paragraphs.push(
        new Paragraph({
          text: section.heading,
          heading:
            HeadingLevel.HEADING_1,

          spacing: {
            before: 220,
            after: 120,
          },
        }),
      );
    }

    for (
      const paragraphText of
      section.paragraphs
    ) {
      const blocks =
        paragraphText
          .split(/\n{2,}/)
          .map((block) =>
            block.trim(),
          )
          .filter(Boolean);

      for (const block of blocks) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: block,
                size: 22,
              }),
            ],

            spacing: {
              after: 160,
              line: 340,
            },
          }),
        );
      }
    }
  }

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text:
            "Technology is our tool. People are our purpose. Christ is our foundation.",
          italics: true,
          color: "64748B",
          size: 17,
        }),
      ],

      spacing: {
        before: 320,
        after: 80,
      },
    }),

    new Paragraph({
      children: [
        new TextRun({
          text:
            "AI-assisted content must be reviewed and approved by human leadership before final use or client delivery.",
          color: "64748B",
          size: 17,
        }),
      ],
    }),
  );

  return paragraphs;
}

export async function copyDocumentForWord(
  documentData: ExportDocumentData,
): Promise<void> {
  const html =
    buildDocumentHtml(
      documentData,
    );

  const plainText = [
    "FAITH HARBOR LLC",
    documentData.title,
    documentData.subtitle ?? "",

    ...(documentData.metadata?.map(
      (item) =>
        `${item.label}: ${item.value}`,
    ) ?? []),

    ...documentData.sections.flatMap(
      (section) => [
        section.heading ?? "",
        ...section.paragraphs,
      ],
    ),

    "",

    "Technology is our tool. People are our purpose. Christ is our foundation.",

    "AI-assisted content must be reviewed and approved by human leadership before final use or client delivery.",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (
    typeof ClipboardItem !==
      "undefined" &&
    navigator.clipboard.write
  ) {
    const clipboardItem =
      new ClipboardItem({
        "text/html": new Blob(
          [html],
          {
            type: "text/html",
          },
        ),

        "text/plain": new Blob(
          [plainText],
          {
            type: "text/plain",
          },
        ),
      });

    await navigator.clipboard.write([
      clipboardItem,
    ]);

    return;
  }

  await navigator.clipboard.writeText(
    plainText,
  );
}

export async function downloadWordDocument(
  documentData: ExportDocumentData,
): Promise<void> {
  const document = new Document({
    creator: "Faith Harbor LLC",

    title:
      documentData.title,

    description:
      documentData.subtitle ??
      "Faith Harbor OS document",

    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1080,
              right: 1080,
              bottom: 1080,
              left: 1080,
            },
          },
        },

        children:
          buildWordParagraphs(
            documentData,
          ),
      },
    ],
  });

  const blob =
    await Packer.toBlob(
      document,
    );

  const downloadUrl =
    URL.createObjectURL(
      blob,
    );

  const anchor =
    window.document
      .createElement("a");

  anchor.href = downloadUrl;

  anchor.download =
    `${sanitizeFilename(
      documentData.filename,
    )}.docx`;

  window.document.body
    .appendChild(anchor);

  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(
      downloadUrl,
    );
  }, 1000);
}

export function printDocumentAsPdf(
  documentData: ExportDocumentData,
): void {
  const printWindow =
    window.open(
      "",
      "_blank",
    );

  if (!printWindow) {
    throw new Error(
      "The print window was blocked. Please allow pop-ups for Faith Harbor OS.",
    );
  }

  printWindow.opener = null;

  printWindow.document.open();

  printWindow.document.write(
    buildPrintablePage(
      documentData,
    ),
  );

  printWindow.document.close();

  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 300);
}