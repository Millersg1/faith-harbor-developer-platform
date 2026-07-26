import { randomUUID } from "node:crypto";

import {
  requireTenant,
  runWithTenant,
} from "../../tenancy/TenantContext";
import type { ActivityEventRecord } from "../events/ActivityEvent";
import type { ActivityService } from "../events/ActivityService";
import type { DripService } from "../drip/DripService";
import type { PlatformEmailService } from "../email/PlatformEmailService";
import type { NotificationService } from "../notifications/NotificationService";
import { WorkflowRepository } from "./WorkflowRepository";
import {
  WORKFLOW_ACTION_TYPES,
  type CreateWorkflowRequest,
  type WorkflowRecord,
  type WorkflowRunRecord,
  type WorkflowStatus,
  type WorkflowStep,
} from "./WorkflowTypes";

const HOUR_MS = 60 * 60 * 1000;

export class WorkflowValidationError extends Error {}
export class WorkflowNotFoundError extends Error {}

export interface WorkflowServiceOptions {
  notifications?: NotificationService;
  email?: PlatformEmailService;
  drip?: DripService;
  activity?: ActivityService;
  /** Resolves owner/admin user ids to notify (runs inside the tenant scope). */
  resolveNotifyRecipients?: () => Promise<
    string[]
  >;
  now?: () => number;
}

/**
 * Runs tenant automations. Workflows are triggered by activity events (via a
 * subscribed handler) and advanced by a background tick worker; each step
 * performs a closed-set action through an existing service. No arbitrary
 * tenant code ever runs. Loop-safe: events this engine itself emits
 * ("workflow.*") never trigger workflows.
 */
export class WorkflowService {
  private readonly now: () => number;

  constructor(
    private readonly repository =
      new WorkflowRepository(),
    private readonly deps: WorkflowServiceOptions = {},
  ) {
    this.now =
      deps.now ?? (() => Date.now());
  }

  // ---- CRUD ----------------------------------------------------------

  async create(
    request: CreateWorkflowRequest,
  ): Promise<WorkflowRecord> {
    const name = request.name.trim();
    const trigger =
      request.trigger?.trim();

    if (!name) {
      throw new WorkflowValidationError(
        "A workflow needs a name.",
      );
    }

    if (!trigger) {
      throw new WorkflowValidationError(
        "A workflow needs a trigger.",
      );
    }

    const now = new Date(
      this.now(),
    ).toISOString();

    return this.repository.create({
      id: randomUUID(),
      name,
      trigger,
      status: "active",
      steps: sanitizeSteps(
        request.steps,
      ),
      createdAt: now,
      updatedAt: now,
    });
  }

  async list(): Promise<
    readonly WorkflowRecord[]
  > {
    return this.repository.list();
  }

  async get(
    id: string,
  ): Promise<WorkflowRecord> {
    const workflow =
      await this.repository.get(id);

    if (!workflow) {
      throw new WorkflowNotFoundError(
        "Workflow not found.",
      );
    }

    return workflow;
  }

  async update(
    id: string,
    changes: {
      name?: string;
      trigger?: string;
      status?: WorkflowStatus;
      steps?: WorkflowStep[];
    },
  ): Promise<WorkflowRecord> {
    const workflow =
      await this.get(id);

    return this.repository.update({
      ...workflow,
      name:
        changes.name?.trim() ||
        workflow.name,
      trigger:
        changes.trigger?.trim() ||
        workflow.trigger,
      status:
        changes.status === "paused" ||
        changes.status === "active"
          ? changes.status
          : workflow.status,
      steps: changes.steps
        ? sanitizeSteps(changes.steps)
        : workflow.steps,
      updatedAt: new Date(
        this.now(),
      ).toISOString(),
    });
  }

  async listRuns(
    workflowId: string,
  ): Promise<
    readonly WorkflowRunRecord[]
  > {
    await this.get(workflowId);

    return this.repository.listRuns(
      workflowId,
    );
  }

  // ---- Trigger handler ----------------------------------------------

  /**
   * An {@link ActivityService} handler: starts runs for every active workflow
   * whose trigger matches the event. Runs inside the event's tenant scope.
   * Never throws (best-effort). Ignores this engine's own events to prevent
   * loops.
   */
  handleEvent = async (
    event: ActivityEventRecord,
  ): Promise<void> => {
    if (
      event.type.startsWith(
        "workflow.",
      )
    ) {
      return;
    }

    try {
      const workflows =
        await this.repository.listActiveByTrigger(
          event.type,
        );

      if (workflows.length === 0) {
        return;
      }

      const organizationId =
        requireTenant()
          .organizationId;
      const nowMs = this.now();
      const meta =
        event.metadata ?? {};
      const contextEmail =
        typeof meta.email === "string"
          ? meta.email
          : undefined;
      const contextName =
        typeof meta.name === "string"
          ? meta.name
          : event.actorName;

      for (const workflow of workflows) {
        if (
          workflow.steps.length === 0
        ) {
          continue;
        }

        const nowIso = new Date(
          nowMs,
        ).toISOString();

        await this.repository.createRun(
          {
            id: randomUUID(),
            organizationId,
            workflowId: workflow.id,
            triggerType: event.type,
            subjectType:
              event.subjectType,
            subjectId:
              event.subjectId,
            contextEmail,
            contextName,
            stepIndex: 0,
            status: "running",
            nextRunAt: new Date(
              nowMs +
                workflow.steps[0]
                  .delayHours *
                  HOUR_MS,
            ).toISOString(),
            log: [],
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        );
      }
    } catch {
      // Best-effort; a workflow hiccup must not break the source action.
    }
  };

  // ---- Worker --------------------------------------------------------

  /** Advances every due run across all tenants. Returns how many advanced. */
  async runDue(
    limit = 100,
  ): Promise<number> {
    const nowMs = this.now();
    const refs =
      await this.repository.dueRuns(
        new Date(nowMs).toISOString(),
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
        // Leave for the next tick.
      }
    }

    return processed;
  }

