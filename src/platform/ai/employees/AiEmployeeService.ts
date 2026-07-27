import { randomUUID } from "node:crypto";

import { AiEmployeeRepository } from "./AiEmployeeRepository";
import type {
  AiEmployeeRecord,
  CreateAiEmployeeRequest,
  UpdateAiEmployeeRequest,
} from "./AiEmployeeTypes";

export class AiEmployeeValidationError extends Error {}
export class AiEmployeeNotFoundError extends Error {}

const PERSONA_MAX = 4000;
const MAX_TOOLS = 64;

export interface AiEmployeeServiceOptions {
  now?: () => number;
}

/**
 * Manages a tenant's saved AI assistants. Everything is tenant-scoped through
 * the repository. The service validates input but does not itself run tools —
 * the {@link ../console/AiConsoleService} applies an employee's persona and
 * tool whitelist when a conversation runs "as" that employee, always
 * intersecting with the acting user's role permissions.
 */
export class AiEmployeeService {
  private readonly now: () => number;

  constructor(
    private readonly repository = new AiEmployeeRepository(),
    private readonly deps: AiEmployeeServiceOptions = {},
  ) {
    this.now =
      deps.now ?? (() => Date.now());
  }

  async create(
    request: CreateAiEmployeeRequest,
  ): Promise<AiEmployeeRecord> {
    const name = request.name?.trim();

    if (!name) {
      throw new AiEmployeeValidationError(
        "An AI employee needs a name.",
      );
    }

    const now = new Date(
      this.now(),
    ).toISOString();

    return this.repository.create({
      id: randomUUID(),
      name,
      title:
        request.title?.trim() ||
        "Assistant",
      persona: clampPersona(
        request.persona,
      ),
      toolNames: cleanTools(
        request.toolNames,
      ),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  async list(): Promise<
    readonly AiEmployeeRecord[]
  > {
    return this.repository.list();
  }

  async get(
    id: string,
  ): Promise<AiEmployeeRecord> {
    const employee =
      await this.repository.get(id);

    if (!employee) {
      throw new AiEmployeeNotFoundError(
        "AI employee not found.",
      );
    }

    return employee;
  }

  async update(
    id: string,
    changes: UpdateAiEmployeeRequest,
  ): Promise<AiEmployeeRecord> {
    const employee =
      await this.get(id);

    return this.repository.update({
      ...employee,
      name:
        changes.name?.trim() ||
        employee.name,
      title:
        changes.title?.trim() ||
        employee.title,
      persona:
        changes.persona === undefined
          ? employee.persona
          : clampPersona(
              changes.persona,
            ),
      toolNames:
        changes.toolNames === undefined
          ? employee.toolNames
          : cleanTools(
              changes.toolNames,
            ),
      status:
        changes.status === "archived" ||
        changes.status === "active"
          ? changes.status
          : employee.status,
      updatedAt: new Date(
        this.now(),
      ).toISOString(),
    });
  }

  async remove(
    id: string,
  ): Promise<void> {
    await this.get(id);
    await this.repository.delete(id);
  }
}

function clampPersona(
  persona: string | undefined,
): string {
  return (persona ?? "")
    .trim()
    .slice(0, PERSONA_MAX);
}

function cleanTools(
  toolNames: string[] | undefined,
): string[] {
  if (!Array.isArray(toolNames)) {
    return [];
  }

  const seen = new Set<string>();

  for (const name of toolNames) {
    if (
      typeof name === "string" &&
      name.trim()
    ) {
      seen.add(name.trim());
    }
  }

  return [...seen].slice(0, MAX_TOOLS);
}
