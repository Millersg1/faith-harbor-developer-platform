import {
  useState,
} from "react";

interface ConfirmDeleteButtonProps {
  recordName: string;

  onDelete:
    () => Promise<void>;

  disabled?: boolean;
}

export default function ConfirmDeleteButton({
  recordName,
  onDelete,
  disabled = false,
}: ConfirmDeleteButtonProps) {
  const [
    confirmationOpen,
    setConfirmationOpen,
  ] = useState(false);

  const [isDeleting, setIsDeleting] =
    useState(false);

  async function confirmDelete():
  Promise<void> {
    setIsDeleting(true);

    try {
      await onDelete();

      setConfirmationOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }

  if (!confirmationOpen) {
    return (
      <button
        type="button"
        className="danger-button"
        onClick={() =>
          setConfirmationOpen(true)
        }
        disabled={disabled}
      >
        Delete
      </button>
    );
  }

  return (
    <div
      className="delete-confirmation"
      role="alert"
    >
      <p>
        Permanently delete{" "}
        <strong>
          {recordName}
        </strong>
        ?
      </p>

      <div className="button-group">
        <button
          type="button"
          className="danger-button"
          onClick={() =>
            void confirmDelete()
          }
          disabled={isDeleting}
        >
          {isDeleting
            ? "Deleting..."
            : "Confirm Delete"}
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            setConfirmationOpen(false)
          }
          disabled={isDeleting}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}