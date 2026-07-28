/**
 * A saved Command Center conversation and its messages. Conversations are
 * **private to the user who created them** within their organization — another
 * user in the same tenant cannot read or change them, and no user can ever see
 * another organization's conversations. (A shared/team model could be layered
 * on later; private-per-creator is the safe default.)
 *
 * We never store hidden chain-of-thought, secrets, or privileged system
 * prompts here — only the user's messages and the assistant's visible replies.
 */
export type AiMessageRole =
  | "user"
  | "assistant"
  | "system"
  | "tool";

export interface AiConversationRecord {
  id: string;
  organizationId: string;
  userId: string;
  aiEmployeeId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversationMessageRecord {
  id: string;
  organizationId: string;
  conversationId: string;
  role: AiMessageRole;
  content: string;
  provider?: string;
  model?: string;
  /** Small, non-sensitive display metadata only (never secrets/CoT). */
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** Derives a short, safe title from the first user message. */
export function deriveConversationTitle(
  firstMessage: string,
): string {
  const trimmed = (
    firstMessage || ""
  )
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) {
    return "New conversation";
  }
  return trimmed.length > 60
    ? trimmed.slice(0, 57) + "…"
    : trimmed;
}
