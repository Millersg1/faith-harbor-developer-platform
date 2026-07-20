import {
  useEffect,
  useState,
} from "react";

interface PortalClient {
  id: string;
  companyName: string;
  primaryContact: string;
}

interface MeResponse {
  client: PortalClient;
  email?: string;
  payments?: {
    stripe: boolean;
    paypal: boolean;
  };
}

interface Project {
  id: string;
  name: string;
  status: string;
  dueDate?: string;
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  amount: number;
  currency: string;
  dueDate?: string;
}

interface Ticket {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: string;
}

async function getJson<T>(
  url: string,
): Promise<T | null> {
  try {
    const res = await fetch(url);

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function money(
  amount: number,
  currency: string,
): string {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: currency || "USD",
    },
  ).format(amount);
}

function titleCase(
  value: string,
): string {
  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

export default function PortalApp() {
  const [me, setMe] =
    useState<MeResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let cancelled = false;

    getJson<MeResponse>(
      "/api/v1/portal/me",
    ).then((data) => {
      if (!cancelled) {
        setMe(data);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="portal-shell">
        <p className="help-text">
          Loading...
        </p>
      </div>
    );
  }

  if (!me) {
    return (
      <PortalLogin
        onSignedIn={setMe}
      />
    );
  }

  return (
    <PortalDashboard
      me={me}
      onSignOut={() => setMe(null)}
    />
  );
}

function PortalLogin({
  onSignedIn,
}: {
  onSignedIn: (
    me: MeResponse,
  ) => void;
}) {
  const [email, setEmail] =
    useState("");
  const [password, setPassword] =
    useState("");
  const [error, setError] =
    useState<string | null>(null);
  const [busy, setBusy] =
    useState(false);

  async function submit(
    event: React.FormEvent,
  ): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(
        "/api/v1/portal/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        },
      );

      if (!res.ok) {
        throw new Error(
          "That email or password is incorrect.",
        );
      }

      onSignedIn(
        (await res.json()) as MeResponse,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Sign in failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-shell portal-centered">
      <form
        className="portal-card portal-login"
        onSubmit={(e) =>
          void submit(e)
        }
      >
        <p className="eyebrow">
          Faith Harbor
        </p>
        <h2>Client Portal</h2>
        <p className="help-text">
          Sign in to see your
          projects, invoices, and
          support.
        </p>

        {error && (
          <div className="status-message error">
            {error}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="portal-email">
            Email
          </label>
          <input
            id="portal-email"
            type="email"
            value={email}
            onChange={(e) =>
              setEmail(
                e.target.value,
              )
            }
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="portal-password">
            Password
          </label>
          <input
            id="portal-password"
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(
                e.target.value,
              )
            }
            required
          />
        </div>

        <button
          type="submit"
          className="primary-button"
          disabled={busy}
        >
          {busy
            ? "Signing in..."
            : "Sign In"}
        </button>
      </form>
    </div>
  );
}

function PortalDashboard({
  me,
  onSignOut,
}: {
  me: MeResponse;
  onSignOut: () => void;
}) {
  const [projects, setProjects] =
    useState<Project[]>([]);
  const [invoices, setInvoices] =
    useState<Invoice[]>([]);
  const [tickets, setTickets] =
    useState<Ticket[]>([]);
  const [paying, setPaying] =
    useState<string | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      getJson<{
        projects: Project[];
      }>("/api/v1/portal/projects"),
      getJson<{
        invoices: Invoice[];
      }>("/api/v1/portal/invoices"),
      getJson<{
        tickets: Ticket[];
      }>("/api/v1/portal/tickets"),
    ]).then(
      ([p, i, t]) => {
        setProjects(
          p?.projects ?? [],
        );
        setInvoices(
          i?.invoices ?? [],
        );
        setTickets(
          t?.tickets ?? [],
        );
      },
    );
  }, []);

  async function signOut(): Promise<void> {
    await fetch(
      "/api/v1/portal/auth/logout",
      { method: "POST" },
    );
    onSignOut();
  }

  const payments = me.payments ?? {
    stripe: false,
    paypal: false,
  };

  async function pay(
    invoice: Invoice,
    provider: "stripe" | "paypal",
  ): Promise<void> {
    setPaying(invoice.id);
    setNotice(null);

    try {
      const res = await fetch(
        `/api/v1/portal/invoices/${invoice.id}/checkout?provider=${provider}`,
        { method: "POST" },
      );

      const data =
        (await res.json()) as {
          checkoutUrl?: string;
        };

      if (
        res.ok &&
        data.checkoutUrl
      ) {
        window.location.href =
          data.checkoutUrl;
      } else {
        setNotice(
          "Online payment is not available right now.",
        );
      }
    } catch {
      setNotice(
        "Something went wrong starting the payment.",
      );
    } finally {
      setPaying(null);
    }
  }

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div>
          <p className="eyebrow">
            Faith Harbor Client
            Portal
          </p>
          <h2>
            {me.client.companyName}
          </h2>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            void signOut()
          }
        >
          Sign Out
        </button>
      </header>

      {notice && (
        <div className="status-message working">
          {notice}
        </div>
      )}

      <section className="portal-card">
        <h3>Invoices</h3>
        {invoices.length === 0 ? (
          <p className="help-text">
            No invoices.
          </p>
        ) : (
          <div className="record-list">
            {invoices.map(
              (invoice) => (
                <div
                  className="portal-row"
                  key={invoice.id}
                >
                  <span>
                    {invoice.number}{" "}
                    ·{" "}
                    {money(
                      invoice.amount,
                      invoice.currency,
                    )}{" "}
                    ·{" "}
                    {titleCase(
                      invoice.status,
                    )}
                  </span>

                  {invoice.status !==
                    "paid" &&
                    invoice.status !==
                      "void" && (
                      <span className="button-row">
                        {payments.stripe && (
                          <button
                            type="button"
                            className="primary-button"
                            disabled={
                              paying ===
                              invoice.id
                            }
                            onClick={() =>
                              void pay(
                                invoice,
                                "stripe",
                              )
                            }
                          >
                            {paying ===
                            invoice.id
                              ? "..."
                              : "Pay by Card"}
                          </button>
                        )}

                        {payments.paypal && (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={
                              paying ===
                              invoice.id
                            }
                            onClick={() =>
                              void pay(
                                invoice,
                                "paypal",
                              )
                            }
                          >
                            PayPal
                          </button>
                        )}
                      </span>
                    )}
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <section className="portal-card">
        <h3>Projects</h3>
        {projects.length === 0 ? (
          <p className="help-text">
            No projects.
          </p>
        ) : (
          <div className="record-list">
            {projects.map(
              (project) => (
                <div
                  className="portal-row"
                  key={project.id}
                >
                  <span>
                    {project.name}
                  </span>
                  <span className="portal-tag">
                    {titleCase(
                      project.status,
                    )}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <section className="portal-card">
        <h3>Support</h3>
        {tickets.length === 0 ? (
          <p className="help-text">
            No support tickets.
          </p>
        ) : (
          <div className="record-list">
            {tickets.map((ticket) => (
              <div
                className="portal-row"
                key={ticket.id}
              >
                <span>
                  {ticket.number} ·{" "}
                  {ticket.subject}
                </span>
                <span className="portal-tag">
                  {titleCase(
                    ticket.status,
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
