import { randomUUID } from "node:crypto";

import type { PlatformUserRole } from "../../users/PlatformUser";
import type { AuditService } from "../../audit/AuditService";
import { AiToolInvocationRepository } from "./AiToolInvocationRepository";
import {
  AiToolNotFoundError,
  AiToolRegistry,
  AiToolValidationError,
} from "./AiToolRegistry";
import type {
  AiToolContext,
  AiToolDescriptor,
  AiToolInvocationRecord,
  AiToolResult,
} from "./AiToolTypes";

export class AiToolForbiddenError extends Error {}

export {
  AiToolNotFoundError,
  AiToolValidationError,
};

export interface AiToolServiceOptions {
  audit?: AuditService;
  now?: () => number;
}

/**
 * The outcome of invoking a tool. A `read` tool (or a confirmed write) comes
 * back `executed` with its result; a `write` tool comes back `pending` with
 * the recorded invocation a human must confirm.
 */
export interface AiToolInvokeOutcome {
  status: "executed" | "pending";
  invocation: AiToolInvocationRecord;
  result?: AiToolResult;
}

/**
 * Runs registry tools safely: it enforces role, validates args, executes
 * reads immediately, records writes as pending proposals, and audits every
 * write that actually runs. All execution happens inside the caller's tenant
 * scope (the repository and every wrapped service are tenant-scoped), so a
 * tool can only ever touch the acting organization's data.
 */
export class AiToolService {
  private readonly now: () => number;

  constructor(
    private readonly registry: AiToolRegistry,
    private readonly invocations = new AiToolInvocationRepository(),
    private readonly deps: AiToolServiceOptions = {},
  ) {
    this.now =
      deps.now ?? (() => Date.now());
  }

  /** The tools the given role may use, as safe descriptors. */
  describe(
    role: PlatformUserRole,
  ): AiToolDescriptor[] {
    return this.registry.describe(role);
  }

  async listInvocations(
    limit?: number,
  ): Promise<
    readonly AiToolInvocationRecord[]
  > {
    return this.invocations.list(limit);
  }

  /**
   * Invoke a tool by name. Read tools run now; write tools are recorded
   * `pending` and NOT executed until {@link confirm}.
   */
  async invoke(
    name: string,
    rawArgs: Record<string, unknown>,
    ctx: AiToolContext,
  ): Promise<AiToolInvokeOutcome> {
    const tool = this.registry.get(name);

    if (!tool) {
      throw new AiToolNotFoundError(
        `Unknown tool: ${name}`,
      );
    }

    if (
      !this.registry.allowsRole(
        tool,
        ctx.role,
      )
    ) {
      throw new AiToolForbiddenError(
        `Your role can't use "${name}".`,
      );
    }

    const args =
      this.registry.validate(
        tool,
        rawArgs ?? {},
      );
    const nowIso = new Date(
      this.now(),
    ).toISOString();

    if (tool.mode === "write") {
      const invocation =
        await this.invocations.create({
          id: randomUUID(),
          toolName: tool.name,
          mode: "write",
          args,
          status: "pending",
          requestedBy: ctx.actorId,
          createdAt: nowIso,
          updatedAt: nowIso,
        });

      return {
        status: "pending",
        invocation,
      };
    }

    const result = await this.runTool(
      name,
      args,
      ctx,
    );
    const invocation =
      await this.invocations.create({
        id: randomUUID(),
        toolName: tool.name,
        mode: "read",
        args,
        status: result.ok
          ? "executed"
          : "failed",
        summary: result.summary,
        requestedBy: ctx.actorId,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

    return {
      status: "executed",
      invocation,
      result,
    };
  }

  /**
   * Confirm and execute a previously-proposed write tool. Only `pending`
   * invocations run; the result is audited.
   */
  async confirm(
    invocationId: string,
    ctx: AiToolContext,
  ): Promise<AiToolInvokeOutcome> {
    const invocation =
      await this.invocations.get(
        invocationId,
      );

    if (!invocation) {
      throw new AiToolNotFoundError(
        "Invocation not found.",
      );
    }

    if (
      invocation.status !== "pending"
    ) {
      throw new AiToolValidationError(
        "This action is no longer pending.",
      );
    }

    const tool = this.registry.get(
      invocation.toolName,
    );

    if (
      !tool ||
      !this.registry.allowsRole(
        tool,
        ctx.role,
      )
    ) {
      throw new AiToolForbiddenError(
        "Your role can't confirm this action.",
      );
    }

    const result = await this.runTool(
      invocation.toolName,
      invocation.args,
      ctx,
    );

    const updated =
      await this.invocations.update({
        ...invocation,
        status: result.ok
          ? "executed"
          : "failed",
        summary: result.summary,
        updatedAt: new Date(
          this.now(),
        ).toISOString(),
      });

    await this.deps.audit?.record({
      action: "ai.tool.executed",
      actorType: "user",
      actorId: ctx.actorId,
      actorLabel: ctx.actorLabel,
      targetType: "ai_tool",
      targetId: invocation.toolName,
      outcome: result.ok
        ? "success"
        : "failure",
      metadata: {
        invocationId: invocation.id,
        summary: result.summary,
      },
    });

    return {
      status: "executed",
      invocation: updated,
      result,
    };
  }

  /** Decline a pending write proposal without running it. */
  async reject(
    invocationId: string,
    ctx: AiToolContext,
  ): Promise<AiToolInvocationRecord> {
    const invocation =
      await this.invocations.get(
        invocationId,
      );

    if (!invocation) {
      throw new AiToolNotFoundError(
        "Invocation not found.",
      );
    }

    if (
      invocation.status !== "pending"
    ) {
      throw new AiToolValidationError(
        "This action is no longer pending.",
      );
    }

    const updated =
      await this.invocations.update({
        ...invocation,
        status: "rejected",
        summary: "Declined.",
        updatedAt: new Date(
          this.now(),
        ).toISOString(),
      });

    await this.deps.audit?.record({
      action: "ai.tool.rejected",
      actorType: "user",
      actorId: ctx.actorId,
      actorLabel: ctx.actorLabel,
      targetType: "ai_tool",
      targetId: invocation.toolName,
      outcome: "success",
      metadata: {
        invocationId: invocation.id,
      },
    });

    return updated;
  }

  /** Runs a tool's handler, turning any throw into a failed result. */
  private async runTool(
    name: string,
    args: Record<string, unknown>,
    ctx: AiToolContext,
  ): Promise<AiToolResult> {
    const tool = this.registry.get(name);

    if (!tool) {
      return {
        ok: false,
        summary: `Unknown tool: ${name}`,
      };
    }

    try {
      return await tool.run(args, ctx);
    } catch (error) {
      return {
        ok: false,
        summary: `Tool failed: ${
          error instanceof Error
            ? error.message
            : "error"
        }`,
      };
    }
  }
}
