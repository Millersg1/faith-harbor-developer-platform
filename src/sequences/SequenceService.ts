import { randomUUID } from "node:crypto";

import type { BrandService } from "../brands/BrandService";
import type { ClientService } from "../clients/ClientService";
import type { ClientRecord } from "../clients/ClientTypes";
import type { EmailService } from "../communications/EmailService";
import { SequenceRepository } from "./SequenceRepository";
import type {
  CreateSequenceRequest,
  EnrollRequest,
  EnrollmentRecord,
  SequenceRecord,
  SequenceStep,
} from "./SequenceTypes";

export interface SequenceServiceOptions {
  brands?: BrandService;
  clients?: ClientService;

  /**
   * Fallback "from" address when a sequence has no brand or the brand
   * has no from-address configured.
   */
  defaultFrom?: string;

  logger?: {
    error: (
      message: string,
      error: unknown,
    ) => void;
  };
}

/**
 * The SaaS Surface marketing-automation engine: it stores drip
 * sequences, enrolls contacts, and — on each scheduler tick —
 * auto-sends any step that has come due, in the enrolling brand's
 * voice, through the shared email transport.
 */
export class SequenceService {
  private readonly brands?: BrandService;

  private readonly clients?: ClientService;

  private readonly defaultFrom?: string;

  private readonly logger: {
    error: (
      message: string,
      error: unknown,
    ) => void;
  };

  constructor(
    private readonly repository: SequenceRepository,
    private readonly emails: EmailService,
    options: SequenceServiceOptions = {},
  ) {
    this.brands = options.brands;
    this.clients = options.clients;
    this.defaultFrom =
      options.defaultFrom;
    this.logger = options.logger ?? {
      error: (message, error) =>
        console.error(message, error),
    };
  }

  /**
   * Creates a drip sequence from an ordered list of steps.
   */
  createSequence(
    request: CreateSequenceRequest,
  ): SequenceRecord {
    const name = request.name.trim();

    if (!name) {
      throw new Error(
        "A sequence requires a name.",
      );
    }

    if (
      !Array.isArray(request.steps) ||
      request.steps.length === 0
    ) {
      throw new Error(
        "A sequence requires at least one step.",
      );
    }

    const steps: SequenceStep[] =
      request.steps.map(
        (step, index) => {
          const subject =
            step.subject.trim();

          const body = step.body.trim();

          if (!subject || !body) {
            throw new Error(
              `Step ${index + 1} needs a subject and a body.`,
            );
          }

          return {
            position: index,
            delayMinutes: Math.max(
              0,
              Math.round(
                step.delayMinutes ?? 0,
              ),
            ),
            subject,
            body,
          };
        },
      );

    const record: SequenceRecord = {
      id: randomUUID(),
      name,
      steps,
      createdAt:
        new Date().toISOString(),
    };

    if (request.brandId) {
      record.brandId =
        request.brandId.trim();
    }

    return this.repository.createSequence(
      record,
    );
  }

  getSequence(
    id: string,
  ): SequenceRecord | undefined {
    return this.repository.getSequence(
      id,
    );
  }

  listSequences(): SequenceRecord[] {
    return this.repository.listSequences();
  }

  listEnrollments(): EnrollmentRecord[] {
    return this.repository.listEnrollments();
  }

