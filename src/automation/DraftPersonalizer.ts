/**
 * The parts of a draft an AI may personalize.
 */
export interface PersonalizationInput {
  to: string;
  subject: string;
  body: string;
  trigger: string;
}

/**
 * Rewrites a draft email body to be warmer and more personal.
 *
 * Implementations must fail safe: any error, timeout, or empty result
 * returns null so the caller keeps the original template. The result
 * is always subject to human approval before anything is sent.
 */
export interface DraftPersonalizer {
  personalize(
    input: PersonalizationInput,
  ): Promise<string | null>;
}

/**
 * The narrow slice of the AI service the personalizer needs. Kept
 * minimal so automation does not depend on the whole AI layer.
 */
export interface PersonalizerAI {
  generate(request: {
    capability: "writing";
    prompt: string;
  }): Promise<{ content: string }>;
}

/**
 * Personalizes drafts with the configured AI provider.
 *
 * The prompt asks only for a warmer rewrite of an already-truthful
 * template — it must not invent facts, pricing, dates, or promises.
 * Every call is time-bounded so a slow or unreachable provider can
 * never hold up draft creation, and any failure falls back to the
 * template.
 */
export class AiDraftPersonalizer
  implements DraftPersonalizer
{
  constructor(
    private readonly ai: PersonalizerAI,
    private readonly timeoutMs = 20_000,
  ) {}

  async personalize(
    input: PersonalizationInput,
  ): Promise<string | null> {
    try {
      const result =
        await this.withTimeout(
          this.ai.generate({
            capability: "writing",
            prompt:
              this.buildPrompt(input),
          }),
        );

      const text =
        result.content?.trim();

      return text && text.length > 0
        ? text
        : null;
    } catch {
      // Fail safe: keep the template.
      return null;
    }
  }

  private buildPrompt(
    input: PersonalizationInput,
  ): string {
    return [
      "You are helping Faith Harbor Web Solutions write a warm, professional email.",
      "Rewrite the email body below so it feels personal and caring, in a ministry-minded but not preachy voice.",
      "",
      "Strict rules:",
      "- Keep every fact exactly as given. Do NOT invent names, prices, dates, guarantees, service levels, or commitments.",
      "- Do not add links or signatures that are not already present.",
      "- Keep it concise. Return ONLY the rewritten email body, nothing else.",
      "",
      `Recipient: ${input.to}`,
      `Subject: ${input.subject}`,
      "",
      "Email body to rewrite:",
      input.body,
    ].join("\n");
  }

  private withTimeout<T>(
    promise: Promise<T>,
  ): Promise<T> {
    return new Promise<T>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => {
            reject(
              new Error(
                "AI personalization timed out.",
              ),
            );
          },
          this.timeoutMs,
        );

        promise
          .then((value) => {
            clearTimeout(timer);
            resolve(value);
          })
          .catch((error) => {
            clearTimeout(timer);
            reject(error);
          });
      },
    );
  }
}
