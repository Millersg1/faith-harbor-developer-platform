import type { PlatformUserRole } from "../../users/PlatformUser";

/**
 * The AI tool registry: the closed, code-defined set of capabilities an AI
 * surface (Command Center, AI Employees) may invoke on a tenant's behalf.
 *
 * Two safety rules are structural, not conventions:
 *  - **Closed set.** Tools are registered in code at startup. A tenant can
 *    never add, edit, or execute arbitrary tool code — only what ships here.
 *  - **Reads run; writes are proposed.** A `read` tool executes immediately.
 *    A `write` tool never mutates on invoke — it records a *pending proposal*
 *    a human must confirm. This is how "the AI can act" stays "the AI can
 *    suggest an action a person approves."
 */
export type AiToolMode = "read" | "write";

export type AiToolParamType =
  | "string"
  | "number"
  | "boolean";

/** One declared, validated input to a tool. */
export interface AiToolParam {
  name: string;
  type: AiToolParamType;
  description: string;
  required?: boolean;
}

/** The safe, model-/client-facing description of a tool (no handler). */
export interface AiToolDescriptor {
  name: string;
  title: string;
  description: string;
  mode: AiToolMode;
  params: AiToolParam[];
  /** Roles allowed to invoke it; omitted means any authenticated user. */
  roles?: PlatformUserRole[];
}

/** What a tool returns when it runs. */
export interface AiToolResult {
  ok: boolean;
  /** A short, human-readable outcome line (shown in the UI + run log). */
  summary: string;
  data?: unknown;
}

/** The caller acting through the AI, resolved from the authenticated request. */
export interface AiToolContext {
  role: PlatformUserRole;
  actorId?: string;
  actorLabel?: string;
}

/**
 * A full tool definition. `run` executes inside the ambient tenant scope and
 * must perform every mutation through an existing tenant-scoped service — it
 * never reaches across tenants and never runs untrusted input as code.
 */
export interface AiToolDefinition
  extends AiToolDescriptor {
  run: (
    args: Record<string, unknown>,
    ctx: AiToolContext,
  ) => Promise<AiToolResult>;
}

export type AiToolInvocationStatus =
  | "executed" // a read tool, or a confirmed write tool, that ran
  | "pending" // a write tool awaiting human confirmation
  | "rejected" // a pending write tool a human declined
  | "failed"; // a tool that threw when it ran

/**
 * A recorded tool invocation. Read tools land here already `executed`; write
 * tools land `pending` and move to `executed`/`failed` on confirm, or
 * `rejected` if declined. Tenant-scoped.
 */
export interface AiToolInvocationRecord {
  id: string;
  organizationId: string;
  toolName: string;
  mode: AiToolMode;
  args: Record<string, unknown>;
  status: AiToolInvocationStatus;
  /** Result summary once it has run (or the rejection/failure reason). */
  summary?: string;
  requestedBy?: string;
  createdAt: string;
  updatedAt: string;
}
