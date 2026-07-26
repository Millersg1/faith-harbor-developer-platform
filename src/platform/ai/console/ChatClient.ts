/**
 * A provider-neutral chat client with tool-calling, built on an
 * OpenAI-compatible Chat Completions REST API (no SDK — built-in fetch),
 * mirroring {@link ../../websites/WebsiteGenerator}. It drives OpenAI,
 * OpenRouter, or a tenant's own key, and is injectable so tests never hit a
 * real model and the platform runs fine with no key configured.
 */

export interface ChatToolSpec {
  name: string;
  description: string;
  /** JSON-Schema object describing the tool's parameters. */
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
      }
    >;
    required: string[];
  };
}

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role:
    | "system"
    | "user"
    | "assistant"
    | "tool";
  content: string;
  /** Present on assistant turns that requested tools. */
  toolCalls?: ChatToolCall[];
  /** Present on tool-result turns — the call this answers. */
  toolCallId?: string;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatCompletion {
  content: string;
  toolCalls: ChatToolCall[];
  model?: string;
  usage?: ChatUsage;
}

export interface ChatClient {
  isConnected(): boolean;
  complete(
    messages: ChatMessage[],
    tools: ChatToolSpec[],
  ): Promise<ChatCompletion>;
}

/** Minimal fetch contract so the client can be tested with a stub. */
export interface ChatFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type ChatFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<ChatFetchResponse>;

/**
 * The default when no AI key is configured: reports "not connected" and
 * refuses to run, rather than pretending to be an assistant.
 */
export class DisconnectedChatClient
  implements ChatClient
{
  isConnected(): boolean {
    return false;
  }

  async complete(): Promise<ChatCompletion> {
    throw new Error(
      "The AI assistant isn't set up yet. Add an AI key in settings to enable it.",
    );
  }
}

export interface OpenAiChatClientConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class OpenAiChatClient
  implements ChatClient
{
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(
    private readonly config: OpenAiChatClientConfig,
    private readonly fetchFn: ChatFetch =
      globalThis.fetch as unknown as ChatFetch,
  ) {
    this.model =
      config.model || "gpt-4o-mini";
    this.baseUrl = (
      config.baseUrl ||
      "https://api.openai.com/v1"
    ).replace(/\/+$/, "");
  }

  isConnected(): boolean {
    return true;
  }

  async complete(
    messages: ChatMessage[],
    tools: ChatToolSpec[],
  ): Promise<ChatCompletion> {
    const body: Record<
      string,
      unknown
    > = {
      model: this.model,
      temperature: 0.2,
      messages: messages.map(
        toWireMessage,
      ),
    };

    if (tools.length) {
      body.tools = tools.map(
        (t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }),
      );
      body.tool_choice = "auto";
    }

    const response =
      await this.fetchFn(
        `${this.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(body),
        },
      );

    const text =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `AI request failed (status ${response.status}).`,
      );
    }

    return parseCompletion(text);
  }
}

function toWireMessage(
  m: ChatMessage,
): Record<string, unknown> {
  if (
    m.role === "assistant" &&
    m.toolCalls &&
    m.toolCalls.length
  ) {
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.toolCalls.map(
        (c) => ({
          id: c.id,
          type: "function",
          function: {
            name: c.name,
            arguments: JSON.stringify(
              c.arguments,
            ),
          },
        }),
      ),
    };
  }

  if (m.role === "tool") {
    return {
      role: "tool",
      content: m.content,
      tool_call_id: m.toolCallId,
    };
  }

  return {
    role: m.role,
    content: m.content,
  };
}

function parseCompletion(
  text: string,
): ChatCompletion {
  const parsed = JSON.parse(text) as {
    model?: string;
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: {
            name?: string;
            arguments?: string;
          };
        }>;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };

  const message =
    parsed.choices?.[0]?.message;
  const toolCalls: ChatToolCall[] = (
    message?.tool_calls ?? []
  ).map((c, i) => ({
    id: c.id || `call_${i}`,
    name: c.function?.name ?? "",
    arguments: parseArgs(
      c.function?.arguments,
    ),
  }));

  const completion: ChatCompletion = {
    content: message?.content ?? "",
    toolCalls,
  };

  if (parsed.model)
    completion.model = parsed.model;
  if (parsed.usage) {
    completion.usage = {
      inputTokens:
        parsed.usage.prompt_tokens ??
        0,
      outputTokens:
        parsed.usage
          .completion_tokens ?? 0,
    };
  }

  return completion;
}

function parseArgs(
  raw: string | undefined,
): Record<string, unknown> {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);

    return parsed &&
      typeof parsed === "object"
      ? (parsed as Record<
          string,
          unknown
        >)
      : {};
  } catch {
    return {};
  }
}

const PROVIDER_DEFAULTS: Record<
  string,
  { baseUrl: string; model: string }
> = {
  openai: {
    baseUrl:
      "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  openrouter: {
    baseUrl:
      "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
  },
};

/** Builds a chat client for a provider + key (+ optional model override). */
export function createChatClient(
  input: {
    provider: string;
    apiKey: string;
    model?: string;
  },
  fetchFn?: ChatFetch,
): ChatClient {
  const defaults =
    PROVIDER_DEFAULTS[
      input.provider
    ] ?? PROVIDER_DEFAULTS.openai;

  return new OpenAiChatClient(
    {
      apiKey: input.apiKey,
      model:
        input.model || defaults.model,
      baseUrl: defaults.baseUrl,
    },
    fetchFn,
  );
}
