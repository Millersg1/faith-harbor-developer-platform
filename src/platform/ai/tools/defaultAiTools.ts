import type { AiToolDefinition } from "./AiToolTypes";

/**
 * The concrete services the default tools act through. Kept as narrow
 * structural shapes so this module doesn't depend on the full service classes
 * (and so tests can pass light fakes). Every method here is tenant-scoped by
 * the service that implements it.
 */
export interface AiToolServices {
  leads?: {
    list: () => Promise<readonly unknown[]>;
    create: (input: {
      name: string;
      email?: string;
      company?: string;
    }) => Promise<{ id: string; name: string }>;
  };
  clients?: {
    list: () => Promise<readonly unknown[]>;
  };
  projects?: {
    list: () => Promise<readonly unknown[]>;
  };
  invoices?: {
    list: () => Promise<readonly unknown[]>;
  };
  activity?: {
    record: (input: {
      actorType?: "user" | "system";
      actorName?: string;
      type: string;
      subjectType?: string;
      subjectId?: string;
      title: string;
      summary?: string;
    }) => Promise<unknown>;
  };
  notifications?: {
    create: (input: {
      userId: string;
      type: string;
      title: string;
      body?: string;
    }) => Promise<unknown>;
  };
  /** Resolves owner/admin user ids to notify (runs in the tenant scope). */
  resolveNotifyRecipients?: () => Promise<
    string[]
  >;
}

/**
 * Builds the starter tool catalogue from whichever services are available.
 * Read tools return counts/summaries; write tools (create a lead, log a note,
 * notify the team) are proposed and require confirmation. This set is
 * deliberately small and honest — it grows as more surfaces are wired in.
 */
export function buildDefaultAiTools(
  services: AiToolServices,
): AiToolDefinition[] {
  const tools: AiToolDefinition[] = [];

  if (services.leads) {
    const leads = services.leads;

    tools.push({
      name: "crm.leads.list",
      title: "List leads",
      description:
        "Count and preview the organization's CRM leads.",
      mode: "read",
      params: [],
      run: async () => {
        const rows = await leads.list();

        return {
          ok: true,
          summary: `${rows.length} lead(s).`,
          data: rows.slice(0, 20),
        };
      },
    });

    tools.push({
      name: "crm.leads.create",
      title: "Create a lead",
      description:
        "Add a new CRM lead. Requires confirmation before it is created.",
      mode: "write",
      roles: ["owner", "admin"],
      params: [
        {
          name: "name",
          type: "string",
          description:
            "The lead's full name.",
          required: true,
        },
        {
          name: "email",
          type: "string",
          description:
            "The lead's email address.",
        },
        {
          name: "company",
          type: "string",
          description:
            "The lead's company.",
        },
      ],
      run: async (args) => {
        const created =
          await leads.create({
            name: String(args.name),
            email:
              args.email === undefined
                ? undefined
                : String(args.email),
            company:
              args.company ===
              undefined
                ? undefined
                : String(
                    args.company,
                  ),
          });

        return {
          ok: true,
          summary: `Created lead "${created.name}".`,
          data: { id: created.id },
        };
      },
    });
  }

  if (services.clients) {
    const clients = services.clients;

    tools.push({
      name: "clients.list",
      title: "List clients",
      description:
        "Count and preview the organization's clients.",
      mode: "read",
      params: [],
      run: async () => {
        const rows =
          await clients.list();

        return {
          ok: true,
          summary: `${rows.length} client(s).`,
          data: rows.slice(0, 20),
        };
      },
    });
  }

  if (services.projects) {
    const projects = services.projects;

    tools.push({
      name: "projects.list",
      title: "List projects",
      description:
        "Count and preview the organization's projects.",
      mode: "read",
      params: [],
      run: async () => {
        const rows =
          await projects.list();

        return {
          ok: true,
          summary: `${rows.length} project(s).`,
          data: rows.slice(0, 20),
        };
      },
    });
  }

  if (
    services.leads ||
    services.clients ||
    services.projects ||
    services.invoices
  ) {
    tools.push({
      name: "metrics.summary",
      title: "Business summary",
      description:
        "Headline counts across leads, clients, projects, and invoices.",
      mode: "read",
      params: [],
      run: async () => {
        const [
          leadCount,
          clientCount,
          projectCount,
          invoiceCount,
        ] = await Promise.all([
          count(services.leads?.list),
          count(services.clients?.list),
          count(
            services.projects?.list,
          ),
          count(
            services.invoices?.list,
          ),
        ]);

        return {
          ok: true,
          summary: `${leadCount} leads · ${clientCount} clients · ${projectCount} projects · ${invoiceCount} invoices.`,
          data: {
            leads: leadCount,
            clients: clientCount,
            projects: projectCount,
            invoices: invoiceCount,
          },
        };
      },
    });
  }

  if (services.activity) {
    const activity = services.activity;

    tools.push({
      name: "notes.add",
      title: "Log a note",
      description:
        "Record a note on the activity timeline. Requires confirmation.",
      mode: "write",
      roles: ["owner", "admin"],
      params: [
        {
          name: "text",
          type: "string",
          description:
            "The note to record.",
          required: true,
        },
        {
          name: "subjectType",
          type: "string",
          description:
            "Optional record type the note is about (e.g. lead).",
        },
        {
          name: "subjectId",
          type: "string",
          description:
            "Optional id of the record the note is about.",
        },
      ],
      run: async (args, ctx) => {
        await activity.record({
          actorType: "user",
          actorName: ctx.actorLabel,
          type: "ai.note",
          subjectType:
            args.subjectType ===
            undefined
              ? undefined
              : String(
                  args.subjectType,
                ),
          subjectId:
            args.subjectId ===
            undefined
              ? undefined
              : String(args.subjectId),
          title: String(args.text),
        });

        return {
          ok: true,
          summary: "Note recorded.",
        };
      },
    });
  }

  if (
    services.notifications &&
    services.resolveNotifyRecipients
  ) {
    const notifications =
      services.notifications;
    const resolve =
      services.resolveNotifyRecipients;

    tools.push({
      name: "notifications.send",
      title: "Notify the team",
      description:
        "Send an in-app notification to owners and admins. Requires confirmation.",
      mode: "write",
      roles: ["owner", "admin"],
      params: [
        {
          name: "title",
          type: "string",
          description:
            "The notification title.",
          required: true,
        },
        {
          name: "body",
          type: "string",
          description:
            "Optional notification body.",
        },
      ],
      run: async (args) => {
        const recipients =
          await resolve();

        await Promise.all(
          recipients.map((userId) =>
            notifications.create({
              userId,
              type: "ai.notify",
              title: String(
                args.title,
              ),
              body:
                args.body === undefined
                  ? undefined
                  : String(args.body),
            }),
          ),
        );

        return {
          ok: true,
          summary: `Notified ${recipients.length} teammate(s).`,
        };
      },
    });
  }

  return tools;
}

async function count(
  list?: () => Promise<
    readonly unknown[]
  >,
): Promise<number> {
  if (!list) return 0;

  try {
    return (await list()).length;
  } catch {
    return 0;
  }
}
