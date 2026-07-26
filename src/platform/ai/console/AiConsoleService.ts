import { randomUUID } from "node:crypto";

import type { PlatformUserRole } from "../../users/PlatformUser";
import type { AiUsageRepository } from "../AiUsageRepository";
import { estimateCostMicros } from "../AiUsageEvent";
import type { OrganizationAiSettingsService } from "../OrganizationAiSettingsService";
import type { AiToolRegistry } from "../tools/AiToolRegistry";
import type { AiToolService } from "../tools/AiToolService";
import type {
  AiToolContext,
  AiToolInvocationRecord,
} from "../tools/AiToolTypes";
import {
  DisconnectedChatClient,
  type ChatClient,
  type ChatMessage,
  type ChatToolSpec,
} from "./ChatClient";

/** A single turn of the visible conversation, from the client. */
export interface AiConsoleTurn {
  role: "user" | "assistant";
  content: string;
}

/** One thing the assistant did while answering (for a transparent trail). */
export interface AiConsoleStep {
  tool: string;
  mode: "read" | "write";
  summary: string;
}

export interface AiConsoleReply {
  /** Whether an AI client was available to answer at all. */
  available: boolean;
  reply: string;
  /** Read tools that ran + write tools proposed, in order. */
  steps: AiConsoleStep[];
  /** Write proposals now awaiting the user's confirmation. */
  pending: AiToolInvocationRecord[];
}

export type ChatClientFactory = (input: {
  provider: string;
  apiKey: string;
  model?: string;
}) => ChatClient;

export interface AiConsoleServiceOptions {
  aiSettings?: OrganizationAiSettingsService;
  aiUsage?: AiUsageRepository;
  /** Builds a client from a tenant's own key. */
  clientFactory?: ChatClientFactory;
  /** The platform's included client, used when a tenant has no own key. */
  defaultClient?: ChatClient;
  /** Max plan→act rounds before the assistant must answer (loop guard). */
  maxRounds?: number;
}

/**
 * The AI Command Center. A user describes what they want; the assistant plans
 * using the {@link AiToolRegistry}'s descriptors, runs **read** tools itself to
 * gather context, and routes **write** tools through {@link AiToolService} —
 * which records them as pending proposals the user must confirm. So the model
 * can gather information freely but can never change data on its own; a human
 * always approves writes. The whole exchange runs in the caller's tenant
 * scope, and usage is metered like every other AI call.
 */
export class AiConsoleService {
  private readonly maxRounds: number;

  constructor(
    private readonly registry: AiToolRegistry,
    private readonly aiTools: AiToolService,
    private readonly deps: AiConsoleServiceOptions = {},
  ) {
    this.maxRounds =
      deps.maxRounds ?? 4;
  }

  async chat(
    message: string,
    history: AiConsoleTurn[],
    ctx: AiToolContext,
  ): Promise<AiConsoleReply> {
    const client =
      await this.resolveClient();

    if (
      !client ||
      !client.isConnected()
    ) {
      return {
        available: false,
        reply:
          "The AI assistant isn't set up yet. An owner can add an AI key in settings to enable it.",
        steps: [],
        pending: [],
      };
    }

    const tools = this.toolSpecs(
      ctx.role,
    );
    // OpenAI tool names can't contain dots, but registry names do
    // (e.g. "crm.leads.list"). Map the wire name the model sees back to the
    // real registry name when it calls a tool.
    const realName = new Map<
      string,
      string
    >();
    for (const t of this.registry.describe(
      ctx.role,
    )) {
      realName.set(
        wireName(t.name),
        t.name,
      );
    }
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...history
        .slice(-12)
        .map((t) => ({
          role: t.role,
          content: t.content,
        })),
      {
        role: "user",
        content: message,
      },
    ];

    const steps: AiConsoleStep[] = [];
    const pending: AiToolInvocationRecord[] =
      [];

    for (
      let round = 0;
      round < this.maxRounds;
      round += 1
    ) {
      const completion =
        await client.complete(
          messages,
          tools,
        );

      await this.meter(completion);

      if (
        !completion.toolCalls.length
      ) {
        return {
          available: true,
          reply:
            completion.content ||
            "Done.",
          steps,
          pending,
        };
      }

      // Record the assistant's tool request, then answer each call.
      messages.push({
        role: "assistant",
        content: completion.content,
        toolCalls:
          completion.toolCalls,
      });

      for (const call of completion.toolCalls) {
        const name =
          realName.get(call.name) ??
          call.name;
        const tool =
          this.registry.get(name);
        const mode =
          tool?.mode ?? "read";

        try {
          const outcome =
            await this.aiTools.invoke(
              name,
              call.arguments,
              ctx,
            );

          if (
            outcome.status ===
            "pending"
          ) {
            pending.push(
              outcome.invocation,
            );
            steps.push({
              tool: name,
              mode: "write",
              summary:
                "Proposed — awaiting your confirmation.",
            });
            messages.push({
              role: "tool",
              toolCallId: call.id,
              content:
                "This action changes data, so it was queued for the user to confirm. Do NOT assume it happened; tell the user it's awaiting their confirmation.",
            });
          } else {
            const summary =
              outcome.result
                ?.summary ?? "Done.";
            steps.push({
              tool: name,
              mode: "read",
              summary,
            });
            messages.push({
              role: "tool",
              toolCallId: call.id,
              content: toolResultText(
                outcome.result?.data,
                summary,
              ),
            });
          }
        } catch (error) {
          steps.push({
            tool: name,
            mode,
            summary: `Couldn't run: ${errorText(error)}`,
          });
          messages.push({
            role: "tool",
            toolCallId: call.id,
            content: `Error: ${errorText(error)}`,
          });
        }
      }
    }