  private async processOne(
    runId: string,
    nowMs: number,
  ): Promise<void> {
    const run =
      await this.repository.getRun(
        runId,
      );

    if (
      !run ||
      run.status !== "running"
    ) {
      return;
    }

    const nowIso = new Date(
      nowMs,
    ).toISOString();
    const workflow =
      await this.repository.get(
        run.workflowId,
      );

    // Paused or deleted workflow: defer paused; fail deleted.
    if (!workflow) {
      await this.repository.updateRun({
        ...run,
        status: "failed",
        updatedAt: nowIso,
        log: [
          ...run.log,
          {
            stepIndex: run.stepIndex,
            action: "-",
            at: nowIso,
            result:
              "workflow deleted",
          },
        ],
      });

      return;
    }

    if (workflow.status !== "active") {
      await this.repository.updateRun({
        ...run,
        nextRunAt: new Date(
          nowMs + HOUR_MS,
        ).toISOString(),
        updatedAt: nowIso,
      });

      return;
    }

    const step =
      workflow.steps[run.stepIndex];

    if (!step) {
      await this.repository.updateRun({
        ...run,
        status: "completed",
        updatedAt: nowIso,
      });

      return;
    }

    const result =
      await this.executeAction(
        step,
        run,
      );

    const nextIndex =
      run.stepIndex + 1;
    const nextStep =
      workflow.steps[nextIndex];

    await this.repository.updateRun({
      ...run,
      stepIndex: nextIndex,
      status: nextStep
        ? "running"
        : "completed",
      nextRunAt: nextStep
        ? new Date(
            nowMs +
              nextStep.delayHours *
                HOUR_MS,
          ).toISOString()
        : run.nextRunAt,
      log: [
        ...run.log,
        {
          stepIndex: run.stepIndex,
          action: step.type,
          at: nowIso,
          result,
        },
      ],
      updatedAt: nowIso,
    });
  }

  /**
   * Runs one action through an existing service and returns a short result
   * string for the run log. Never throws.
   */
  private async executeAction(
    step: WorkflowStep,
    run: WorkflowRunRecord,
  ): Promise<string> {
    try {
      const cfg = step.config ?? {};

      if (step.type === "notify") {
        const recipients =
          (await this.deps.resolveNotifyRecipients?.()) ??
          [];
        await Promise.all(
          recipients.map((userId) =>
            this.deps.notifications?.create(
              {
                userId,
                type: "workflow.notify",
                title: str(
                  cfg.title,
                  "Workflow notification",
                ),
                body: str(
                  cfg.body,
                  "",
                ),
              },
            ),
          ),
        );

        return `notified ${recipients.length} recipient(s)`;
      }

      if (step.type === "email") {
        const to =
          str(cfg.to, "") ||
          run.contextEmail;
        if (!to) {
          return "skipped: no recipient";
        }
        await this.deps.email?.sendQuietly(
          {
            to,
            subject: str(
              cfg.subject,
              "A message",
            ),
            body: personalize(
              str(cfg.body, ""),
              run,
            ),
          },
        );

        return `emailed ${to}`;
      }

      if (
        step.type ===
        "enroll_sequence"
      ) {
        const sequenceId = str(
          cfg.sequenceId,
          "",
        );
        if (
          !sequenceId ||
          !run.contextEmail
        ) {
          return "skipped: no sequence or recipient";
        }
        await this.deps.drip?.enroll(
          sequenceId,
          run.contextEmail,
          run.contextName,
        );

        return "enrolled in sequence";
      }

      if (step.type === "note") {
        await this.deps.activity?.record(
          {
            actorType: "system",
            type: "workflow.note",
            subjectType:
              run.subjectType,
            subjectId: run.subjectId,
            title: str(
              cfg.text,
              "Workflow note",
            ),
          },
        );

        return "note recorded";
      }

      return "unknown action";
    } catch (error) {
      return `failed: ${error instanceof Error ? error.message : "error"}`;
    }
  }
}

function str(
  value: unknown,
  fallback: string,
): string {
  return typeof value === "string" &&
    value.trim()
    ? value
    : fallback;
}

function personalize(
  body: string,
  run: WorkflowRunRecord,
): string {
  return body
    .replace(
      /\{\{\s*name\s*\}\}/gi,
      run.contextName || "there",
    )
    .replace(
      /\{\{\s*email\s*\}\}/gi,
      run.contextEmail || "",
    );
}

/** Validates + normalizes step definitions (closed action set only). */
function sanitizeSteps(
  steps: WorkflowStep[] | undefined,
): WorkflowStep[] {
  if (!Array.isArray(steps)) {
    return [];
  }

  const out: WorkflowStep[] = [];

  for (const step of steps.slice(
    0,
    25,
  )) {
    if (
      !WORKFLOW_ACTION_TYPES.includes(
        step?.type,
      )
    ) {
      continue;
    }

    const delayHours = Number(
      step.delayHours,
    );

    out.push({
      id: randomUUID(),
      type: step.type,
      delayHours:
        Number.isFinite(delayHours) &&
        delayHours >= 0
          ? delayHours
          : 0,
      config:
        step.config &&
        typeof step.config ===
          "object"
          ? (step.config as Record<
              string,
              unknown
            >)
          : {},
    });
  }

  return out;
}
