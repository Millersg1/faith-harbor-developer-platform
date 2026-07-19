import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";

import ConfirmDeleteButton from "../components/ConfirmDeleteButton";

type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "void";

const invoiceStatuses: readonly InvoiceStatus[] =
  [
    "draft",
    "sent",
    "paid",
    "overdue",
    "void",
  ];

interface Client {
  id: string;
  companyName: string;
  primaryContact: string;
}

interface ClientsResponse {
  count: number;
  clients: Client[];
}

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface Invoice {
  id: string;
  number: string;
  clientId: string;
  projectId?: string;
  status: InvoiceStatus;
  currency: string;
  lineItems: InvoiceLineItem[];
  amount: number;
  issueDate?: string;
  dueDate?: string;
  paidDate?: string;
  notes?: string;
  metadata: Record<
    string,
    unknown
  >;
  createdAt: string;
  updatedAt: string;
}

interface InvoicesResponse {
  count: number;
  invoices: Invoice[];
}

interface InvoiceMutationResponse {
  success: boolean;
  status: InvoiceStatus;
  invoice: Invoice;
}

interface LineItemFormRow {
  description: string;
  quantity: string;
  unitPrice: string;
}

interface InvoiceFormData {
  clientId: string;
  currency: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  notes: string;
  lineItems: LineItemFormRow[];
}

interface StatusMessage {
  message: string;
  type:
    | "working"
    | "success"
    | "error";
}

const emptyLineItem:
  LineItemFormRow = {
    description: "",
    quantity: "1",
    unitPrice: "0",
  };

const emptyForm:
  InvoiceFormData = {
    clientId: "",
    currency: "USD",
    status: "draft",
    issueDate: "",
    dueDate: "",
    notes: "",
    lineItems: [
      { ...emptyLineItem },
    ],
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
          message?: string;
        };

      throw new Error(
        errorResult.error
          ?.message ??
          errorResult.message ??
          fallbackMessage,
      );
    }

    throw new Error(fallbackMessage);
  }

  return result as T;
}

