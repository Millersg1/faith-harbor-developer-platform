import type {
  EmailMessage,
  EmailResult,
} from "./EmailTypes";

/**
 * Delivers an email. Implementations decide how (log-only, HTTP
 * API, SMTP, ...). The service depends only on this interface.
 */
export interface EmailTransport {
  send(
    message: EmailMessage,
  ): Promise<EmailResult>;
}

/**
 * The safe default transport. It records the message (to the
 * outbox, by the service) and logs it, but never actually sends.
 * Used whenever no email provider is configured.
 */
export class LoggingEmailTransport
  implements EmailTransport
{
  async send(
    message: EmailMessage,
  ): Promise<EmailResult> {
    // Intentionally does not deliver. The service persists the
    // message to the outbox so nothing is lost.
    console.log(
      `[email:logged] to=${message.to} subject=${message.subject}`,
    );

    return {
      status: "logged",
      provider: "logging",
    };
  }
}

/**
 * Minimal fetch contract so the transport can be tested with a stub.
 */
export interface EmailFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type EmailFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<EmailFetchResponse>;

export interface HttpEmailConfig {
  apiUrl: string;
  apiKey: string;
}

/**
 * Delivers email through a JSON HTTP email API (for example
 * Resend or a compatible provider) using the built-in fetch. No
 * external dependency is required.
 */
export class HttpEmailTransport
  implements EmailTransport
{
  constructor(
    private readonly config: HttpEmailConfig,
    private readonly fetchFn: EmailFetch =
      globalThis.fetch as unknown as EmailFetch,
  ) {}

  async send(
    message: EmailMessage,
  ): Promise<EmailResult> {
    try {
      const response =
        await this.fetchFn(
          this.config.apiUrl,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${this.config.apiKey}`,
            },
            body: JSON.stringify({
              from: message.from,
              to: message.to,
              subject:
                message.subject,
              text: message.body,
            }),
          },
        );

      if (!response.ok) {
        return {
          status: "failed",
          provider: "http",
          error:
            `Email provider returned status ${response.status}.`,
        };
      }

      return {
        status: "sent",
        provider: "http",
      };
    } catch (error) {
      return {
        status: "failed",
        provider: "http",
        error:
          error instanceof Error
            ? error.message
            : "Email delivery failed.",
      };
    }
  }
}
