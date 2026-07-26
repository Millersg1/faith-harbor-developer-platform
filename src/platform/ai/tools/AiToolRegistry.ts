import type { PlatformUserRole } from "../../users/PlatformUser";
import type {
  AiToolDefinition,
  AiToolDescriptor,
  AiToolParam,
} from "./AiToolTypes";

export class AiToolValidationError extends Error {}
export class AiToolNotFoundError extends Error {}

/**
 * The in-memory, code-defined catalogue of AI tools. Populated once at
 * startup from {@link buildDefaultAiTools}; there is deliberately no path to
 * register a tool from tenant input, so the set of things the AI can do is
 * fixed and auditable.
 */
export class AiToolRegistry {
  private readonly tools = new Map<
    string,
    AiToolDefinition
  >();

  register(
    definition: AiToolDefinition,
  ): void {
    if (this.tools.has(definition.name)) {
      throw new Error(
        `Duplicate AI tool: ${definition.name}`,
      );
    }

    this.tools.set(
      definition.name,
      definition,
    );
  }

  get(
    name: string,
  ): AiToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * The tools a given role may see/use, as safe descriptors (no handlers).
   * Omitting `role` lists every registered tool.
   */
  describe(
    role?: PlatformUserRole,
  ): AiToolDescriptor[] {
    return [...this.tools.values()]
      .filter(
        (t) =>
          role === undefined ||
          this.allowsRole(t, role),
      )
      .map(toDescriptor)
      .sort((a, b) =>
        a.name < b.name ? -1 : 1,
      );
  }

  allowsRole(
    tool: AiToolDefinition,
    role: PlatformUserRole,
  ): boolean {
    return (
      !tool.roles ||
      tool.roles.includes(role)
    );
  }

  /**
   * Validates raw args against a tool's declared params and returns a clean,
   * typed argument object. Unknown keys are dropped; missing required params
   * or wrong types throw {@link AiToolValidationError} with a clear message.
   */
  validate(
    tool: AiToolDefinition,
    rawArgs: Record<string, unknown>,
  ): Record<string, unknown> {
    const clean: Record<
      string,
      unknown
    > = {};

    for (const param of tool.params) {
      const value = rawArgs[param.name];

      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        if (param.required) {
          throw new AiToolValidationError(
            `Missing required "${param.name}".`,
          );
        }

        continue;
      }

      clean[param.name] = coerce(
        param,
        value,
      );
    }

    return clean;
  }
}

function coerce(
  param: AiToolParam,
  value: unknown,
): unknown {
  if (param.type === "number") {
    const n = Number(value);

    if (!Number.isFinite(n)) {
      throw new AiToolValidationError(
        `"${param.name}" must be a number.`,
      );
    }

    return n;
  }

  if (param.type === "boolean") {
    if (typeof value === "boolean")
      return value;
    if (value === "true") return true;
    if (value === "false") return false;

    throw new AiToolValidationError(
      `"${param.name}" must be true or false.`,
    );
  }

  return String(value);
}

function toDescriptor(
  tool: AiToolDefinition,
): AiToolDescriptor {
  const descriptor: AiToolDescriptor = {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    mode: tool.mode,
    params: tool.params,
  };

  if (tool.roles)
    descriptor.roles = tool.roles;

  return descriptor;
}
