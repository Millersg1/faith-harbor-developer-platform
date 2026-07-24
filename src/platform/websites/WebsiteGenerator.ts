/**
 * Generates website HTML from a plain-language brief.
 *
 * Kept deliberately separate from the legacy Faith Harbor AIService: that
 * service grounds every request in Faith Harbor's identity, which is wrong
 * for a white-label platform where each tenant's (or client's) site must be
 * about *their* business. This generator is tenant-neutral and injectable,
 * so tests never hit a real model and the platform runs fine with no key.
 */

export interface WebsiteBrief {
  /** The site / business name. */
  name: string;
  /** What the site is about (services, tone, audience, …). */
  description: string;
  /** Optional preferred accent color, e.g. "#2dd4bf". */
  accentColor?: string;
}

export interface GeneratedWebsite {
  html: string;
  model?: string;
}

export interface WebsiteGenerator {
  isConnected(): boolean;
  generate(
    brief: WebsiteBrief,
  ): Promise<GeneratedWebsite>;
}

/**
 * Minimal fetch contract so the generator can be tested with a stub.
 */
export interface GeneratorFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type GeneratorFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<GeneratorFetchResponse>;

/**
 * The default when no AI key is configured: reports "not connected" and
 * refuses to generate, rather than pretending.
 */
export class DisconnectedWebsiteGenerator
  implements WebsiteGenerator
{
  isConnected(): boolean {
    return false;
  }

  async generate(
    _brief: WebsiteBrief,
  ): Promise<GeneratedWebsite> {
    throw new Error(
      "AI website generation isn't set up yet. Add an AI key to enable it.",
    );
  }
}

export interface OpenAiWebsiteGeneratorConfig {
  apiKey: string;
  model?: string;
}

/**
 * Generates a complete, self-contained HTML page through the OpenAI
 * Chat Completions REST API — no SDK dependency (built-in fetch), matching
 * how the platform already talks to Stripe.
 */
export class OpenAiWebsiteGenerator
  implements WebsiteGenerator
{
  private readonly model: string;

  constructor(
    private readonly config: OpenAiWebsiteGeneratorConfig,
    private readonly fetchFn: GeneratorFetch =
      globalThis.fetch as unknown as GeneratorFetch,
  ) {
    this.model =
      config.model || "gpt-4o-mini";
  }

  isConnected(): boolean {
    return true;
  }

  async generate(
    brief: WebsiteBrief,
  ): Promise<GeneratedWebsite> {
    const body = JSON.stringify({
      model: this.model,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content:
            buildUserPrompt(brief),
        },
      ],
    });

    const response =
      await this.fetchFn(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type":
              "application/json",
          },
          body,
        },
      );

    const text =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `AI generation failed (status ${response.status}).`,
      );
    }

    const parsed = JSON.parse(
      text,
    ) as {
      model?: string;
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content =
      parsed.choices?.[0]?.message
        ?.content ?? "";

    const html =
      extractHtml(content);

    if (!html) {
      throw new Error(
        "The AI did not return a usable website.",
      );
    }

    return {
      html,
      model: parsed.model,
    };
  }
}

const SYSTEM_PROMPT =
  "You are an expert web designer and front-end developer. You produce a " +
  "single, complete, self-contained, responsive HTML5 document with all CSS " +
  "inline in a <style> tag and no external assets, scripts, or fonts. The " +
  "design must be modern, polished, and specific to the business described. " +
  "Return ONLY the HTML document — no explanation, no markdown fences.";

function buildUserPrompt(
  brief: WebsiteBrief,
): string {
  const lines = [
    `Build a marketing website for: ${brief.name}.`,
    `About the business: ${brief.description}`,
  ];

  if (brief.accentColor) {
    lines.push(
      `Use ${brief.accentColor} as the accent color.`,
    );
  }

  lines.push(
    "Include a hero, a short about section, 3 services/features, a call to action, and a footer.",
    "Use realistic placeholder copy tailored to the business — never lorem ipsum.",
  );

  return lines.join("\n");
}

/**
 * Pulls the HTML document out of a model response, tolerating a stray
 * ```html fence if the model added one despite instructions.
 */
export function extractHtml(
  content: string,
): string {
  const trimmed = content.trim();

  const fenced =
    /```(?:html)?\s*([\s\S]*?)```/i.exec(
      trimmed,
    );

  const candidate = fenced
    ? fenced[1].trim()
    : trimmed;

  return /<html[\s>]|<!doctype html/i.test(
    candidate,
  )
    ? candidate
    : "";
}
