import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";

import ConfirmDeleteButton from "../components/ConfirmDeleteButton";

type HostingAccountStatus =
  | "pending"
  | "active"
  | "suspended"
  | "cancelled";

const hostingStatuses: readonly HostingAccountStatus[] =
  [
    "pending",
    "active",
    "suspended",
    "cancelled",
  ];

const REFRESH_INTERVAL_MS = 30000;

interface Client {
  id: string;
  companyName: string;
}

interface ClientsResponse {
  count: number;
  clients: Client[];
}

interface HostingAccount {
  id: string;
  clientId?: string;
  brand?: string;
  domain: string;
  username: string;
  plan?: string;
  status: HostingAccountStatus;
  server?: string;
  ipAddress?: string;
  diskUsedMb?: number;
  diskLimitMb?: number;
  notes?: string;
  metadata: Record<
    string,
    unknown
  >;
  createdAt: string;
  updatedAt: string;
}

interface HostingAccountsResponse {
  count: number;
  accounts: HostingAccount[];
}

interface HostingAccountMutationResponse {
  success: boolean;
  status: HostingAccountStatus;
  account: HostingAccount;
}

interface WHMConfiguredResponse {
  configured: boolean;
}

interface WHMServerStatus {
  loadOne: number;
  loadFive: number;
  loadFifteen: number;
}

interface WHMStatusResponse {
  serverStatus: WHMServerStatus;
}

interface HostingFormData {
  clientId: string;
  brand: string;
  domain: string;
  username: string;
  plan: string;
  status: HostingAccountStatus;
  server: string;
  ipAddress: string;
}

type DiagnosticSeverity =
  | "info"
  | "warning"
  | "critical";

interface DiagnosticFinding {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
}

interface HostingAssessment {
  findings: DiagnosticFinding[];
  summary: string;
  recommendation: string;
  aiGenerated: boolean;
}

interface AssessmentResponse {
  assessment: HostingAssessment;
}

interface StatusMessage {
  message: string;
  type:
    | "working"
    | "success"
    | "error";
}

const emptyForm:
  HostingFormData = {
    clientId: "",
    brand: "",
    domain: "",
    username: "",
    plan: "",
    status: "pending",
    server: "",
    ipAddress: "",
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
        errorResult.error
          ?.message ??
          fallbackMessage,
      );
    }

    throw new Error(fallbackMessage);
  }

  return result as T;
}