    // Ran out of rounds — answer from what we have rather than looping.
    return {
      available: true,
      reply: pending.length
        ? "I've prepared the action(s) above — confirm the ones you want me to run."
        : "I gathered what I could, but couldn't fully complete that. Try rephrasing.",
      steps,
      pending,
    };
  }

  /** The tools the given role may use, as chat tool specs. */
  private toolSpecs(
    role: PlatformUserRole,
  ): ChatToolSpec[] {
    return this.registry
      .describe(role)
      .map((t) => {
        const properties: ChatToolSpec["parameters"]["properties"] =
          {};
        const required: string[] = [];

        for (const p of t.params) {
          properties[p.name] = {
            type: p.type,
            description:
              p.description,
          };
          if (p.required)
            required.push(p.name);
        }

        return {
          name: wireName(t.name),
          description:
            t.mode === "write"
              ? `${t.description} (Changes data — will require user confirmation.)`
              : t.description,
          parameters: {
            type: "object" as const,
            properties,
            required,
          },
        };
      });
  }

  /** Resolves the tenant's own client, else the platform default. */
  private async resolveClient(): Promise<
    ChatClient | undefined
  > {
    const settings = this.deps
      .aiSettings
      ? await this.deps.aiSettings.getRaw()
      : undefined;

    if (
      settings?.apiKey &&
      this.deps.clientFactory
    ) {
      return this.deps.clientFactory({
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
      });
    }

    return (
      this.deps.defaultClient ??
      new DisconnectedChatClient()
    );
  }

  /** Meters a completion's token usage so cost is always visible. */
  private async meter(completion: {
    model?: string;
    usage?: {
      inputTokens: number;
      outputTokens: number;
    };
  }): Promise<void> {
    if (
      !this.deps.aiUsage ||
      !completion.usage
    ) {
      return;
    }

    const settings = this.deps
      .aiSettings
      ? await this.deps.aiSettings.getRaw()
      : undefined;
    const ownKey = Boolean(
      settings?.apiKey,
    );
    const model =
      completion.model ||
      settings?.model ||
      "unknown";

    try {
      await this.deps.aiUsage.record({
        id: randomUUID(),
        kind: "console_chat",
        provider: ownKey
          ? (settings?.provider ??
            "unknown")
          : "platform",
        model,
        inputTokens:
          completion.usage
            .inputTokens,
        outputTokens:
          completion.usage
            .outputTokens,
        costMicros:
          estimateCostMicros(
            model,
            completion.usage
              .inputTokens,
            completion.usage
              .outputTokens,
          ),
        ownKey,
        createdAt:
          new Date().toISOString(),
      });
    } catch {
      // Metering must never break the conversation.
    }
  }
}

/**
 * Registry names use dots ("crm.leads.list"), but OpenAI tool names must match
 * ^[a-zA-Z0-9_-]+$. Map dots to double underscores for the wire; the reverse
 * map is rebuilt per request from the registry.
 */
function wireName(name: string): string {
  return name.replace(/\./g, "__");
}

function toolResultText(
  data: unknown,
  summary: string,
): string {
  if (data === undefined)
    return summary;

  let json = "";
  try {
    json = JSON.stringify(data);
  } catch {
    json = "";
  }

  // Keep tool output bounded so a big list can't blow up the next request.
  if (json.length > 4000)
    json = `${json.slice(0, 4000)}…`;

  return json
    ? `${summary}\n${json}`
    : summary;
}

function errorText(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "error";
}

const SYSTEM_PROMPT =
  "You are the AI Command Center for a business operating system. Help the " +
  "user run their business by answering questions and taking actions through " +
  "the provided tools. Use read tools to gather real data before answering — " +
  "never invent numbers or records. Tools whose description says they change " +
  "data are queued for the user to confirm; after calling one, tell the user " +
  "it is awaiting their confirmation rather than claiming it is done. Be " +
  "concise and specific.";
