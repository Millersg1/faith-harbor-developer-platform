import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { runWithTenant } from "../tenancy/TenantContext";
import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp } from "./createPlatformApp";
import { ActivityEventRepository } from "./events/ActivityEventRepository";
import { ActivityService } from "./events/ActivityService";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { NotificationRepository } from "./notifications/NotificationRepository";
import { NotificationService } from "./notifications/NotificationService";
import { createNotificationActivityHandler } from "./notifications/NotificationActivityHandler";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformTicketRepository } from "./support/PlatformTicketRepository";
import { PlatformTicketService } from "./support/PlatformTicketService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

describe("Activity service", () => {
  it("records events and lists them, scoped to the tenant", async () => {
    const svc = new ActivityService(
      new ActivityEventRepository(),
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await svc.record({
          type: "ticket.created",
          subjectType: "ticket",
          subjectId: "t1",
          title: "Ticket opened: X",
        });
        const list =
          await svc.list();
        expect(list).toHaveLength(1);
        expect(list[0].title).toBe(
          "Ticket opened: X",
        );
      },
    );

    await runWithTenant(
      { organizationId: "orgB" },
      async () => {
        expect(
          await svc.list(),
        ).toHaveLength(0);
      },
    );
  });

  it("filters activity by subject", async () => {
    const svc = new ActivityService(
      new ActivityEventRepository(),
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await svc.record({
          type: "ticket.created",
          subjectType: "ticket",
          subjectId: "t1",
          title: "T1",
        });
        await svc.record({
          type: "proposal.accepted",
          subjectType: "proposal",
          subjectId: "p1",
          title: "P1",
        });

        const tickets =
          await svc.list({
            subjectType: "ticket",
          });
        expect(
          tickets,
        ).toHaveLength(1);
        expect(
          tickets[0].subjectId,
        ).toBe("t1");
      },
    );
  });
});

describe("Notification fan-out", () => {
  it("notifies recipients for notify-worthy events only", async () => {
    const notifications =
      new NotificationService(
        new NotificationRepository(),
      );
    const activity =
      new ActivityService(
        new ActivityEventRepository(),
      );
    activity.subscribe(
      createNotificationActivityHandler(
        {
          notifications,
          resolveRecipients:
            async () => [
              "user-1",
              "user-2",
            ],
        },
      ),
    );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await activity.record({
          type: "ticket.created",
          title: "Ticket opened",
          subjectType: "ticket",
          subjectId: "t1",
        });
        // Not in the notify set — no notification should be created.
        await activity.record({
          type: "note.added",
          title: "a note",
        });

        expect(
          await notifications.unreadCount(
            "user-1",
          ),
        ).toBe(1);
        expect(
          await notifications.unreadCount(
            "user-2",
          ),
        ).toBe(1);
        const list =
          await notifications.listForUser(
            "user-1",
          );
        expect(list[0].title).toBe(
          "Ticket opened",
        );
      },
    );
  });
});

describe("Notification service", () => {
  it("keeps notifications per-user with read state", async () => {
    const notifications =
      new NotificationService(
        new NotificationRepository(),
      );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const n =
          await notifications.create({
            userId: "user-1",
            type: "x",
            title: "Hi",
          });
        await notifications.create({
          userId: "user-2",
          type: "x",
          title: "Other",
        });

        expect(
          await notifications.listForUser(
            "user-1",
          ),
        ).toHaveLength(1);
        expect(
          await notifications.unreadCount(
            "user-1",
          ),
        ).toBe(1);

        // Wrong user can't read it away.
        await notifications.markRead(
          "user-2",
          n.id,
        );
        expect(
          await notifications.unreadCount(
            "user-1",
          ),
        ).toBe(1);

        await notifications.markRead(
          "user-1",
          n.id,
        );
        expect(
          await notifications.unreadCount(
            "user-1",
          ),
        ).toBe(0);
      },
    );
  });

  it("never leaks notifications across tenants", async () => {
    const notifications =
      new NotificationService(
        new NotificationRepository(),
      );

    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await notifications.create({
          userId: "user-1",
          type: "x",
          title: "A",
        });
      },
    );

    await runWithTenant(
      { organizationId: "orgB" },
      async () => {
        expect(
          await notifications.listForUser(
            "user-1",
          ),
        ).toHaveLength(0);
        expect(
          await notifications.unreadCount(
            "user-1",
          ),
        ).toBe(0);
      },
    );
  });
});

async function buildApp() {
  const organizations =
    new OrganizationService();
  const users =
    new PlatformUserService(
      new PlatformUserRepository(),
    );
  const sessions =
    new PlatformSessionService(
      new PlatformSessionRepository(),
    );
  const clients =
    new PlatformClientService(
      new PlatformClientRepository(),
    );
  const notifications =
    new NotificationService(
      new NotificationRepository(),
    );
  const activity =
    new ActivityService(
      new ActivityEventRepository(),
    );
  activity.subscribe(
    createNotificationActivityHandler({
      notifications,
      resolveRecipients: () =>
        users
          .list()
          .then((l) =>
            l
              .filter(
                (u) =>
                  u.status ===
                    "active" &&
                  (u.role ===
                    "owner" ||
                    u.role ===
                      "admin"),
              )
              .map((u) => u.id),
          )
          .catch(() => []),
    }),
  );

  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding: new BrandingService(
      new BrandingRepository(),
    ),
    clients,
    projects:
      new PlatformProjectService(
        new PlatformProjectRepository(),
        clients,
      ),
    invoices:
      new PlatformInvoiceService(
        new PlatformInvoiceRepository(),
        clients,
      ),
    signup: new PlatformSignupService(
      organizations,
      users,
      sessions,
    ),
    domains:
      new OrganizationDomainService(),
    tickets:
      new PlatformTicketService(
        new PlatformTicketRepository(),
        clients,
      ),
    activity,
    notifications,
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  const signup = await request(app)
    .post("/auth/signup")
    .send({
      organizationName: "Acme",
      slug: "acme",
      email: "owner@acme.com",
      password: "password123",
    });

  return {
    app,
    cookie:
      signup.headers["set-cookie"],
  };
}

describe("Activity + notifications API", () => {
  it("records activity and notifies the owner when a ticket is created", async () => {
    const { app, cookie } =
      await buildApp();

    const ticket = await request(app)
      .post("/api/platform/tickets")
      .set("Cookie", cookie)
      .send({ subject: "Site down" });
    expect(ticket.status).toBe(201);

    const activity = await request(app)
      .get("/api/platform/activity")
      .set("Cookie", cookie);
    expect(activity.status).toBe(200);
    expect(
      activity.body.events.length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      activity.body.events[0].type,
    ).toBe("ticket.created");

    const notifs = await request(app)
      .get(
        "/api/platform/notifications",
      )
      .set("Cookie", cookie);
    expect(notifs.status).toBe(200);
    expect(
      notifs.body.unreadCount,
    ).toBe(1);
    expect(
      notifs.body.notifications[0]
        .type,
    ).toBe("ticket.created");

    const id =
      notifs.body.notifications[0].id;
    const read = await request(app)
      .post(
        `/api/platform/notifications/${id}/read`,
      )
      .set("Cookie", cookie);
    expect(read.status).toBe(200);

    const after = await request(app)
      .get(
        "/api/platform/notifications/unread-count",
      )
      .set("Cookie", cookie);
    expect(
      after.body.unreadCount,
    ).toBe(0);
  });

  it("rejects an unauthenticated caller", async () => {
    const { app } = await buildApp();

    const res = await request(app).get(
      "/api/platform/notifications",
    );
    expect(res.status).toBe(401);
  });
});
