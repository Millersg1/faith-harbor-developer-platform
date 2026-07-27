/**
 * A saved, tenant-scoped AI assistant — an "employee" with a persona and a
 * whitelisted subset of registry tools. Running the Command Center "as" an
 * employee narrows what the assistant is and can do; it can never broaden
 * beyond what the acting user's role already permits (the console intersects
 * the employee's tool list with the role-allowed set).
 */
export interface AiEmployeeRecord {
  id: string;
  organizationId: string;
  name: string;
  /** Job title shown in the UI, e.g. "Sales Assistant". */
  title: string;
  /** Persona / instructions prepended to the system prompt. */
  persona: string;
  /**
   * Registry tool names this employee may use. Empty means "any tool the
   * acting user's role allows" — it never grants more than the role.
   */
  toolNames: string[];
  status: AiEmployeeStatus;
  createdAt: string;
  updatedAt: string;
}

export type AiEmployeeStatus =
  | "active"
  | "archived";

export interface CreateAiEmployeeRequest {
  name: string;
  title?: string;
  persona?: string;
  toolNames?: string[];
}

export interface UpdateAiEmployeeRequest {
  name?: string;
  title?: string;
  persona?: string;
  toolNames?: string[];
  status?: AiEmployeeStatus;
}
