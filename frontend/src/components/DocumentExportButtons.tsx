import {
  useState,
} from "react";
import {
  copyDocumentForWord,
  downloadWordDocument,
  printDocumentAsPdf,
} from "../utils/documentExport";
import type {
  ExportDocumentData,
} from "../utils/documentExport";

type ExportStatusType =
  | "success"
  | "error";

interface DocumentExportButtonsProps {
  documentData:
    ExportDocumentData | null;

  disabled?: boolean;

  onStatus?: (
    message: string,
    type: ExportStatusType,
  ) => void;
}

type ExportAction =
  | "copy"
  | "word"
  | "pdf"
  | null;

export default function DocumentExportButtons({
  documentData,
  disabled = false,
  onStatus,
}: DocumentExportButtonsProps) {
  const [activeAction, setActiveAction] =
    useState<ExportAction>(null);

  const exportDisabled =
    disabled ||
    !documentData ||
    activeAction !== null;

  async function copyForWord():
  Promise<void> {
    if (!documentData) {
      return;
    }

    setActiveAction("copy");

    try {
      await copyDocumentForWord(
        documentData,
      );

      onStatus?.(
        "The document was copied with formatting and is ready to paste into Microsoft Word.",
        "success",
      );
    } catch (error) {
      onStatus?.(
        error instanceof Error
          ? error.message
          : "The document could not be copied.",
        "error",
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function downloadWord():
  Promise<void> {
    if (!documentData) {
      return;
    }

    setActiveAction("word");

    try {
      await downloadWordDocument(
        documentData,
      );

      onStatus?.(
        "The Microsoft Word document was created successfully.",
        "success",
      );
    } catch (error) {
      onStatus?.(
        error instanceof Error
          ? error.message
          : "The Word document could not be created.",
        "error",
      );
    } finally {
      setActiveAction(null);
    }
  }

  function saveAsPdf(): void {
    if (!documentData) {
      return;
    }

    setActiveAction("pdf");

    try {
      printDocumentAsPdf(
        documentData,
      );

      onStatus?.(
        "The print window opened. Choose Save as PDF as the printer destination.",
        "success",
      );
    } catch (error) {
      onStatus?.(
        error instanceof Error
          ? error.message
          : "The PDF print window could not be opened.",
        "error",
      );
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <div
      className="button-group"
      aria-label="Document export options"
    >
      <button
        type="button"
        className="secondary-button"
        onClick={() =>
          void copyForWord()
        }
        disabled={exportDisabled}
      >
        {activeAction === "copy"
          ? "Copying..."
          : "Copy for Word"}
      </button>

      <button
        type="button"
        className="secondary-button"
        onClick={() =>
          void downloadWord()
        }
        disabled={exportDisabled}
      >
        {activeAction === "word"
          ? "Creating Word..."
          : "Download Word"}
      </button>

      <button
        type="button"
        className="secondary-button"
        onClick={saveAsPdf}
        disabled={exportDisabled}
      >
        {activeAction === "pdf"
          ? "Opening..."
          : "Save as PDF"}
      </button>
    </div>
  );
}