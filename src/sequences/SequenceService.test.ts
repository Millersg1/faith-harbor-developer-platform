import {
  describe,
  expect,
  it,
} from "vitest";

import { BrandService } from "../brands/BrandService";
import { ClientService } from "../clients/ClientService";
import { EmailService } from "../communications/EmailService";
import { LoggingEmailTransport } from "../communications/EmailTransport";
import { SequenceRepository } from "./SequenceRepository";
import { SequenceService } from "./SequenceService";

function build() {
  const emails = new EmailService(
    new LoggingEmailTransport(),
    "system@faithharbor.test",
  );

  const clients = new ClientService();

  const brands = new BrandService();

  const service = new SequenceService(
    new SequenceRepository(),
    emails,
    {
      clients,
      brands,
      defaultFrom:
        "system@faithharbor.test",
    },
  );

  return { service, emails, clients, brands };
}

const minutesFromNow = (
  minutes: number,
): Date =>
  new Date(
    Date.now() + minutes * 60 * 1000,
  );

describe("SequenceService", () => {
  it("normalizes step positions and delays on creation", () => {
    const { service } = build();

    const sequence =
      service.createSequence({
        name: "Welcome",
        steps: [
          {
            subject: "Hi",
            body: "Welcome aboard",
          },
          {
            subject: "Day 2",
            body: "How's it going",
            delayMinutes: 1440,
          },
        ],
      });

    expect(sequence.id).toBeTruthy();
    expect(
      sequence.steps.map(
        (s) => s.position,
      ),
    ).toEqual([0, 1]);
    expect(
      sequence.steps[0].delayMinutes,
    ).toBe(0);
    expect(
      sequence.steps[1].delayMinutes,
    ).toBe(1440);
  });

  it("rejects a sequence with no steps", () => {
    const { service } = build();

    expect(() =>
      service.createSequence({
        name: "Empty",
        steps: [],
      }),
    ).toThrow();
  });

  it("enrolls a contact, schedules step 0, and creates a CRM client", () => {
    const { service, clients } = build();

    const sequence =
      service.createSequence({
        name: "Onboarding",
        steps: [
          {
            subject: "Welcome",
            body: "Hello {{first_name}}",
          },
        ],
      });

    const { enrollment, client } =
      service.enroll({
        sequenceId: sequence.id,
        email: "Buyer@Example.com",
        firstName: "Sam",
        lastName: "Rivera",
      });

    expect(enrollment.status).toBe(
      "active",
    );
    expect(enrollment.position).toBe(0);
    expect(
      enrollment.nextSendAt,
    ).toBeTruthy();
    // Email is normalized to lowercase.
    expect(enrollment.email).toBe(
      "buyer@example.com",
    );
    expect(client?.email).toBe(
      "buyer@example.com",
    );
    expect(clients.list()).toHaveLength(
      1,
    );
  });

  it("is idempotent: re-enrolling the same contact reuses the enrollment and client", () => {
    const { service, clients } = build();

    const sequence =
      service.createSequence({
        name: "Onboarding",
        steps: [
          {
            subject: "Welcome",
            body: "Hi",
          },
        ],
      });

    const first = service.enroll({
      sequenceId: sequence.id,
      email: "buyer@example.com",
    });

    const second = service.enroll({
      sequenceId: sequence.id,
      email: "buyer@example.com",
    });

    expect(second.enrollment.id).toBe(
      first.enrollment.id,
    );
    expect(clients.list()).toHaveLength(
      1,
    );
  });

  it("auto-sends the due step, fills placeholders, and advances", async () => {
    const { service, emails } = build();

    const sequence =
      service.createSequence({
        name: "Drip",
        steps: [
          {
            subject:
              "Welcome {{first_name}}",
            body: "Hi {{first_name}} at {{email}}",
          },
          {
            subject: "Follow up",
            body: "Still there?",
            delayMinutes: 1440,
          },
        ],
      });

    service.enroll({
      sequenceId: sequence.id,
      email: "buyer@example.com",
      firstName: "Sam",
    });

    // A moment later, step 0 is due.
    const sent = await service.tick(
      minutesFromNow(1),
    );

    expect(sent).toBe(1);

    const outbox = emails.list();

    expect(outbox).toHaveLength(1);
    expect(outbox[0].subject).toBe(
      "Welcome Sam",
    );
    expect(outbox[0].body).toContain(
      "Hi Sam at buyer@example.com",
    );

    // Step 1 is not due yet (1 day out): another immediate tick is a
    // no-op.
    const again = await service.tick(
      minutesFromNow(2),
    );

    expect(again).toBe(0);

    // A day later, step 1 sends and the enrollment completes.
    const last = await service.tick(
      minutesFromNow(1441),
    );

    expect(last).toBe(1);
    expect(emails.list()).toHaveLength(
      2,
    );

    const enrollment =
      service.listEnrollments()[0];

    expect(enrollment.status).toBe(
      "completed",
    );
  });

  it("sends from the brand address and appends the brand signature", async () => {
    const { service, emails, brands } =
      build();

    const brand = brands.create({
      name: "All Elite Hosting",
      fromEmail:
        "hello@allelitehosting.com",
      emailSignature:
        "— The All Elite Team",
    });

    const sequence =
      service.createSequence({
        name: "Elite Drip",
        brandId: brand.id,
        steps: [
          {
            subject: "Welcome",
            body: "Thanks for joining.",
          },
        ],
      });

    service.enroll({
      sequenceId: sequence.id,
      email: "buyer@example.com",
    });

    await service.tick(
      minutesFromNow(1),
    );

    const message = emails.list()[0];

    expect(message.from).toBe(
      "hello@allelitehosting.com",
    );
    expect(message.body).toContain(
      "— The All Elite Team",
    );
  });
});
