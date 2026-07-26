/**
 * Tenant-scoped universal search.
 *
 * Rather than a separate index, search aggregates over the existing module
 * services. Every source's `list()` is already tenant-scoped, so search can
 * never cross tenants, works identically on Postgres and the in-memory test
 * repositories, and needs no index to keep in sync. Results are matched
 * case-insensitively, ranked (prefix beats substring), grouped by type, and
 * capped per group and overall.
 */

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  /** In-app destination, e.g. "/app#clients". */
  url: string;
}

export interface SearchResultGroup {
  type: string;
  label: string;
  results: SearchResult[];
}

type AnyRecord = Record<
  string,
  unknown
>;

/**
 * Any tenant-scoped service exposing `list()`. Loosely typed so every
 * module service (each with its own record type) is assignable; records are
 * treated as {@link AnyRecord} internally.
 */
interface AnyListable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  list(): Promise<readonly any[]>;
}

interface SearchSourceConfig<T> {
  type: string;
  label: string;
  /** Dashboard anchor id the result links to. */
  anchor: string;
  service?: AnyListable;
  id: (record: T) => string;
  title: (record: T) => string;
  subtitle?: (
    record: T,
  ) => string | undefined;
  status?: (
    record: T,
  ) => string | undefined;
  /** Text fields matched against the query. */
  fields: (record: T) => string[];
}

export interface SearchServiceDeps {
  clients?: AnyListable;
  leads?: AnyListable;
  projects?: AnyListable;
  proposals?: AnyListable;
  invoices?: AnyListable;
  tickets?: AnyListable;
  campaigns?: AnyListable;
  reviews?: AnyListable;
  brands?: AnyListable;
  products?: AnyListable;
  books?: AnyListable;
  programs?: AnyListable;
  hosting?: AnyListable;
  users?: AnyListable;
}

function str(value: unknown): string {
  return value == null
    ? ""
    : String(value);
}

/** Per-group and overall result caps. */
const PER_GROUP = 5;
const MAX_RESULTS = 30;

export class SearchService {
  private readonly sources: SearchSourceConfig<AnyRecord>[];

