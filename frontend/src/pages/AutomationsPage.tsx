import {
  useEffect,
  useMemo,
  useState,
} from "react";

type AutomationStatus =
  | "pending"
  | "approved"
  | "dismissed";

interface AutomationDraft {
  id: string;
  trigger: string;
  title: string;
  to: string;
  subject: string;
  body: string;
  status: AutomationStatus;
  relatedType: string;
  relatedId: string;
  clientId?: string;
  emailId?: string;
  createdAt: string;
  resolvedAt?: string;
}

interface AutomationsResponse {
  count: number;
  drafts: AutomationDraft[];
}

interface StatusMessage {
  message: string;
  type:
    | "working"
    | "success"
    | "error";
}

const triggerLabels: Record<
  string,
  string
> = {
  "lead.created": "New lead",
  "project.created": "New project",
  "invoice.overdue":
    "Overdue invoice",
};

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error
    ? error.message
    : fallback;
}

async function getResponseData<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const responseText =
    await response.text();

  if (!responseText.trim()) {
    if (response.ok) {
      return undefined as T;
    }

    throw new Error(fallbackMessage);
  }

  let result: unknown;

  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(
      response.ok
        ? "The server returned an invalid response."
        : fallbackMessage,
    );
  }

  if (!response.ok) {
    if (
      typeof result === "object" &&
      result !== null
    ) {
      const errorResult =
        result as {
          error?: {
            message?: string;
          };
        };

      throw new Error(
        errorResult.error?.message ??
          fallbackMessage,
      );
    }

    throw new Error(fallbackMessage);
  }

  return result as T;
}

function formatDate(
  value: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

async function requestDrafts():
Promise<AutomationsResponse> {
  const response = await fetch(
    "/api/v1/automations",
  );

  return getResponseData<AutomationsResponse>(
    response,
    "Automations could not be loaded.",
  );
}

export default function AutomationsPage() {
  const [drafts, setDrafts] =
    useState<AutomationDraft[]>([]);

  const [status, setStatus] =
    useState<StatusMessage | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [busyId, setBusyId] =
    useState<string | null>(null);

  const [scanning, setScanning] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    requestDrafts()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setDrafts(result.drafts);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setStatus({
          message:
            getErrorMessage(
              error,
              "Automations could not be loaded.",
            ),
          type: "error",
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const pending = useMemo(
    () =>
      drafts.filter(
        (draft) =>
          draft.status === "pending",
      ),
    [drafts],
  );

  const resolved = useMemo(
    () =>
      drafts.filter(
        (draft) =>
          draft.status !== "pending",
      ),
    [drafts],
  );

  async function reload():
  Promise<void> {
    const result =
      await requestDrafts();

    setDrafts(result.drafts);
  }

  async function runScan():
  Promise<void> {
    setScanning(true);

    setStatus({
      message:
        "Scanning for work that needs attention...",
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/automations/scan",
        {
          method: "POST",
        },
      );

      const result =
        await getResponseData<{
          created: number;
        }>(
          response,
          "The scan could not be run.",
        );

      await reload();

      setStatus({
        message:
          result.created > 0
            ? `Scan complete. ${result.created} new draft(s) ready for review.`
            : "Scan complete. Nothing new needs attention.",
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The scan could not be run.",
          ),
        type: "error",
      });
    } finally {
      setScanning(false);
    }
  }

  async function act(
    draftId: string,
    action: "approve" | "dismiss",
  ): Promise<void> {
    setBusyId(draftId);

    setStatus({
      message:
        action === "approve"
          ? "Approving and sending..."
          : "Dismissing...",
      type: "working",
    });

    try {
      const response = await fetch(
        `/api/v1/automations/${draftId}/${action}`,
        {
          method: "POST",
        },
      );

      await getResponseData(
        response,
        action === "approve"
          ? "The draft could not be approved."
          : "The draft could not be dismissed.",
      );

      await reload();

      setStatus({
        message:
          action === "approve"
            ? "Approved. The email was recorded in the outbox."
            : "Dismissed. Nothing was sent.",
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The action could not be completed.",
          ),
        type: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="workspace active">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Automation
          </p>

          <h3>
            Suggested Actions
          </h3>

          <p className="help-text">
            The automation engine
            prepares work for you as
            things happen across the
            business. Nothing is ever
            sent until you approve it.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={scanning}
          onClick={() =>
            void runScan()
          }
        >
          {scanning
            ? "Scanning..."
            : "Scan Now"}
        </button>
      </div>

      {status && (
        <div
          className={`status-message ${status.type}`}
        >
          {status.message}
        </div>
      )}

      <div className="workspace-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Needs Your Approval
              </p>

              <h3>
                Pending
                {pending.length > 0
                  ? ` (${pending.length})`
                  : ""}
              </h3>
            </div>
          </div>

          {loading ? (
            <p className="help-text">
              Loading...
            </p>
          ) : pending.length ===
            0 ? (
            <p className="help-text">
              Nothing waiting. New
              suggestions appear here as
              leads and other work come
              in.
            </p>
          ) : (
            <div className="automation-list">
              {pending.map(
                (draft) => (
                  <article
                    className="automation-card"
                    key={draft.id}
                  >
                    <header className="automation-card-head">
                      <span className="automation-trigger">
                        {triggerLabels[
                          draft.trigger
                        ] ??
                          draft.trigger}
                      </span>

                      <span className="record-detail">
                        {formatDate(
                          draft.createdAt,
                        )}
                      </span>
                    </header>

                    <h4 className="automation-title">
                      {draft.title}
                    </h4>

                    <p className="automation-meta">
                      To {draft.to}
                    </p>

                    <p className="automation-subject">
                      {draft.subject}
                    </p>

                    <pre className="automation-body">
                      {draft.body}
                    </pre>

                    <div className="automation-actions">
                      <button
                        type="button"
                        className="primary-button"
                        disabled={
                          busyId !==
                          null
                        }
                        onClick={() =>
                          void act(
                            draft.id,
                            "approve",
                          )
                        }
                      >
                        {busyId ===
                        draft.id
                          ? "Working..."
                          : "Approve & Send"}
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={
                          busyId !==
                          null
                        }
                        onClick={() =>
                          void act(
                            draft.id,
                            "dismiss",
                          )
                        }
                      >
                        Dismiss
                      </button>
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                History
              </p>

              <h3>Resolved</h3>
            </div>
          </div>

          {resolved.length === 0 ? (
            <p className="help-text">
              Approved and dismissed
              suggestions show up here.
            </p>
          ) : (
            <div className="record-list">
              {resolved.map(
                (draft) => (
                  <div
                    className="record-button"
                    key={draft.id}
                  >
                    <span className="record-title">
                      <span
                        className={`automation-status automation-status-${draft.status}`}
                      >
                        {draft.status}
                      </span>{" "}
                      {draft.title}
                    </span>

                    <span className="record-detail">
                      To {draft.to} ·{" "}
                      {formatDate(
                        draft.resolvedAt ??
                          draft.createdAt,
                      )}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
