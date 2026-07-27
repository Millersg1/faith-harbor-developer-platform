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
    update?: (
      id: string,
      changes: { status?: string },
    ) => Promise<{
      id: string;
      name: string;
      status?: string;
    }>;
  };
  clients?: {
    list: () => Promise<readonly unknown[]>;
  };
  projects?: {
    list: () => Promise<readonly unknown[]>;
    create?: (input: {
      name: string;
      description?: string;
      clientId?: string;
    }) => Promise<{ id: string; name: string }>;
  };
  invoices?: {
    list: () => Promise<readonly unknown[]>;
  };
  tickets?: {
    list: () => Promise<readonly unknown[]>;
    create: (input: {
      subject: string;
      description?: string;
      priority?: string;
    }) => Promise<{
      id: string;
      subject: string;
    }>;
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

  if (services.leads) {
    const leads = services.leads;

    tools.push({
      name: "crm.pipeline.summary",
      title: "Sales pipeline summary",
      description:
        "Leads grouped by stage with total estimated value.",
      mode: "read",
      params: [],
      run: async () => {
        const rows =
          (await leads.list()) as ReadonlyArray<{
            status?: string;
            estimatedValue?: number;
          }>;
        const byStage: Record<
          string,
          number
        > = {};
        let value = 0;

        for (const r of rows) {
          const stage =
            typeof r.status === "string"
              ? r.status
              : "unknown";
          byStage[stage] =
            (byStage[stage] ?? 0) + 1;
          value +=
            typeof r.estimatedValue ===
            "number"
              ? r.estimatedValue
              : 0;
        }

        const parts = Object.entries(
          byStage,
        ).map(
          ([s, n]) => `${n} ${s}`,
        );

        return {
          ok: true,
          summary: `${rows.length} lead(s): ${parts.join(", ") || "none"} · ~$${value} in pipeline.`,
          data: {
            byStage,
            estimatedValue: value,
          },
        };
      },
    });

    if (leads.update) {
      const update = leads.update;

      tools.push({
        name: "crm.leads.update_stage",
        title: "Move a lead's stage",
        description:
          "Change a lead's pipeline stage. Requires confirmation.",
        mode: "write",
        roles: ["owner", "admin"],
        params: [
          {
            name: "leadId",
            type: "string",
            description:
              "The lead's id.",
            required: true,
          },
          {
            name: "status",
            type: "string",
            description:
              "New stage: new, contacted, qualified, proposal, won, or lost.",
            required: true,
          },
        ],
        run: async (args) => {
          const updated =
            await update(
              String(args.leadId),
              {
                status: String(
                  args.status,
                ),
              },
            );

          return {
            ok: true,
            summary: `Moved "${updated.name}" to ${updated.status ?? "updated"}.`,
          };
        },
      });
    }
  }

  if (services.projects?.create) {
    const create =
      services.projects.create;

    tools.push({
      name: "projects.create",
      title: "Create a project",
      description:
        "Start a new project. Requires confirmation.",
      mode: "write",
      roles: ["owner", "admin"],
      params: [
        {
          name: "name",
          type: "string",
          description:
            "The project name.",
          required: true,
        },
        {
          name: "description",
          type: "string",
          description:
            "Optional description.",
        },
      ],
      run: async (args) => {
        const created =
          await create({
            name: String(args.name),
            description:
              args.description ===
              undefined
                ? undefined
                : String(
                    args.description,
                  ),
          });

        return {
          ok: true,
          summary: `Created project "${created.name}".`,
          data: { id: created.id },
        };
      },
    });
  }

  if (services.tickets) {
    const tickets = services.tickets;

    tools.push({
      name: "tickets.list",
      title: "List support tickets",
      description:
        "Count and preview open support tickets.",
      mode: "read",
      params: [],
      run: async () => {
        const rows =
          await tickets.list();

        return {
          ok: true,
          summary: `${rows.length} ticket(s).`,
          data: rows.slice(0, 20),
        };
      },
    });

    tools.push({
      name: "tickets.create",
      title: "Open a support ticket",
      description:
        "Open a new support ticket. Requires confirmation.",
      mode: "write",
      roles: ["owner", "admin"],
      params: [
        {
          name: "subject",
          type: "string",
          description:
            "The ticket subject.",
          required: true,
        },
        {
          name: "description",
          type: "string",
          description:
            "Optional detail.",
        },
        {
          name: "priority",
          type: "string",
          description:
            "low, medium, high, or urgent.",
        },
      ],
      run: async (args) => {
        const created =
          await tickets.create({
            subject: String(
              args.subject,
            ),
            description:
              args.description ===
              undefined
                ? undefined
                : String(
                    args.description,
                  ),
            priority:
              args.priority ===
              undefined
                ? undefined
                : String(
                    args.priority,
                  ),
          });

        return {
          ok: true,
          summary: `Opened ticket "${created.subject}".`,
          data: { id: created.id },
        };
      },
    });
  }

  if (services.invoices) {
    const invoices = services.invoices;

    tools.push({
      name: "revenue.summary",
      title: "Revenue summary",
      description:
        "Invoice totals: paid vs outstanding.",
      mode: "read",
      params: [],
      run: async () => {
        const rows =
          (await invoices.list()) as ReadonlyArray<{
            status?: string;
            amount?: number;
          }>;
        let paid = 0;
        let outstanding = 0;

        for (const r of rows) {
          const amount =
            typeof r.amount === "number"
              ? r.amount
              : 0;
          if (r.status === "paid") {
            paid += amount;
          } else {
            outstanding += amount;
          }
        }

        return {
          ok: true,
          summary: `${rows.length} invoice(s): $${paid} paid, $${outstanding} outstanding.`,
          data: {
            paid,
            outstanding,
          },
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