  constructor(deps: SearchServiceDeps) {
    this.sources = [
      {
        type: "client",
        label: "Clients",
        anchor: "clients",
        service: deps.clients,
        id: (r) => str(r.id),
        title: (r) => str(r.name),
        subtitle: (r) =>
          str(r.email) || undefined,
        status: (r) =>
          str(r.status) || undefined,
        fields: (r) => [
          str(r.name),
          str(r.email),
          str(r.company),
        ],
      },
      {
        type: "lead",
        label: "Leads",
        anchor: "leads",
        service: deps.leads,
        id: (r) => str(r.id),
        title: (r) => str(r.name),
        subtitle: (r) =>
          str(r.company) || undefined,
        status: (r) =>
          str(r.status) || undefined,
        fields: (r) => [
          str(r.name),
          str(r.company),
          str(r.email),
        ],
      },
      {
        type: "project",
        label: "Projects",
        anchor: "projects",
        service: deps.projects,
        id: (r) => str(r.id),
        title: (r) => str(r.name),
        status: (r) =>
          str(r.status) || undefined,
        fields: (r) => [
          str(r.name),
          str(r.description),
        ],
      },
      {
        type: "proposal",
        label: "Proposals",
        anchor: "proposals",
        service: deps.proposals,
        id: (r) => str(r.id),
        title: (r) => str(r.title),
        status: (r) =>
          str(r.status) || undefined,
        fields: (r) => [
          str(r.title),
          str(r.summary),
        ],
      },
      {
        type: "invoice",
        label: "Invoices",
        anchor: "invoices",
        service: deps.invoices,
        id: (r) => str(r.id),
        title: (r) =>
          "Invoice " + str(r.number),
        subtitle: (r) =>
          str(r.description) ||
          undefined,
        status: (r) =>
          str(r.status) || undefined,
        fields: (r) => [
          str(r.number),
          str(r.description),
        ],
      },
      {
        type: "ticket",
        label: "Support tickets",
        anchor: "tickets",
        service: deps.tickets,
        id: (r) => str(r.id),
        title: (r) => str(r.subject),
        status: (r) =>
          str(r.status) || undefined,
        fields: (r) => [
          str(r.subject),
          str(r.description),
        ],
      },
      {
        type: "campaign",
        label: "Campaigns",
        anchor: "campaigns",
        service: deps.campaigns,
        id: (r) => str(r.id),
        title: (r) => str(r.name),
        subtitle: (r) =>
          str(r.channel) || undefined,
        status: (r) =>
          str(r.status) || undefined,
        fields: (r) => [
          str(r.name),
          str(r.channel),
        ],
      },
      {
        type: "review",
        label: "Reviews",
        anchor: "reviews",
        service: deps.reviews,
        id: (r) => str(r.id),
        title: (r) =>
          str(r.author) || "Review",
        subtitle: (r) =>
          str(r.comment) || undefined,
        status: (r) =>
          r.rating != null
            ? str(r.rating) + "★"
            : undefined,
        fields: (r) => [
          str(r.author),
          str(r.comment),
          str(r.source),
        ],
      },
      {
        type: "brand",
        label: "Brands",
        anchor: "brands",
        service: deps.brands,
        id: (r) => str(r.id),
        title: (r) => str(r.name),
        fields: (r) => [
          str(r.name),
        ],
      },
      {
        type: "product",
        label: "Products",
        anchor: "products",
        service: deps.products,
        id: (r) => str(r.id),
        title: (r) => str(r.name),
        subtitle: (r) =>
          str(r.language) || undefined,
        fields: (r) => [
          str(r.name),
          str(r.language),
        ],
      },
      {
        type: "book",
        label: "Books",
        anchor: "books",
        service: deps.books,
        id: (r) => str(r.id),
        title: (r) => str(r.title),
        subtitle: (r) =>
          str(r.author) || undefined,
        fields: (r) => [
          str(r.title),
          str(r.author),
        ],
      },
      {
        type: "program",
        label: "Programs",
        anchor: "programs",
        service: deps.programs,
        id: (r) => str(r.id),
        title: (r) => str(r.name),
        fields: (r) => [
          str(r.name),
          str(r.description),
        ],
      },
      {
        type: "hosting",
        label: "Hosting accounts",
        anchor: "hosting",
        service: deps.hosting,
        id: (r) => str(r.id),
        title: (r) => str(r.domain),
        status: (r) =>
          str(r.status) || undefined,
        fields: (r) => [
          str(r.domain),
        ],
      },
      {
        type: "team",
        label: "Team members",
        anchor: "team",
        service: deps.users,
        id: (r) => str(r.id),
        title: (r) =>
          str(r.name) || str(r.email),
        subtitle: (r) =>
          str(r.email) || undefined,
        status: (r) =>
          str(r.role) || undefined,
        fields: (r) => [
          str(r.name),
          str(r.email),
        ],
      },
    ];
  }

  async search(
    query: string,
    options: { limit?: number } = {},
  ): Promise<SearchResultGroup[]> {
    const q = query
      .trim()
      .toLowerCase();

    if (q.length < 2) {
      return [];
    }

    const overall =
      options.limit ?? MAX_RESULTS;
    const groups: SearchResultGroup[] =
      [];
    let total = 0;

    for (const source of this
      .sources) {
      if (
        !source.service ||
        total >= overall
      ) {
        continue;
      }

      let records: readonly AnyRecord[];

      try {
        records =
          await source.service.list();
      } catch {
        continue;
      }

      const scored = records
        .map((record) => ({
          record,
          score: scoreRecord(
            source.fields(record),
            q,
          ),
        }))
        .filter((x) => x.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score,
        )
        .slice(0, PER_GROUP);

      if (scored.length === 0) {
        continue;
      }

      const results = scored.map(
        ({ record }) => {
          const result: SearchResult =
            {
              type: source.type,
              id: source.id(record),
              title:
                source.title(record),
              url:
                "/app#" +
                source.anchor,
            };

          const subtitle =
            source.subtitle?.(
              record,
            );
          if (subtitle)
            result.subtitle =
              subtitle;

          const status =
            source.status?.(record);
          if (status)
            result.status = status;

          return result;
        },
      );

      groups.push({
        type: source.type,
        label: source.label,
        results,
      });
      total += results.length;
    }

    return groups;
  }
}

/**
 * Scores a record's text fields against the query: a field that starts with
 * the query ranks highest, a substring match next, no match zero.
 */
function scoreRecord(
  fields: string[],
  q: string,
): number {
  let best = 0;

  for (const field of fields) {
    const f = field
      .trim()
      .toLowerCase();

    if (!f) continue;

    if (f === q) {
      best = Math.max(best, 3);
    } else if (f.startsWith(q)) {
      best = Math.max(best, 2);
    } else if (f.includes(q)) {
      best = Math.max(best, 1);
    }
  }

  return best;
}