  /**
   * Enrolls a contact into a sequence and schedules the first step.
   * Re-enrolling an already-active contact returns the existing
   * enrollment, so repeated webhook deliveries are idempotent.
   *
   * Returns the enrollment and, when a clients service is available,
   * the CRM client the contact maps to (found by email or created).
   */
  enroll(
    request: EnrollRequest,
  ): {
    enrollment: EnrollmentRecord;
    client?: ClientRecord;
  } {
    const email =
      request.email.trim().toLowerCase();

    if (!email) {
      throw new Error(
        "Enrollment requires an email address.",
      );
    }

    const sequence =
      this.repository.getSequence(
        request.sequenceId,
      );

    if (!sequence) {
      throw new Error(
        `Sequence "${request.sequenceId}" was not found.`,
      );
    }

    const name = [
      request.firstName?.trim(),
      request.lastName?.trim(),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    const client = this.upsertClient(
      email,
      name,
      request.phone,
      sequence.brandId,
    );

    const existing =
      this.repository.findActiveEnrollment(
        sequence.id,
        email,
      );

    if (existing) {
      return {
        enrollment: existing,
        client,
      };
    }

    const now = new Date();

    const firstStep = sequence.steps[0];

    const record: EnrollmentRecord = {
      id: randomUUID(),
      sequenceId: sequence.id,
      email,
      position: 0,
      status: firstStep
        ? "active"
        : "completed",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    if (name) {
      record.name = name;
    }

    if (client) {
      record.clientId = client.id;
    }

    if (firstStep) {
      record.nextSendAt =
        this.addMinutes(
          now,
          firstStep.delayMinutes,
        ).toISOString();
    }

    const enrollment =
      this.repository.createEnrollment(
        record,
      );

    return { enrollment, client };
  }

  /**
   * Sends every step that has come due, advancing each enrollment.
   * Returns the number of emails sent. Best-effort: a failure on one
   * enrollment is logged and the enrollment is advanced so the tick
   * never stalls on a single bad contact.
   */
  async tick(
    now: Date = new Date(),
  ): Promise<number> {
    const due =
      this.repository.listDueEnrollments(
        now.toISOString(),
      );

    let sent = 0;

    for (const enrollment of due) {
      try {
        const delivered =
          await this.sendNextStep(
            enrollment,
            now,
          );

        if (delivered) {
          sent += 1;
        }
      } catch (error) {
        this.logger.error(
          `Failed to advance enrollment ${enrollment.id}.`,
          error,
        );

        // Advance past the problem step so a permanently bad step
        // (e.g. malformed content) cannot loop forever.
        this.advance(
          enrollment,
          now,
          true,
        );
      }
    }

    return sent;
  }

  private async sendNextStep(
    enrollment: EnrollmentRecord,
    now: Date,
  ): Promise<boolean> {
    const sequence =
      this.repository.getSequence(
        enrollment.sequenceId,
      );

    const step =
      sequence?.steps[
        enrollment.position
      ];

    if (!sequence || !step) {
      // The sequence or step no longer exists: complete the
      // enrollment rather than retry indefinitely.
      this.advance(
        enrollment,
        now,
        true,
      );

      return false;
    }

    const brand = sequence.brandId
      ? this.brands?.get(
          sequence.brandId,
        )
      : undefined;

    const from =
      brand?.fromEmail ||
      this.defaultFrom;

    const body = this.composeBody(
      step.body,
      enrollment,
      brand?.emailSignature,
    );

    await this.emails.send({
      to: enrollment.email,
      subject: this.fill(
        step.subject,
        enrollment,
      ),
      body,
      from: from || undefined,
      clientId: enrollment.clientId,
    });

    this.advance(enrollment, now, false);

    return true;
  }

  /**
   * Moves an enrollment to its next step (or completes it) and
   * schedules the next send.
   */
  private advance(
    enrollment: EnrollmentRecord,
    now: Date,
    skippedWithoutSend: boolean,
  ): void {
    const sequence =
      this.repository.getSequence(
        enrollment.sequenceId,
      );

    const nextPosition =
      enrollment.position + 1;

    const nextStep =
      sequence?.steps[nextPosition];

    const updated: EnrollmentRecord = {
      ...enrollment,
      position: nextPosition,
      status: nextStep
        ? "active"
        : "completed",
      updatedAt: now.toISOString(),
    };

    if (nextStep) {
      updated.nextSendAt =
        this.addMinutes(
          now,
          nextStep.delayMinutes,
        ).toISOString();
    } else {
      delete updated.nextSendAt;
    }

    void skippedWithoutSend;

    this.repository.updateEnrollment(
      updated,
    );
  }

  /**
   * Finds a CRM client by email or creates one, so buyers appear in
   * the hub. Silent when no clients service is configured.
   */
  private upsertClient(
    email: string,
    name: string,
    phone: string | undefined,
    brandId: string | undefined,
  ): ClientRecord | undefined {
    if (!this.clients) {
      return undefined;
    }

    const existing = this.clients
      .list()
      .find(
        (client) =>
          client.email?.trim().toLowerCase() ===
          email,
      );

    if (existing) {
      return existing;
    }

    const request: {
      companyName: string;
      primaryContact: string;
      email: string;
      phone?: string;
      brandId?: string;
    } = {
      companyName: name || email,
      primaryContact: name || email,
      email,
    };

    if (phone?.trim()) {
      request.phone = phone.trim();
    }

    if (brandId) {
      request.brandId = brandId;
    }

    return this.clients.create(request);
  }

  private composeBody(
    template: string,
    enrollment: EnrollmentRecord,
    signature: string | undefined,
  ): string {
    const body = this.fill(
      template,
      enrollment,
    );

    if (signature?.trim()) {
      return `${body}\n\n${signature.trim()}`;
    }

    return body;
  }

  /**
   * Fills the supported contact placeholders.
   */
  private fill(
    template: string,
    enrollment: EnrollmentRecord,
  ): string {
    const fullName =
      enrollment.name?.trim() ?? "";

    const firstName =
      fullName.split(/\s+/)[0] ||
      "there";

    return template
      .replace(
        /\{\{\s*first_name\s*\}\}/gi,
        firstName,
      )
      .replace(
        /\{\{\s*name\s*\}\}/gi,
        fullName || firstName,
      )
      .replace(
        /\{\{\s*email\s*\}\}/gi,
        enrollment.email,
      );
  }

  private addMinutes(
    from: Date,
    minutes: number,
  ): Date {
    return new Date(
      from.getTime() +
        minutes * 60 * 1000,
    );
  }
}
