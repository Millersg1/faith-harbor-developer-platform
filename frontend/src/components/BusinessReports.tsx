import {
  useEffect,
  useMemo,
  useState,
} from "react";

interface Lead {
  status: string;
  estimatedValue?: number;
}

interface Invoice {
  status: string;
  amount?: number;
}

interface Ticket {
  status: string;
}

interface Project {
  status: string;
}

interface Campaign {
  status: string;
  budget?: number;
}

interface HostingAccount {
  status: string;
}

interface Book {
  status: string;
  royalties?: number;
}

interface Program {
  status: string;
  participants?: number;
}

interface Product {
  status: string;
}

interface ReportData {
  clients: unknown[];
  leads: Lead[];
  invoices: Invoice[];
  tickets: Ticket[];
  projects: Project[];
  campaigns: Campaign[];
  accounts: HostingAccount[];
  books: Book[];
  programs: Program[];
  products: Product[];
}

const openLeadStatuses = new Set([
  "new",
  "contacted",
  "qualified",
  "proposal",
]);

const outstandingInvoiceStatuses =
  new Set([
    "draft",
    "sent",
    "overdue",
  ]);

const openTicketStatuses = new Set([
  "open",
  "waiting",
  "in_progress",
]);

function money(value: number): string {
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

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <span className="metric-label">
        {label}
      </span>

      <strong className="metric-value metric-word">
        {value}
      </strong>

      <span className="metric-detail">
        {detail}
      </span>
    </article>
  );
}

export default function BusinessReports() {
  const [data, setData] =
    useState<ReportData | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchList("/api/v1/clients", "clients"),
      fetchList<Lead>("/api/v1/leads", "leads"),
      fetchList<Invoice>("/api/v1/invoices", "invoices"),
      fetchList<Ticket>("/api/v1/tickets", "tickets"),
      fetchList<Project>("/api/v1/projects", "projects"),
      fetchList<Campaign>("/api/v1/campaigns", "campaigns"),
      fetchList<HostingAccount>("/api/v1/hosting/accounts", "accounts"),
      fetchList<Book>("/api/v1/books", "books"),
      fetchList<Program>("/api/v1/programs", "programs"),
      fetchList<Product>("/api/v1/products", "products"),
    ])
      .then(
        ([
          clients,
          leads,
          invoices,
          tickets,
          projects,
          campaigns,
          accounts,
          books,
          programs,
          products,
        ]) => {
          if (cancelled) {
            return;
          }

          setData({
            clients,
            leads,
            invoices,
            tickets,
            projects,
            campaigns,
            accounts,
            books,
            programs,
            products,
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

  const stats = useMemo(() => {
    if (!data) {
      return null;
    }

    const invoiced = data.invoices
      .filter(
        (invoice) =>
          invoice.status !== "void",
      )
      .reduce(
        (sum, invoice) =>
          sum +
          (invoice.amount ?? 0),
        0,
      );

    const paid = data.invoices
      .filter(
        (invoice) =>
          invoice.status === "paid",
      )
      .reduce(
        (sum, invoice) =>
          sum +
          (invoice.amount ?? 0),
        0,
      );

    const outstanding = data.invoices
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

    const openLeads =
      data.leads.filter((lead) =>
        openLeadStatuses.has(
          lead.status,
        ),
      );

    const pipelineValue =
      openLeads.reduce(
        (sum, lead) =>
          sum +
          (lead.estimatedValue ?? 0),
        0,
      );

    const wonDeals =
      data.leads.filter(
        (lead) =>
          lead.status === "won",
      );

    const wonValue = wonDeals.reduce(
      (sum, lead) =>
        sum +
        (lead.estimatedValue ?? 0),
      0,
    );

    const royalties =
      data.books.reduce(
        (sum, book) =>
          sum +
          (book.royalties ?? 0),
        0,
      );

    const participants =
      data.programs.reduce(
        (sum, program) =>
          sum +
          (program.participants ??
            0),
        0,
      );

    const count = (
      list: { status: string }[],
      status: string,
    ) =>
      list.filter(
        (item) =>
          item.status === status,
      ).length;

    return {
      clients: data.clients.length,
      invoiced,
      paid,
      outstanding,
      pipelineValue,
      openLeads: openLeads.length,
      wonDeals: wonDeals.length,
      wonValue,
      royalties,
      participants,

      activeProjects: count(
        data.projects,
        "active",
      ),
      completedProjects: count(
        data.projects,
        "completed",
      ),
      openTickets:
        data.tickets.filter(
          (ticket) =>
            openTicketStatuses.has(
              ticket.status,
            ),
        ).length,
      activeCampaigns: count(
        data.campaigns,
        "active",
      ),
      hostingAccounts:
        data.accounts.length,
      suspendedHosting: count(
        data.accounts,
        "suspended",
      ),
      publishedBooks: count(
        data.books,
        "published",
      ),
      activePrograms: count(
        data.programs,
        "active",
      ),
      activeProducts: count(
        data.products,
        "active",
      ),
    };
  }, [data]);

  const placeholder =
    loading || !stats;

  return (
    <>
      <div
        className="metrics-grid"
        aria-label="Financial summary"
      >
        <MetricCard
          label="Invoiced"
          value={
            placeholder
              ? "..."
              : money(
                  stats.invoiced,
                )
          }
          detail="Total billed (excl. void)"
        />

        <MetricCard
          label="Paid"
          value={
            placeholder
              ? "..."
              : money(stats.paid)
          }
          detail="Payments received"
        />

        <MetricCard
          label="Outstanding"
          value={
            placeholder
              ? "..."
              : money(
                  stats.outstanding,
                )
          }
          detail="Unpaid invoices"
        />

        <MetricCard
          label="Pipeline"
          value={
            placeholder
              ? "..."
              : money(
                  stats.pipelineValue,
                )
          }
          detail={
            placeholder
              ? ""
              : `${stats.openLeads} open opportunities`
          }
        />
      </div>

      <div className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Business Intelligence
            </p>

            <h3>
              Across Every Department
            </h3>
          </div>
        </div>

        {placeholder ? (
          <p className="help-text">
            Gathering data from every
            department...
          </p>
        ) : (
          <div className="report-grid">
            <ReportStat
              label="Clients"
              value={stats.clients}
            />

            <ReportStat
              label="Won Deals"
              value={stats.wonDeals}
              detail={money(
                stats.wonValue,
              )}
            />

            <ReportStat
              label="Active Projects"
              value={
                stats.activeProjects
              }
              detail={`${stats.completedProjects} completed`}
            />

            <ReportStat
              label="Open Tickets"
              value={
                stats.openTickets
              }
            />

            <ReportStat
              label="Hosting Accounts"
              value={
                stats.hostingAccounts
              }
              detail={`${stats.suspendedHosting} suspended`}
            />

            <ReportStat
              label="Active Campaigns"
              value={
                stats.activeCampaigns
              }
            />

            <ReportStat
              label="Published Books"
              value={
                stats.publishedBooks
              }
              detail={`${money(
                stats.royalties,
              )} royalties`}
            />

            <ReportStat
              label="Ministry Programs"
              value={
                stats.activePrograms
              }
              detail={`${stats.participants} people served`}
            />

            <ReportStat
              label="Software Products"
              value={
                stats.activeProducts
              }
            />
          </div>
        )}
      </div>
    </>
  );
}

function ReportStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail?: string;
}) {
  return (
    <div className="report-stat">
      <span className="report-stat-label">
        {label}
      </span>

      <strong className="report-stat-value">
        {value}
      </strong>

      {detail && (
        <span className="report-stat-detail">
          {detail}
        </span>
      )}
    </div>
  );
}