function formatLabel(
  value: string,
): string {
  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

function formatTime(
  value: Date | null,
): string {
  if (!value) {
    return "never";
  }

  return value.toLocaleTimeString();
}

function diskPercent(
  account: HostingAccount,
): number | null {
  if (
    account.diskLimitMb &&
    account.diskUsedMb !== undefined &&
    account.diskLimitMb > 0
  ) {
    return Math.round(
      (account.diskUsedMb /
        account.diskLimitMb) *
        100,
    );
  }

  return null;
}

export default function HostingPage() {
  const [clients, setClients] =
    useState<Client[]>([]);

  const [accounts, setAccounts] =
    useState<HostingAccount[]>([]);

  const [
    whmConfigured,
    setWhmConfigured,
  ] = useState(false);

  const [
    serverStatus,
    setServerStatus,
  ] = useState<WHMServerStatus | null>(
    null,
  );

  const [
    selectedAccount,
    setSelectedAccount,
  ] = useState<HostingAccount | null>(
    null,
  );

  const [formData, setFormData] =
    useState<HostingFormData>(
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

  const [
    lastUpdated,
    setLastUpdated,
  ] = useState<Date | null>(null);

  const [brandFilter, setBrandFilter] =
    useState("");

  const [
    assessment,
    setAssessment,
  ] = useState<HostingAssessment | null>(
    null,
  );

  const [diagnosing, setDiagnosing] =
    useState(false);

  // ---- Provisioning (create a real cPanel account) ----
  interface HostingPlanOption {
    id: string;
    name: string;
    slug: string;
    kind: string;
    priceMonthlyCents: number;
    active: boolean;
  }

  interface BrandOption {
    id: string;
    name: string;
  }

  const [plans, setPlans] = useState<
    HostingPlanOption[]
  >([]);
  const [provBrands, setProvBrands] =
    useState<BrandOption[]>([]);
  const [
    provAvailable,
    setProvAvailable,
  ] = useState(false);
  const [provForm, setProvForm] =
    useState({
      planId: "",
      domain: "",
      contactEmail: "",
      clientId: "",
      brandId: "",
    });
  const [provisioning, setProvisioning] =
    useState(false);
  const [provMsg, setProvMsg] =
    useState<StatusMessage | null>(null);
  const [provResult, setProvResult] =
    useState<{
      username: string;
      domain: string;
    } | null>(null);

  useEffect(() => {
    fetch("/api/v1/hosting/plans")
      .then((r) =>
        r.ok ? r.json() : null,
      )
      .then(
        (
          d: {
            plans?: HostingPlanOption[];
          } | null,
        ) => setPlans(d?.plans ?? []),
      )
      .catch(() => {});

    fetch(
      "/api/v1/hosting/provision/status",
    )
      .then((r) =>
        r.ok ? r.json() : null,
      )
      .then(
        (
          d: {
            available?: boolean;
          } | null,
        ) =>
          setProvAvailable(
            Boolean(d?.available),
          ),
      )
      .catch(() => {});

    fetch("/api/v1/brands")
      .then((r) =>
        r.ok ? r.json() : null,
      )
      .then(
        (
          d: {
            brands?: BrandOption[];
          } | null,
        ) =>
          setProvBrands(
            d?.brands ?? [],
          ),
      )
      .catch(() => {});
  }, []);

  async function handleProvision(): Promise<void> {
    setProvMsg(null);
    setProvResult(null);

    if (
      !provForm.planId ||
      !provForm.domain.trim() ||
      !provForm.contactEmail.trim()
    ) {
      setProvMsg({
        message:
          "Plan, domain, and customer email are required.",
        type: "error",
      });

      return;
    }

    setProvisioning(true);

    try {
      const res = await fetch(
        "/api/v1/hosting/provision",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            planId: provForm.planId,
            domain:
              provForm.domain.trim(),
            contactEmail:
              provForm.contactEmail.trim(),
            clientId:
              provForm.clientId ||
              undefined,
            brandId:
              provForm.brandId ||
              undefined,
          }),
        },
      );

      const data =
        (await res.json()) as {
          account?: {
            username: string;
            domain: string;
          };
          error?: {
            message?: string;
          };
        };

      if (!res.ok || !data.account) {
        throw new Error(
          data.error?.message ??
            "Provisioning failed.",
        );
      }

      setProvResult({
        username:
          data.account.username,
        domain: data.account.domain,
      });
      setProvMsg({
        message:
          "Hosting provisioned. The customer has been emailed their login.",
        type: "success",
      });
      setProvForm({
        planId: "",
        domain: "",
        contactEmail: "",
        clientId: "",
        brandId: "",
      });
      void refresh();
    } catch (error) {
      setProvMsg({
        message:
          error instanceof Error
            ? error.message
            : "Provisioning failed.",
        type: "error",
      });
    } finally {
      setProvisioning(false);
    }
  }

  const refresh = useCallback(
    async (): Promise<void> => {
      const accountsResponse =
        await fetch(
          "/api/v1/hosting/accounts",
        );

      const accountsResult =
        await getResponseData<HostingAccountsResponse>(
          accountsResponse,
          "Hosting accounts could not be loaded.",
        );

      setAccounts(
        accountsResult.accounts,
      );

      // Live WHM data is best-effort; failures never break the page.
      try {
        const whmResponse =
          await fetch(
            "/api/v1/hosting/whm",
          );

        const whm =
          await getResponseData<WHMConfiguredResponse>(
            whmResponse,
            "WHM status unavailable.",
          );

        setWhmConfigured(
          whm.configured,
        );

        if (whm.configured) {
          const statusResponse =
            await fetch(
              "/api/v1/hosting/whm/status",
            );

          const statusResult =
            await getResponseData<WHMStatusResponse>(
              statusResponse,
              "WHM status unavailable.",
            );

          setServerStatus(
            statusResult.serverStatus,
          );
        } else {
          setServerStatus(null);
        }
      } catch {
        setServerStatus(null);
      }

      setLastUpdated(new Date());
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    fetch("/api/v1/clients")
      .then((response) =>
        getResponseData<ClientsResponse>(
          response,
          "Clients could not be loaded.",
        ),
      )
      .then((result) => {
        if (!cancelled) {
          setClients(
            result.clients,
          );
        }
      })
      .catch(() => {
        // Non-fatal; the form simply
        // offers no client links.
      });

    refresh()
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus({
            message:
              getErrorMessage(
                error,
                "Hosting information could not be loaded.",
              ),
            type: "error",
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Clear a stale diagnosis when a different account is opened.
  useEffect(() => {
    setAssessment(null);
  }, [selectedAccount?.id]);

  // Auto-refresh so the page can be left open as a wall display.
  useEffect(() => {
    const timer = setInterval(() => {
      refresh().catch(() => {
        // Transient refresh errors are ignored;
        // the next tick tries again.
      });
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [refresh]);

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

  const brands = useMemo(() => {
    const set = new Set<string>();

    for (const account of accounts) {
      if (account.brand) {
        set.add(account.brand);
      }
    }

    return Array.from(set).sort();
  }, [accounts]);

  const visibleAccounts = useMemo(
    () =>
      brandFilter
        ? accounts.filter(
            (account) =>
              account.brand ===
              brandFilter,
          )
        : accounts,
    [accounts, brandFilter],
  );

  const attention = useMemo(
    () =>
      accounts.filter((account) => {
        if (
          account.status ===
          "suspended"
        ) {
          return true;
        }

        const percent =
          diskPercent(account);

        return (
          percent !== null &&
          percent >= 90
        );
      }),
    [accounts],
  );

  const activeCount = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.status ===
          "active",
      ).length,
    [accounts],
  );

  async function handleCreate(
    event: SyntheticEvent,
  ): Promise<void> {
    event.preventDefault();

    if (
      !formData.domain.trim() ||
      !formData.username.trim()
    ) {
      setStatus({
        message:
          "Domain and username are required.",
        type: "error",
      });

      return;
    }

    setCreating(true);

    setStatus({
      message:
        "Recording hosting account...",
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/hosting/accounts",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            clientId:
              formData.clientId ||
              undefined,
            brand:
              formData.brand
                .trim() ||
              undefined,
            domain:
              formData.domain
                .trim(),
            username:
              formData.username
                .trim(),
            plan:
              formData.plan
                .trim() ||
              undefined,
            status:
              formData.status,
            server:
              formData.server
                .trim() ||
              undefined,
            ipAddress:
              formData.ipAddress
                .trim() ||
              undefined,
          }),
        },
      );

      const result =
        await getResponseData<HostingAccountMutationResponse>(
          response,
          "The account could not be recorded.",
        );

      await refresh();

      setSelectedAccount(
        result.account,
      );

      setFormData(emptyForm);

      setStatus({
        message: `Recorded ${result.account.domain}.`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The account could not be recorded.",
          ),
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(
    account: HostingAccount,
    nextStatus: HostingAccountStatus,
  ): Promise<void> {
    setStatus({
      message:
        "Updating account...",
      type: "working",
    });

    try {
      const response = await fetch(
        `/api/v1/hosting/accounts/${account.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
          }),
        },
      );

      const result =
        await getResponseData<HostingAccountMutationResponse>(
          response,
          "The account could not be updated.",
        );

      await refresh();

      setSelectedAccount(
        result.account,
      );

      setStatus({
        message: `${result.account.domain} marked ${formatLabel(
          nextStatus,
        )}.`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The account could not be updated.",
          ),
        type: "error",
      });
    }
  }

  async function handleDelete(
    account: HostingAccount,
  ): Promise<void> {
    const response = await fetch(
      `/api/v1/hosting/accounts/${account.id}`,
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
        "The account could not be deleted.",
      );
    }

    await refresh();

    setSelectedAccount((current) =>
      current?.id === account.id
        ? null
        : current,
    );

    setStatus({
      message: `Removed the record for ${account.domain}.`,
      type: "success",
    });
  }

  async function runDiagnostics(
    account: HostingAccount,
  ): Promise<void> {
    setDiagnosing(true);

    setAssessment(null);

    setStatus({
      message: `Diagnosing ${account.domain}...`,
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/hosting/assist",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            accountId: account.id,
          }),
        },
      );

      const result =
        await getResponseData<AssessmentResponse>(
          response,
          "The diagnosis could not be completed.",
        );

      setAssessment(
        result.assessment,
      );

      setStatus({
        message: `Diagnosis complete for ${account.domain}.`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The diagnosis could not be completed.",
          ),
        type: "error",
      });
    } finally {
      setDiagnosing(false);
    }
  }

  return (
    <section className="workspace active">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Hosting
          </p>

          <h3>
            Hosting Operations
          </h3>

          <p className="help-text">
            Provision hosting and monitor
            accounts and server health.
            This view refreshes
            automatically. Provisioning
            creates real cPanel accounts;
            status changes and deletes on
            the list below are local
            records only.
          </p>
        </div>

        <span className="hosting-updated">
          Updated{" "}
          {formatTime(lastUpdated)}
        </span>
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
        aria-label="Hosting summary"
      >
        <article className="metric-card">
          <span className="metric-label">
            Accounts
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : accounts.length}
          </strong>

          <span className="metric-detail">
            Tracked hosting accounts
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Active
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : activeCount}
          </strong>

          <span className="metric-detail">
            Live and serving
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Needs Attention
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : attention.length}
          </strong>

          <span className="metric-detail">
            Suspended or near quota
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Server Load
          </span>

          <strong className="metric-value metric-word">
            {serverStatus
              ? serverStatus.loadOne.toFixed(
                  2,
                )
              : whmConfigured
                ? "..."
                : "Offline"}
          </strong>

          <span className="metric-detail">
            {serverStatus
              ? `${serverStatus.loadFive.toFixed(
                  2,
                )} / ${serverStatus.loadFifteen.toFixed(
                  2,
                )} (5m / 15m)`
              : "WHM read-only link"}
          </span>
        </article>
      </div>

      <div className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Hosting
            </p>

            <h3>
              Provision New Hosting
            </h3>
          </div>
        </div>

        {!provAvailable ? (
          <p className="help-text">
            Provisioning is unavailable
            &mdash; WHM is not connected
            with account-creation access.
          </p>
        ) : (
          <>
            <p className="help-text">
              Create a live cPanel account
              on a plan. The customer is
              emailed their login
              automatically.
            </p>

            {provMsg && (
              <div
                className={`status-message ${provMsg.type}`}
              >
                {provMsg.message}
              </div>
            )}

            {provResult && (
              <div className="status-message success">
                Account{" "}
                <code>
                  {provResult.username}
                </code>{" "}
                created for{" "}
                {provResult.domain}.
              </div>
            )}

            <div className="form-group">
              <label htmlFor="prov-plan">
                Plan
              </label>
              <select
                id="prov-plan"
                value={provForm.planId}
                onChange={(e) =>
                  setProvForm({
                    ...provForm,
                    planId:
                      e.target.value,
                  })
                }
              >
                <option value="">
                  Select a plan
                </option>
                {plans
                  .filter(
                    (p) => p.active,
                  )
                  .map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                    >
                      {p.name} &mdash; $
                      {(
                        p.priceMonthlyCents /
                        100
                      ).toFixed(2)}
                      /mo
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="prov-domain">
                Domain
              </label>
              <input
                id="prov-domain"
                type="text"
                placeholder="customersite.com"
                value={provForm.domain}
                onChange={(e) =>
                  setProvForm({
                    ...provForm,
                    domain:
                      e.target.value,
                  })
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="prov-email">
                Customer email
              </label>
              <input
                id="prov-email"
                type="email"
                placeholder="owner@customersite.com"
                value={
                  provForm.contactEmail
                }
                onChange={(e) =>
                  setProvForm({
                    ...provForm,
                    contactEmail:
                      e.target.value,
                  })
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="prov-brand">
                Brand (optional)
              </label>
              <select
                id="prov-brand"
                value={provForm.brandId}
                onChange={(e) =>
                  setProvForm({
                    ...provForm,
                    brandId:
                      e.target.value,
                  })
                }
              >
                <option value="">
                  No specific brand
                </option>
                {provBrands.map((b) => (
                  <option
                    key={b.id}
                    value={b.id}
                  >
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="prov-client">
                Link to client (optional)
              </label>
              <select
                id="prov-client"
                value={
                  provForm.clientId
                }
                onChange={(e) =>
                  setProvForm({
                    ...provForm,
                    clientId:
                      e.target.value,
                  })
                }
              >
                <option value="">
                  Not linked
                </option>
                {clients.map((c) => (
                  <option
                    key={c.id}
                    value={c.id}
                  >
                    {c.companyName}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="primary-button"
              disabled={provisioning}
              onClick={() =>
                void handleProvision()
              }
            >
              {provisioning
                ? "Provisioning..."
                : "Provision Hosting"}
            </button>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Attention Board
            </p>

            <h3>
              Work That Needs Doing
            </h3>
          </div>
        </div>

        {loading ? (
          <p className="help-text">
            Loading...
          </p>
        ) : attention.length ===
          0 ? (
          <p className="help-text">
            All tracked accounts are
            healthy. Nothing needs
            attention right now.
          </p>
        ) : (
          <div className="record-list">
            {attention.map(
              (account) => {
                const percent =
                  diskPercent(
                    account,
                  );

                return (
                  <button
                    type="button"
                    className="record-button"
                    key={account.id}
                    onClick={() =>
                      setSelectedAccount(
                        account,
                      )
                    }
                  >
                    <span className="record-title">
                      {
                        account.domain
                      }
                    </span>

                    <span className="record-detail">
                      <span
                        className={`hosting-status hosting-status-${account.status}`}
                      >
                        {formatLabel(
                          account.status,
                        )}
                      </span>{" "}
                      {percent !==
                        null &&
                        `· disk ${percent}%`}
                    </span>
                  </button>
                );
              },
            )}
          </div>
        )}

        {!whmConfigured &&
          !loading && (
            <p className="help-text">
              Live WHM monitoring is
              not connected. Set
              WHM_HOST and
              WHM_API_TOKEN on the
              server to see live server
              load and account status.
            </p>
          )}
      </div>

      <div className="workspace-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                New Record
              </p>

              <h3>
                Add Hosting Account
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
              <label htmlFor="hosting-client">
                Client (optional)
              </label>

              <select
                id="hosting-client"
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
              >
                <option value="">
                  Unlinked
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
            </div>

            <div className="form-group">
              <label htmlFor="hosting-brand">
                Brand
              </label>

              <input
                id="hosting-brand"
                type="text"
                list="hosting-brand-options"
                placeholder="All Elite Hosting / Faith Harbor Web Hosting"
                value={
                  formData.brand
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      brand:
                        event.target
                          .value,
                    }),
                  )
                }
              />

              <datalist id="hosting-brand-options">
                {brands.map(
                  (brand) => (
                    <option
                      key={brand}
                      value={brand}
                    />
                  ),
                )}
              </datalist>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="hosting-domain">
                  Domain
                </label>

                <input
                  id="hosting-domain"
                  type="text"
                  value={
                    formData.domain
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        domain:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="hosting-username">
                  Username
                </label>

                <input
                  id="hosting-username"
                  type="text"
                  value={
                    formData.username
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        username:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="hosting-plan">
                  Plan
                </label>

                <input
                  id="hosting-plan"
                  type="text"
                  value={
                    formData.plan
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        plan:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="hosting-status">
                  Status
                </label>

                <select
                  id="hosting-status"
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
                            .value as HostingAccountStatus,
                      }),
                    )
                  }
                >
                  {hostingStatuses.map(
                    (value) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {formatLabel(
                          value,
                        )}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="hosting-server">
                  Server
                </label>

                <input
                  id="hosting-server"
                  type="text"
                  value={
                    formData.server
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        server:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="hosting-ip">
                  IP address
                </label>

                <input
                  id="hosting-ip"
                  type="text"
                  value={
                    formData.ipAddress
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        ipAddress:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={creating}
            >
              {creating
                ? "Saving..."
                : "Add Account"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Inventory
              </p>

              <h3>
                Hosting Accounts
              </h3>
            </div>

            {brands.length > 0 && (
              <select
                aria-label="Filter by brand"
                value={brandFilter}
                onChange={(event) =>
                  setBrandFilter(
                    event.target
                      .value,
                  )
                }
              >
                <option value="">
                  All brands
                </option>

                {brands.map(
                  (brand) => (
                    <option
                      key={brand}
                      value={brand}
                    >
                      {brand}
                    </option>
                  ),
                )}
              </select>
            )}
          </div>

          {loading ? (
            <p className="help-text">
              Loading accounts...
            </p>
          ) : visibleAccounts.length ===
            0 ? (
            <p className="help-text">
              No hosting accounts
              {brandFilter
                ? " for this brand."
                : " recorded yet."}
            </p>
          ) : (
            <div className="record-list">
              {visibleAccounts.map(
                (account) => (
                  <button
                    type="button"
                    className="record-button"
                    key={account.id}
                    onClick={() =>
                      setSelectedAccount(
                        account,
                      )
                    }
                  >
                    <span className="record-title">
                      {
                        account.domain
                      }
                    </span>

                    <span className="record-detail">
                      <span
                        className={`hosting-status hosting-status-${account.status}`}
                      >
                        {formatLabel(
                          account.status,
                        )}
                      </span>{" "}
                      {account.clientId
                        ? `· ${
                            clientNames.get(
                              account.clientId,
                            ) ??
                            "Client"
                          }`
                        : "· Unlinked"}
                    </span>
                  </button>
                ),
              )}
            </div>
          )}
        </section>
      </div>

      {selectedAccount && (
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Hosting Account
              </p>

              <h3>
                {
                  selectedAccount.domain
                }
              </h3>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setSelectedAccount(
                  null,
                )
              }
            >
              Close
            </button>
          </div>

          <div className="client-overview">
            <div className="client-overview-item">
              <span>Username</span>

              <strong>
                {
                  selectedAccount.username
                }
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Status</span>

              <strong>
                {formatLabel(
                  selectedAccount.status,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Brand</span>

              <strong>
                {selectedAccount.brand ||
                  "Unbranded"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Plan</span>

              <strong>
                {selectedAccount.plan ||
                  "Not set"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Server</span>

              <strong>
                {selectedAccount.server ||
                  "Not set"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>IP</span>

              <strong>
                {selectedAccount.ipAddress ||
                  "Not set"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Disk</span>

              <strong>
                {diskPercent(
                  selectedAccount,
                ) !== null
                  ? `${diskPercent(
                      selectedAccount,
                    )}%`
                  : "Unknown"}
              </strong>
            </div>
          </div>

          {selectedAccount.notes && (
            <p className="client-notes">
              {
                selectedAccount.notes
              }
            </p>
          )}

          <div className="section-divider" />

          <div className="form-group">
            <label htmlFor="hosting-status-update">
              Update status
            </label>

            <select
              id="hosting-status-update"
              value={
                selectedAccount.status
              }
              onChange={(event) =>
                void handleStatusChange(
                  selectedAccount,
                  event.target
                    .value as HostingAccountStatus,
                )
              }
            >
              {hostingStatuses.map(
                (value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {formatLabel(
                      value,
                    )}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="section-divider" />

          <div className="card-heading">
            <div>
              <p className="eyebrow">
                AI Hosting Assistant
              </p>

              <h4>
                Diagnose Server Issue
              </h4>
            </div>

            <button
              type="button"
              className="secondary-button"
              disabled={diagnosing}
              onClick={() =>
                void runDiagnostics(
                  selectedAccount,
                )
              }
            >
              {diagnosing
                ? "Diagnosing..."
                : "Run Diagnostics"}
            </button>
          </div>

          {assessment && (
            <div className="assessment">
              <p className="help-text">
                {assessment.summary}
              </p>

              {assessment.findings
                .length > 0 && (
                <div className="record-list">
                  {assessment.findings.map(
                    (
                      finding,
                      index,
                    ) => (
                      <div
                        className="finding"
                        key={index}
                      >
                        <span
                          className={`finding-severity finding-severity-${finding.severity}`}
                        >
                          {finding.severity}
                        </span>{" "}
                        {finding.message}
                      </div>
                    ),
                  )}
                </div>
              )}

              <div className="assessment-recommendation">
                <p className="eyebrow">
                  {assessment.aiGenerated
                    ? "AI recommendation — human approval required"
                    : "Recommendation — human approval required"}
                </p>

                <pre>
                  {
                    assessment.recommendation
                  }
                </pre>
              </div>
            </div>
          )}

          <div className="section-divider" />

          <ConfirmDeleteButton
            recordName={`the record for ${selectedAccount.domain}`}
            onDelete={() =>
              handleDelete(
                selectedAccount,
              )
            }
          />
        </section>
      )}
    </section>
  );
}
