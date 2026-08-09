import { randomUUID } from "node:crypto";

import { runWithTenant } from "../../tenancy/TenantContext";
import type { PlatformEmailService } from "../email/PlatformEmailService";
import type { EmailSuppressionService } from "../marketing/EmailSuppressionService";
import { DripRepository } from "./DripRepository";
import {
  isDripTrigger,
  type DripEnrollmentRecord,
  type DripSequenceRecord,
  type DripStatus,
  type DripStepRecord,
  type DripTrigger,
} from "./DripTypes";

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HOUR_MS = 60 * 60 * 1000;

export interface CreateSequenceRequest {
  name: string;
  trigger?: string;
}

export interface AddStepRequest {
  delayHours: number;
  subject: string;
  body: string;
}

/**
 * Runs autoresponder / drip automation for tenants.
 *
 * Tenant-facing methods (create/list/enroll) run inside a tenant scope set
 * by the request middleware. {@link runDue} is the system worker: it runs
 * with no tenant, discovers due enrollments across all tenants, and
 * processes each *inside* its own tenant scope — so every send and every
 * write still goes through the tenant-isolated repositories.
 */
export class DripService {
  private readonly now: () => number;

  private readonly suppression?: EmailSuppressionService;

  constructor(
    private readonly repository =
      new DripRepository(),
    private readonly email?: PlatformEmailService,
    options: {
      now?: () => number;
      /**
       * Marketing eligibility gate. When present, every drip send is treated as
       * MARKETING and is rechecked against suppression immediately before send.
       */
      suppression?: EmailSuppressionService;
    } = {},
  ) {
    this.now =
      options.now ??
      (() => Date.now());
    this.suppression = options.suppression;
  }

  // ---- Sequences -----------------------------------------------------

