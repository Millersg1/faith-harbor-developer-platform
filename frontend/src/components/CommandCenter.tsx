import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";

interface Lead {
  status: string;
  estimatedValue?: number;
}

interface Invoice {
  number: string;
  status: string;
  amount?: number;
}

interface Ticket {
  number: string;
  subject: string;
  status: string;
  priority: string;
}

interface Project {
  status: string;
}

interface Campaign {
  status: string;
}

interface HostingAccount {
  domain: string;
  status: string;
}

interface CommandData {
  leads: Lead[];
  invoices: Invoice[];
  tickets: Ticket[];
  projects: Project[];
  campaigns: Campaign[];
  accounts: HostingAccount[];
}

interface AttentionItem {
  key: string;
  label: string;
  to: string;
  severity:
    | "warning"
    | "critical";
}

const openLeadStatuses = new Set([
  "new",
  "contacted",
  "qualified",
  "proposal",
]);

const openTicketStatuses = new Set([
  "open",
  "waiting",
  "in_progress",
]);

const outstandingInvoiceStatuses =
  new Set([
    "draft",
    "sent",
    "overdue",
  ]);

function formatMoney(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    },
  ).format(value);
}

async function fetchList<T>(
  url: string,
  key: string,
): Promise<T[]> {
  try {
    const response =
      await fetch(url);

    if (!response.ok) {
      return [];
    }

    const data =
      (await response.json()) as Record<
        string,
        unknown
      >;

    const list = data[key];

    return Array.isArray(list)
      ? (list as T[])
      : [];
  } catch {
    return [];
  }
}

export default function CommandCenter() {
  const [data, setData] =
    useState<CommandData | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchList<Lead>(
        "/api/v1/leads",
        "leads",
      ),
      fetchList<Invoice>(
        "/api/v1/invoices",
        "invoices",
      ),
      fetchList<Ticket>(
        "/api/v1/tickets",
        "tickets",
      ),
      fetchList<Project>(
        "/api/v1/projects",
        "projects",
      ),
      fetchList<Campaign>(
        "/api/v1/campaigns",
        "campaigns",
      ),
      fetchList<HostingAccount>(
        "/api/v1/hosting/accounts",
        "accounts",
      ),
    ])
      .then(
        ([
          leads,
          invoices,
          tickets,
          projects,
          campaigns,
          accounts,
        ]) => {
          if (cancelled) {
            return;
          }

          setData({
            leads,
            invoices,
            tickets,
            projects,
            campaigns,
            accounts,
          });
        },
      )
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    if (!data) {
      return null;
    }

    const pipelineValue =
      data.leads
        .filter((lead) =>
          openLeadStatuses.has(
            lead.status,
          ),
        )
        .reduce(
          (sum, lead) =>
            sum +
            (lead.estimatedValue ??
              0),
          0,
        );

    const outstanding =
      data.invoices
        .filter((invoice) =>
          outstandingInvoiceStatuses.has(
            invoice.status,
          ),
        )
        .reduce(
          (sum, invoice) =>
            sum +
            (invoice.amount ?? 0),
          0,
        );

    const openTickets =
      data.tickets.filter(
        (ticket) =>
          openTicketStatuses.has(
            ticket.status,
          ),
      ).length;

    const activeProjects =
      data.projects.filter(
        (project) =>
          project.status ===
          "active",
      ).length;

    const activeCampaigns =
      data.campaigns.filter(
        (campaign) =>
          campaign.status ===
          "active",
      ).length;

    return {
      pipelineValue,
      outstanding,
      openTickets,
      activeProjects,
      activeCampaigns,
    };
  }, [data]);

  const attention =
    useMemo<AttentionItem[]>(() => {
      if (!data) {
        return [];
      }

      const items: AttentionItem[] =
        [];

      for (const invoice of data.invoices) {
        if (
          invoice.status ===
          "overdue"
        ) {
          items.push({
            key: `invoice-${invoice.number}`,
            label: `Invoice ${invoice.number} is overdue`,
            to: "/accounting",
            severity: "critical",
          });
        }
      }

      for (const ticket of data.tickets) {
        if (
          ticket.priority ===
            "urgent" &&
          openTicketStatuses.has(
            ticket.status,
          )
        ) {
          items.push({
            key: `ticket-${ticket.number}`,
            label: `Urgent ticket ${ticket.number}: ${ticket.subject}`,
            to: "/support",
            severity: "critical",
          });
        }
      }

      for (const account of data.accounts) {
        if (
          account.status ===
          "suspended"
        ) {
          items.push({
            key: `hosting-${account.domain}`,
            label: `${account.domain} is suspended`,
            to: "/hosting",
            severity: "warning",
          });
        }
      }

      return items;
    }, [data]);

  return (
    <section
      className="command-center"
      aria-label="Business command center"
    >
      <div className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">
            Pipeline
          </span>

          <strong className="metric-value metric-word">
            {loading || !metrics
              ? "..."
              : formatMoney(
                  metrics.pipelineValue,
                )}
          </strong>

          <span className="metric-detail">
            Open opportunity value
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Outstanding
          </span>

          <strong className="metric-value metric-word">
            {loading || !metrics
              ? "..."
              : formatMoney(
                  metrics.outstanding,
                )}
          </strong>

          <span className="metric-detail">
            Unpaid invoices
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Open Tickets
          </span>

          <strong className="metric-value">
            {loading || !metrics
              ? "..."
              : metrics.openTickets}
          </strong>

          <span className="metric-detail">
            Support needing attention
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Active Projects
          </span>

          <strong className="metric-value">
            {loading || !metrics
              ? "..."
              : metrics.activeProjects}
          </strong>

          <span className="metric-detail">
            {loading || !metrics
              ? ""
              : `${metrics.activeCampaigns} live campaigns`}
          </span>
        </article>
      </div>

      <div className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Command Center
            </p>

            <h3>
              Needs Attention
            </h3>
          </div>
        </div>

        {loading ? (
          <p className="help-text">
            Checking every
            department...
          </p>
        ) : attention.length === 0 ? (
          <p className="help-text">
            Nothing urgent across the
            business right now.
          </p>
        ) : (
          <div className="record-list">
            {attention.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className="record-button"
              >
                <span className="record-title">
                  <span
                    className={`attention-dot attention-dot-${item.severity}`}
                    aria-hidden="true"
                  />{" "}
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