function formatCurrency(
  amount: number,
  currency: string,
): string {
  try {
    return new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency,
      },
    ).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(
  value?: string,
): string {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(
    `${value}T00:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function formatStatus(
  status: InvoiceStatus,
): string {
  return (
    status.charAt(0).toUpperCase() +
    status.slice(1)
  );
}

function rowTotal(
  row: LineItemFormRow,
): number {
  const quantity =
    Number(row.quantity);

  const unitPrice =
    Number(row.unitPrice);

  if (
    Number.isNaN(quantity) ||
    Number.isNaN(unitPrice)
  ) {
    return 0;
  }

  return quantity * unitPrice;
}

async function requestClients():
Promise<ClientsResponse> {
  const response = await fetch(
    "/api/v1/clients",
  );

  return getResponseData<ClientsResponse>(
    response,
    "Clients could not be loaded.",
  );
}

async function requestInvoices():
Promise<InvoicesResponse> {
  const response = await fetch(
    "/api/v1/invoices",
  );

  return getResponseData<InvoicesResponse>(
    response,
    "Invoices could not be loaded.",
  );
}

export default function AccountingPage() {
  const [clients, setClients] =
    useState<Client[]>([]);

  const [invoices, setInvoices] =
    useState<Invoice[]>([]);

  const [
    selectedInvoice,
    setSelectedInvoice,
  ] = useState<Invoice | null>(null);

  const [formData, setFormData] =
    useState<InvoiceFormData>(
      emptyForm,
    );

  const [status, setStatus] =
    useState<StatusMessage | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [creating, setCreating] =
    useState(false);

  const [updating, setUpdating] =
    useState(false);

  useEffect(() => {
    let requestCancelled = false;

    Promise.all([
      requestClients(),
      requestInvoices(),
    ])
      .then(
        ([
          clientsResult,
          invoicesResult,
        ]) => {
          if (requestCancelled) {
            return;
          }

          setClients(
            clientsResult.clients,
          );

          setInvoices(
            invoicesResult.invoices,
          );
        },
      )
      .catch((error: unknown) => {
        if (requestCancelled) {
          return;
        }

        setStatus({
          message:
            getErrorMessage(
              error,
              "Accounting information could not be loaded.",
            ),
          type: "error",
        });
      })
      .finally(() => {
        if (requestCancelled) {
          return;
        }

        setLoading(false);
      });

    return () => {
      requestCancelled = true;
    };
  }, []);

  const clientNames = useMemo(() => {
    const names =
      new Map<string, string>();

    for (const client of clients) {
      names.set(
        client.id,
        client.companyName,
      );
    }

    return names;
  }, [clients]);

  const draftTotal = useMemo(
    () =>
      formData.lineItems.reduce(
        (sum, row) =>
          sum + rowTotal(row),
        0,
      ),
    [formData.lineItems],
  );

  const metrics = useMemo(() => {
    let invoiced = 0;
    let outstanding = 0;
    let paid = 0;
    let drafts = 0;

    for (const invoice of invoices) {
      if (
        invoice.status !== "void"
      ) {
        invoiced += invoice.amount;
      }

      if (
        invoice.status === "paid"
      ) {
        paid += invoice.amount;
      }

      if (
        invoice.status ===
          "draft" ||
        invoice.status ===
          "sent" ||
        invoice.status ===
          "overdue"
      ) {
        outstanding +=
          invoice.amount;
      }

      if (
        invoice.status === "draft"
      ) {
        drafts += 1;
      }
    }

    return {
      invoiced,
      outstanding,
      paid,
      drafts,
    };
  }, [invoices]);

  async function reloadInvoices():
  Promise<void> {
    const result =
      await requestInvoices();

    setInvoices(result.invoices);
  }

  function updateLineItem(
    index: number,
    field: keyof LineItemFormRow,
    value: string,
  ): void {
    setFormData((current) => {
      const lineItems =
        current.lineItems.map(
          (row, rowIndex) =>
            rowIndex === index
              ? {
                  ...row,
                  [field]: value,
                }
              : row,
        );

      return {
        ...current,
        lineItems,
      };
    });
  }

  function addLineItem(): void {
    setFormData((current) => ({
      ...current,
      lineItems: [
        ...current.lineItems,
        { ...emptyLineItem },
      ],
    }));
  }

  function removeLineItem(
    index: number,
  ): void {
    setFormData((current) => {
      if (
        current.lineItems.length <= 1
      ) {
        return current;
      }

      return {
        ...current,
        lineItems:
          current.lineItems.filter(
            (_row, rowIndex) =>
              rowIndex !== index,
          ),
      };
    });
  }

  function buildLineItemsPayload():
    InvoiceLineItem[] {
    return formData.lineItems
      .filter(
        (row) =>
          row.description.trim()
            .length > 0,
      )
      .map((row) => ({
        description:
          row.description.trim(),
        quantity: Number(
          row.quantity,
        ),
        unitPrice: Number(
          row.unitPrice,
        ),
      }));
  }

  async function handleCreate(
    event: SyntheticEvent,
  ): Promise<void> {
    event.preventDefault();

    if (!formData.clientId) {
      setStatus({
        message:
          "Select a client for this invoice.",
        type: "error",
      });

      return;
    }

    const lineItems =
      buildLineItemsPayload();

    if (lineItems.length === 0) {
      setStatus({
        message:
          "Add at least one line item with a description.",
        type: "error",
      });

      return;
    }

    const invalidNumbers =
      lineItems.some(
        (item) =>
          Number.isNaN(
            item.quantity,
          ) ||
          Number.isNaN(
            item.unitPrice,
          ) ||
          item.quantity < 0 ||
          item.unitPrice < 0,
      );

    if (invalidNumbers) {
      setStatus({
        message:
          "Line item quantities and prices must be valid, non-negative numbers.",
        type: "error",
      });

      return;
    }

    setCreating(true);

    setStatus({
      message:
        "Creating invoice...",
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/invoices",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            clientId:
              formData.clientId,
            currency:
              formData.currency
                .trim() || "USD",
            status:
              formData.status,
            issueDate:
              formData.issueDate ||
              undefined,
            dueDate:
              formData.dueDate ||
              undefined,
            notes:
              formData.notes
                .trim() ||
              undefined,
            lineItems,
          }),
        },
      );

      const result =
        await getResponseData<InvoiceMutationResponse>(
          response,
          "The invoice could not be created.",
        );

      await reloadInvoices();

      setSelectedInvoice(
        result.invoice,
      );

      setFormData(emptyForm);

      setStatus({
        message: `Invoice ${result.invoice.number} created and saved.`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The invoice could not be created.",
          ),
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(
    invoice: Invoice,
    nextStatus: InvoiceStatus,
  ): Promise<void> {
    setUpdating(true);

    setStatus({
      message:
        "Updating invoice...",
      type: "working",
    });

    try {
      const paidDate =
        nextStatus === "paid" &&
        !invoice.paidDate
          ? new Date()
              .toISOString()
              .slice(0, 10)
          : invoice.paidDate;

      const response = await fetch(
        `/api/v1/invoices/${invoice.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
            paidDate,
          }),
        },
      );

      const result =
        await getResponseData<InvoiceMutationResponse>(
          response,
          "The invoice could not be updated.",
        );

      await reloadInvoices();

      setSelectedInvoice(
        result.invoice,
      );

      setStatus({
        message: `Invoice ${result.invoice.number} marked ${formatStatus(
          nextStatus,
        )}.`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The invoice could not be updated.",
          ),
        type: "error",
      });
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete(
    invoice: Invoice,
  ): Promise<void> {
    const response = await fetch(
      `/api/v1/invoices/${invoice.id}`,
      {
        method: "DELETE",
      },
    );

    if (
      !response.ok &&
      response.status !== 204
    ) {
      await getResponseData<unknown>(
        response,
        "The invoice could not be deleted.",
      );
    }

    await reloadInvoices();

    setSelectedInvoice((current) =>
      current?.id === invoice.id
        ? null
        : current,
    );

    setStatus({
      message: `Invoice ${invoice.number} deleted.`,
      type: "success",
    });
  }

  return (
    <section className="workspace active">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Accounting
          </p>

          <h3>
            Invoices and Payments
          </h3>

          <p className="help-text">
            Create client invoices,
            track outstanding balances,
            and record payments. Human
            approval remains required
            before an invoice is sent.
          </p>
        </div>
      </div>

      {status && (
        <div
          className={`status-message ${status.type}`}
        >
          {status.message}
        </div>
      )}

      <div
        className="metrics-grid"
        aria-label="Accounting summary"
      >
        <article className="metric-card">
          <span className="metric-label">
            Invoiced
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : formatCurrency(
                  metrics.invoiced,
                  "USD",
                )}
          </strong>

          <span className="metric-detail">
            Total excluding void
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Outstanding
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : formatCurrency(
                  metrics.outstanding,
                  "USD",
                )}
          </strong>

          <span className="metric-detail">
            Draft, sent, or overdue
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Paid
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : formatCurrency(
                  metrics.paid,
                  "USD",
                )}
          </strong>

          <span className="metric-detail">
            Payments received
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Drafts
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.drafts}
          </strong>

          <span className="metric-detail">
            Awaiting review
          </span>
        </article>
      </div>

      <div className="workspace-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                New Invoice
              </p>

              <h3>
                Create Invoice
              </h3>
            </div>
          </div>

          <form
            onSubmit={(event) =>
              void handleCreate(
                event,
              )
            }
          >
            <div className="form-group">
              <label htmlFor="invoice-client">
                Client
              </label>

              <select
                id="invoice-client"
                value={
                  formData.clientId
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      clientId:
                        event.target
                          .value,
                    }),
                  )
                }
                required
              >
                <option value="">
                  Select a client
                </option>

                {clients.map(
                  (client) => (
                    <option
                      key={
                        client.id
                      }
                      value={
                        client.id
                      }
                    >
                      {
                        client.companyName
                      }
                    </option>
                  ),
                )}
              </select>

              {clients.length ===
                0 &&
                !loading && (
                  <p className="help-text">
                    Add a client in
                    Client Services
                    first.
                  </p>
                )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="invoice-status">
                  Status
                </label>

                <select
                  id="invoice-status"
                  value={
                    formData.status
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        status:
                          event
                            .target
                            .value as InvoiceStatus,
                      }),
                    )
                  }
                >
                  {invoiceStatuses.map(
                    (value) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {formatStatus(
                          value,
                        )}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="invoice-currency">
                  Currency
                </label>

                <input
                  id="invoice-currency"
                  type="text"
                  value={
                    formData.currency
                  }
                  maxLength={3}
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        currency:
                          event.target.value.toUpperCase(),
                      }),
                    )
                  }
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="invoice-issue-date">
                  Issue date
                </label>

                <input
                  id="invoice-issue-date"
                  type="date"
                  value={
                    formData.issueDate
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        issueDate:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="invoice-due-date">
                  Due date
                </label>

                <input
                  id="invoice-due-date"
                  type="date"
                  value={
                    formData.dueDate
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        dueDate:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>
            </div>

            <div className="form-group">
              <label>Line items</label>

              {formData.lineItems.map(
                (row, index) => (
                  <div
                    className="line-item-row"
                    key={index}
                  >
                    <input
                      type="text"
                      placeholder="Description"
                      value={
                        row.description
                      }
                      onChange={(event) =>
                        updateLineItem(
                          index,
                          "description",
                          event.target
                            .value,
                        )
                      }
                    />

                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Qty"
                      value={
                        row.quantity
                      }
                      onChange={(event) =>
                        updateLineItem(
                          index,
                          "quantity",
                          event.target
                            .value,
                        )
                      }
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Unit price"
                      value={
                        row.unitPrice
                      }
                      onChange={(event) =>
                        updateLineItem(
                          index,
                          "unitPrice",
                          event.target
                            .value,
                        )
                      }
                    />

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        removeLineItem(
                          index,
                        )
                      }
                      disabled={
                        formData
                          .lineItems
                          .length <= 1
                      }
                      aria-label="Remove line item"
                    >
                      Remove
                    </button>
                  </div>
                ),
              )}

              <button
                type="button"
                className="secondary-button"
                onClick={addLineItem}
              >
                Add line item
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="invoice-notes">
                Notes
              </label>

              <textarea
                id="invoice-notes"
                rows={3}
                value={
                  formData.notes
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      notes:
                        event.target
                          .value,
                    }),
                  )
                }
              />
            </div>

            <div className="invoice-total">
              <span>Total</span>

              <strong>
                {formatCurrency(
                  draftTotal,
                  formData.currency ||
                    "USD",
                )}
              </strong>
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={creating}
            >
              {creating
                ? "Creating..."
                : "Create Invoice"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Ledger
              </p>

              <h3>Invoices</h3>
            </div>
          </div>

          {loading ? (
            <p className="help-text">
              Loading invoices...
            </p>
          ) : invoices.length ===
            0 ? (
            <p className="help-text">
              No invoices yet. Create
              the first one to begin
              tracking revenue.
            </p>
          ) : (
            <div className="record-list">
              {invoices.map(
                (invoice) => (
                  <button
                    type="button"
                    className="record-button"
                    key={invoice.id}
                    onClick={() =>
                      setSelectedInvoice(
                        invoice,
                      )
                    }
                  >
                    <span className="record-title">
                      {
                        invoice.number
                      }{" "}
                      —{" "}
                      {clientNames.get(
                        invoice.clientId,
                      ) ??
                        "Unknown client"}
                    </span>

                    <span className="record-detail">
                      <span
                        className={`invoice-status invoice-status-${invoice.status}`}
                      >
                        {formatStatus(
                          invoice.status,
                        )}
                      </span>{" "}
                      {formatCurrency(
                        invoice.amount,
                        invoice.currency,
                      )}{" "}
                      · Due{" "}
                      {formatDate(
                        invoice.dueDate,
                      )}
                    </span>
                  </button>
                ),
              )}
            </div>
          )}
        </section>
      </div>

      {selectedInvoice && (
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Invoice{" "}
                {
                  selectedInvoice.number
                }
              </p>

              <h3>
                {clientNames.get(
                  selectedInvoice.clientId,
                ) ??
                  "Unknown client"}
              </h3>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setSelectedInvoice(
                  null,
                )
              }
            >
              Close
            </button>
          </div>

          <div className="client-overview">
            <div className="client-overview-item">
              <span>Status</span>

              <strong>
                {formatStatus(
                  selectedInvoice.status,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Amount</span>

              <strong>
                {formatCurrency(
                  selectedInvoice.amount,
                  selectedInvoice.currency,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Issued</span>

              <strong>
                {formatDate(
                  selectedInvoice.issueDate,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Due</span>

              <strong>
                {formatDate(
                  selectedInvoice.dueDate,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Paid</span>

              <strong>
                {formatDate(
                  selectedInvoice.paidDate,
                )}
              </strong>
            </div>
          </div>

          <div className="section-divider" />

          <h4>Line items</h4>

          <div className="record-list">
            {selectedInvoice.lineItems.map(
              (item, index) => (
                <div
                  className="line-item-summary"
                  key={index}
                >
                  <span>
                    {
                      item.description
                    }
                  </span>

                  <span>
                    {item.quantity}{" "}
                    ×{" "}
                    {formatCurrency(
                      item.unitPrice,
                      selectedInvoice.currency,
                    )}{" "}
                    ={" "}
                    {formatCurrency(
                      item.quantity *
                        item.unitPrice,
                      selectedInvoice.currency,
                    )}
                  </span>
                </div>
              ),
            )}
          </div>

          {selectedInvoice.notes && (
            <p className="client-notes">
              {
                selectedInvoice.notes
              }
            </p>
          )}

          <div className="section-divider" />

          <div className="form-group">
            <label htmlFor="invoice-status-update">
              Update status
            </label>

            <select
              id="invoice-status-update"
              value={
                selectedInvoice.status
              }
              disabled={updating}
              onChange={(event) =>
                void handleStatusChange(
                  selectedInvoice,
                  event.target
                    .value as InvoiceStatus,
                )
              }
            >
              {invoiceStatuses.map(
                (value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {formatStatus(
                      value,
                    )}
                  </option>
                ),
              )}
            </select>
          </div>

          <ConfirmDeleteButton
            recordName={`invoice ${selectedInvoice.number}`}
            onDelete={() =>
              handleDelete(
                selectedInvoice,
              )
            }
          />
        </section>
      )}
    </section>
  );
}