  async createSequence(
    request: CreateSequenceRequest,
  ): Promise<DripSequenceRecord> {
    const name = request.name.trim();

    if (!name) {
      throw new Error(
        "A sequence needs a name.",
      );
    }

    const trigger: DripTrigger =
      isDripTrigger(request.trigger)
        ? request.trigger
        : "manual";

    const now = new Date(
      this.now(),
    ).toISOString();

    return this.repository.createSequence(
      {
        id: randomUUID(),
        name,
        trigger,
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    );
  }

  async listSequences(): Promise<
    readonly DripSequenceRecord[]
  > {
    return this.repository.listSequences();
  }

  async getSequence(
    id: string,
  ): Promise<DripSequenceRecord> {
    const sequence =
      await this.repository.getSequence(
        id,
      );

    if (!sequence) {
      throw new Error(
        "Sequence not found.",
      );
    }

    return sequence;
  }

  async setStatus(
    id: string,
    status: DripStatus,
  ): Promise<DripSequenceRecord> {
    const sequence =
      await this.getSequence(id);

    return this.repository.updateSequence(
      {
        ...sequence,
        status,
        updatedAt: new Date(
          this.now(),
        ).toISOString(),
      },
    );
  }

  // ---- Steps ---------------------------------------------------------

  async addStep(
    sequenceId: string,
    request: AddStepRequest,
  ): Promise<DripStepRecord> {
    await this.getSequence(
      sequenceId,
    );

    const subject =
      request.subject.trim();
    const body = request.body.trim();

    if (!subject || !body) {
      throw new Error(
        "A step needs a subject and a body.",
      );
    }

    const delayHours = Number(
      request.delayHours,
    );

    if (
      !Number.isFinite(delayHours) ||
      delayHours < 0
    ) {
      throw new Error(
        "Delay must be zero or more hours.",
      );
    }

    const existing =
      await this.repository.listSteps(
        sequenceId,
      );

    return this.repository.createStep(
      {
        id: randomUUID(),
        sequenceId,
        position: existing.length,
        delayHours,
        subject,
        body,
        createdAt: new Date(
          this.now(),
        ).toISOString(),
      },
    );
  }

  async listSteps(
    sequenceId: string,
  ): Promise<
    readonly DripStepRecord[]
  > {
    return this.repository.listSteps(
      sequenceId,
    );
  }

  // ---- Enrollments ---------------------------------------------------

  /**
   * Enrolls a recipient into a sequence. Idempotent per active enrollment:
   * enrolling the same email into the same sequence again returns the
   * existing enrollment rather than duplicating sends.
   */
  async enroll(
    sequenceId: string,
    email: string,
    name?: string,
  ): Promise<DripEnrollmentRecord> {
    const normalized = email
      .trim()
      .toLowerCase();

    if (!EMAIL_RE.test(normalized)) {
      throw new Error(
        "Enter a valid recipient email address.",
      );
    }

    await this.getSequence(
      sequenceId,
    );

    const steps =
      await this.repository.listSteps(
        sequenceId,
      );

    if (steps.length === 0) {
      throw new Error(
        "Add at least one step before enrolling recipients.",
      );
    }

    const already =
      await this.repository.findActiveEnrollment(
        sequenceId,
        normalized,
      );

    if (already) {
      return already;
    }

    const nowMs = this.now();
    const nextRunAt = new Date(
      nowMs +
        steps[0].delayHours * HOUR_MS,
    ).toISOString();
    const nowIso = new Date(
      nowMs,
    ).toISOString();

    return this.repository.createEnrollment(
      {
        id: randomUUID(),
        sequenceId,
        email: normalized,
        name:
          name?.trim() || undefined,
        stepIndex: 0,
        status: "active",
        nextRunAt,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    );
  }

  async listEnrollments(): Promise<
    readonly DripEnrollmentRecord[]
  > {
    return this.repository.listEnrollments();
  }

  /** Fetch one enrollment by id (tenant-scoped via the repository). */
  async getEnrollment(
    id: string,
  ): Promise<DripEnrollmentRecord | undefined> {
    return this.repository.getEnrollment(id);
  }

  async cancelEnrollment(
    id: string,
  ): Promise<DripEnrollmentRecord> {
    const enrollment =
      await this.repository.getEnrollment(
        id,
      );

    if (!enrollment) {
      throw new Error(
        "Enrollment not found.",
      );
    }

    return this.repository.updateEnrollment(
      {
        ...enrollment,
        status: "canceled",
        updatedAt: new Date(
          this.now(),
        ).toISOString(),
      },
    );
  }

  /**
   * Best-effort auto-enroll for an event (e.g. a new lead): enrolls the
   * recipient into every active sequence whose trigger matches. Never
   * throws — a drip hiccup must not break the action that fired it.
   */
  async enrollByTrigger(
    trigger: DripTrigger,
    email: string | undefined,
    name?: string,
  ): Promise<void> {
    if (
      !email ||
      !EMAIL_RE.test(
        email.trim().toLowerCase(),
      )
    ) {
      return;
    }

    try {
      const sequences =
        await this.repository.listSequences();

      for (const sequence of sequences) {
        if (
          sequence.status !==
            "active" ||
          sequence.trigger !== trigger
        ) {
          continue;
        }

        try {
          await this.enroll(
            sequence.id,
            email,
            name,
          );
        } catch {
          // e.g. a sequence with no steps — skip it, try the rest.
        }
      }
    } catch {
      // Best-effort.
    }
  }

  // ---- Worker --------------------------------------------------------

  /**
   * Processes every enrollment that is due now, across all tenants. Called
   * on an interval by the platform server. Returns how many were advanced.
   * Each enrollment is handled inside its own tenant scope; a failure on one
   * leaves it for the next tick and does not stop the others.
   */
  async runDue(
    limit = 100,
  ): Promise<number> {
    const nowMs = this.now();
    const refs =
      await this.repository.dueRefs(
        new Date(
          nowMs,
        ).toISOString(),
        limit,
      );

    let processed = 0;

    for (const ref of refs) {
      try {
        await runWithTenant(
          {
            organizationId:
              ref.organizationId,
          },
          () =>
            this.processOne(
              ref.id,
              nowMs,
            ),
        );
        processed += 1;
      } catch {
        // Leave this enrollment for the next tick.
      }
    }

    return processed;
  }

  /**
   * Sends the current step for one enrollment and advances it. Runs inside
   * the enrollment's tenant scope.
   */
  private async processOne(
    enrollmentId: string,
    nowMs: number,
  ): Promise<void> {
    const enrollment =
      await this.repository.getEnrollment(
        enrollmentId,
      );

    if (
      !enrollment ||
      enrollment.status !== "active"
    ) {
      return;
    }

    const nowIso = new Date(
      nowMs,
    ).toISOString();
    const sequence =
      await this.repository.getSequence(
        enrollment.sequenceId,
      );

    // Paused or deleted sequence: don't send; check again later.
    if (
      !sequence ||
      sequence.status !== "active"
    ) {
      await this.repository.updateEnrollment(
        {
          ...enrollment,
          nextRunAt: new Date(
            nowMs + HOUR_MS,
          ).toISOString(),
          updatedAt: nowIso,
        },
      );

      return;
    }

    const steps =
      await this.repository.listSteps(
        enrollment.sequenceId,
      );
    const step =
      steps[enrollment.stepIndex];

    if (!step) {
      await this.repository.updateEnrollment(
        {
          ...enrollment,
          status: "completed",
          updatedAt: nowIso,
        },
      );

      return;
    }

    // PRE-SEND eligibility recheck (atomic w.r.t. this send): a suppression
    // recorded AFTER enrollment — even for a message queued long ago — stops the
    // send here. Suppressed → cancel safely, record a non-PII reason, do NOT
    // send and do NOT meter.
    if (this.suppression) {
      const elig = await this.suppression.marketingDeliverability(
        enrollment.organizationId,
        enrollment.email,
      );
      if (!elig.eligible) {
        await this.repository.updateEnrollment({
          ...enrollment,
          status: "canceled",
          lastEvent: `skipped:${elig.reason ?? "ineligible"}`,
          updatedAt: nowIso,
        });
        return;
      }
    }

    await this.email?.sendQuietly({
      to: enrollment.email,
      subject: step.subject,
      body: personalize(
        step.body,
        enrollment,
      ),
    });

    const nextIndex =
      enrollment.stepIndex + 1;
    const nextStep = steps[nextIndex];

    const updated: DripEnrollmentRecord =
      {
        ...enrollment,
        stepIndex: nextIndex,
        updatedAt: nowIso,
        nextRunAt: nextStep
          ? new Date(
              nowMs +
                nextStep.delayHours *
                  HOUR_MS,
            ).toISOString()
          : enrollment.nextRunAt,
        status: nextStep
          ? "active"
          : "completed",
      };

    await this.repository.updateEnrollment(
      updated,
    );
  }
}

/**
 * Fills simple placeholders in a step body: {{name}} → the recipient's name
 * (or "there"), {{email}} → their address.
 */
function personalize(
  body: string,
  enrollment: DripEnrollmentRecord,
): string {
  return body
    .replace(
      /\{\{\s*name\s*\}\}/gi,
      enrollment.name || "there",
    )
    .replace(
      /\{\{\s*email\s*\}\}/gi,
      enrollment.email,
    );
}
