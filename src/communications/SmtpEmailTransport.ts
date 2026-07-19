import { randomUUID } from "node:crypto";
import { connect as netConnect } from "node:net";
import type { Duplex } from "node:stream";
import { connect as tlsConnect } from "node:tls";

import type { EmailTransport } from "./EmailTransport";
import type {
  EmailMessage,
  EmailResult,
} from "./EmailTypes";

/**
 * Configuration for delivering email through an SMTP server, such as
 * a cPanel mailbox.
 */
export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;

  /**
   * Use implicit TLS from the first byte (SMTPS). Defaults to true on
   * port 465, false otherwise. When false and the server advertises
   * STARTTLS, the connection is upgraded before authenticating.
   */
  secure?: boolean;

  /**
   * Overall send timeout in milliseconds. Defaults to 20 seconds.
   */
  timeoutMs?: number;

  /**
   * Name sent in the EHLO greeting. Defaults to "faith-harbor-os".
   */
  clientName?: string;
}

/**
 * Opens a connection to the SMTP server. Injectable so tests can
 * supply a plain in-process socket instead of a real TLS connection.
 */
export type SmtpConnectionFactory = (
  host: string,
  port: number,
  secure: boolean,
) => Promise<Duplex>;

interface SmtpReply {
  code: number;
  text: string;
}

/**
 * Reads and writes the line-oriented SMTP protocol over one socket.
 */
class SmtpSession {
  private buffer = "";

  private currentLines: string[] = [];

  private readonly ready: SmtpReply[] = [];

  private readonly waiters: Array<{
    resolve: (reply: SmtpReply) => void;
    reject: (error: Error) => void;
  }> = [];

  private failure?: Error;

  constructor(
    private readonly socket: Duplex,
  ) {
    socket.setEncoding("utf8");

    socket.on(
      "data",
      (chunk: string) => {
        this.buffer += chunk;
        this.parse();
      },
    );

    socket.on(
      "error",
      (error: Error) => {
        this.fail(error);
      },
    );

    socket.on("close", () => {
      this.fail(
        new Error(
          "The SMTP connection closed unexpectedly.",
        ),
      );
    });
  }

  /**
   * Sends a command line and asserts the reply code.
   */
  async command(
    line: string,
    expected: number | number[],
  ): Promise<SmtpReply> {
    this.write(line);

    return this.expect(expected);
  }

  /**
   * Reads the next reply and asserts its code.
   */
  async expect(
    expected: number | number[],
  ): Promise<SmtpReply> {
    const reply =
      await this.read();

    const codes =
      Array.isArray(expected)
        ? expected
        : [expected];

    if (
      !codes.includes(reply.code)
    ) {
      throw new Error(
        `SMTP server replied "${reply.code} ${reply.text}" when ${codes.join(" or ")} was expected.`,
      );
    }

    return reply;
  }

  /**
   * Writes a raw line to the socket, appending CRLF.
   */
  write(line: string): void {
    this.socket.write(
      `${line}\r\n`,
    );
  }

  /**
   * Writes raw data without an added line ending.
   */
  writeRaw(data: string): void {
    this.socket.write(data);
  }

  /**
   * Reads the next complete reply from the server.
   */
  private read(): Promise<SmtpReply> {
    if (this.failure) {
      return Promise.reject(
        this.failure,
      );
    }

    const next = this.ready.shift();

    if (next) {
      return Promise.resolve(next);
    }

    return new Promise(
      (resolve, reject) => {
        this.waiters.push({
          resolve,
          reject,
        });
      },
    );
  }

  /**
   * Parses buffered bytes into complete replies. A reply may span
   * several lines; the final line has a space after the status code.
   */
  private parse(): void {
    let newlineIndex: number;

    while (
      (newlineIndex =
        this.buffer.indexOf(
          "\r\n",
        )) !== -1
    ) {
      const line =
        this.buffer.slice(
          0,
          newlineIndex,
        );

      this.buffer =
        this.buffer.slice(
          newlineIndex + 2,
        );

      this.currentLines.push(line);

      const isFinal =
        line.length < 4 ||
        line[3] === " ";

      if (isFinal) {
        const code = Number.parseInt(
          line.slice(0, 3),
          10,
        );

        const text =
          this.currentLines
            .map((entry) =>
              entry.slice(4),
            )
            .join(" ")
            .trim();

        this.currentLines = [];

        this.deliver({
          code,
          text,
        });
      }
    }
  }

  private deliver(
    reply: SmtpReply,
  ): void {
    const waiter =
      this.waiters.shift();

    if (waiter) {
      waiter.resolve(reply);

      return;
    }

    this.ready.push(reply);
  }

  private fail(error: Error): void {
    if (this.failure) {
      return;
    }

    this.failure = error;

    while (this.waiters.length > 0) {
      this.waiters
        .shift()
        ?.reject(error);
    }
  }
}

/**
 * Delivers email through an SMTP server (for example a cPanel
 * mailbox) using only Node's built-in net and tls modules. No
 * external dependency is required, so nothing new has to install on
 * the deployment server.
 */
export class SmtpEmailTransport
  implements EmailTransport
{
  private readonly timeoutMs: number;

  private readonly clientName: string;

  private readonly secure: boolean;

  constructor(
    private readonly config: SmtpConfig,
    private readonly connectFn: SmtpConnectionFactory = defaultConnect,
  ) {
    this.timeoutMs =
      config.timeoutMs ?? 20_000;

    this.clientName =
      config.clientName ??
      "faith-harbor-os";

    this.secure =
      config.secure ??
      config.port === 465;
  }

  async send(
    message: EmailMessage,
  ): Promise<EmailResult> {
    // Reject header/command injection before opening a connection.
    // to/subject can carry lead- or client-supplied text, so a CR/LF
    // must never be allowed to smuggle in an extra header or command.
    try {
      validateMessage(message);
    } catch (error) {
      return this.failure(error);
    }

    let socket: Duplex;

    try {
      socket = await this.connectFn(
        this.config.host,
        this.config.port,
        this.secure,
      );
    } catch (error) {
      return this.failure(error);
    }

    let timer:
      | ReturnType<typeof setTimeout>
      | undefined;

    try {
      const timeout =
        new Promise<never>(
          (_resolve, reject) => {
            timer = setTimeout(
              () => {
                reject(
                  new Error(
                    "The SMTP conversation timed out.",
                  ),
                );
              },
              this.timeoutMs,
            );
          },
        );

      await Promise.race([
        this.converse(
          socket,
          message,
        ),
        timeout,
      ]);

      return {
        status: "sent",
        provider: "smtp",
      };
    } catch (error) {
      return this.failure(error);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }

      socket.destroy();
    }
  }

  /**
   * Runs the full SMTP conversation: greet, authenticate, and send.
   */
  private async converse(
    initialSocket: Duplex,
    message: EmailMessage,
  ): Promise<void> {
    let socket = initialSocket;

    let session = new SmtpSession(
      socket,
    );

    // Server greeting.
    await session.expect(220);

    let capabilities =
      await this.ehlo(session);

    // Upgrade a plain connection when the server offers STARTTLS.
    if (
      !this.secure &&
      capabilities.has("STARTTLS")
    ) {
      await session.command(
        "STARTTLS",
        220,
      );

      socket =
        await upgradeToTls(
          socket,
          this.config.host,
        );

      session = new SmtpSession(
        socket,
      );

      capabilities =
        await this.ehlo(session);
    }

    // Authenticate with AUTH LOGIN.
    await session.command(
      "AUTH LOGIN",
      334,
    );

    await session.command(
      base64(this.config.user),
      334,
    );

    await session.command(
      base64(this.config.password),
      235,
    );

    // Envelope.
    await session.command(
      `MAIL FROM:<${extractAddress(message.from)}>`,
      250,
    );

    await session.command(
      `RCPT TO:<${extractAddress(message.to)}>`,
      [250, 251],
    );

    // Body.
    await session.command(
      "DATA",
      354,
    );

    session.writeRaw(
      `${buildMessage(message)}\r\n.\r\n`,
    );

    await session.expect(250);

    // Politely close; ignore any hiccup on the way out.
    try {
      await session.command(
        "QUIT",
        221,
      );
    } catch {
      // The message is already accepted; a rough close is harmless.
    }
  }

  /**
   * Sends EHLO and returns the advertised capabilities, upper-cased.
   */
  private async ehlo(
    session: SmtpSession,
  ): Promise<Set<string>> {
    const reply =
      await session.command(
        `EHLO ${this.clientName}`,
        250,
      );

    return new Set(
      reply.text
        .toUpperCase()
        .split(/\s+/),
    );
  }

  private failure(
    error: unknown,
  ): EmailResult {
    return {
      status: "failed",
      provider: "smtp",
      error:
        error instanceof Error
          ? error.message
          : "SMTP delivery failed.",
    };
  }
}

/**
 * Opens a real SMTP connection, using implicit TLS when secure.
 */
const defaultConnect: SmtpConnectionFactory =
  (host, port, secure) =>
    new Promise<Duplex>(
      (resolve, reject) => {
        const socket = secure
          ? tlsConnect({
              host,
              port,
              servername: host,
            })
          : netConnect({
              host,
              port,
            });

        const event = secure
          ? "secureConnect"
          : "connect";

        socket.once(event, () =>
          resolve(socket),
        );

        socket.once(
          "error",
          reject,
        );
      },
    );

/**
 * Upgrades an established plain socket to TLS (for STARTTLS).
 */
function upgradeToTls(
  socket: Duplex,
  host: string,
): Promise<Duplex> {
  return new Promise<Duplex>(
    (resolve, reject) => {
      const secured = tlsConnect(
        {
          socket:
            socket as never,
          servername: host,
        },
        () => resolve(secured),
      );

      secured.once(
        "error",
        reject,
      );
    },
  );
}

/**
 * Rejects a message whose fields could inject email headers or SMTP
 * commands. A carriage return, line feed, or NUL in any header field
 * (or in either address) is treated as an attack and refused.
 */
function validateMessage(
  message: EmailMessage,
): void {
  assertHeaderSafe(
    message.from,
    "sender",
  );

  assertHeaderSafe(
    message.to,
    "recipient",
  );

  assertHeaderSafe(
    message.subject,
    "subject",
  );

  assertMailbox(
    extractAddress(message.from),
    "sender",
  );

  assertMailbox(
    extractAddress(message.to),
    "recipient",
  );
}

/**
 * Throws when a header value contains a line break or NUL.
 */
function assertHeaderSafe(
  value: string,
  field: string,
): void {
  if (/[\r\n\0]/.test(value)) {
    throw new Error(
      `The email ${field} contains an illegal line break.`,
    );
  }
}

/**
 * Throws unless the value is a single, well-formed mailbox address:
 * no whitespace, angle brackets, control characters, and exactly one
 * "@" with text on both sides.
 */
function assertMailbox(
  address: string,
  field: string,
): void {
  const valid =
    address.length > 0 &&
    !/[\s<>\r\n\0]/.test(address) &&
    /^[^@]+@[^@]+$/.test(address);

  if (!valid) {
    throw new Error(
      `The email ${field} is not a valid address.`,
    );
  }
}

/**
 * Extracts the bare address from a "Name <addr>" string.
 */
function extractAddress(
  value: string,
): string {
  const match =
    value.match(/<([^>]+)>/);

  return match
    ? match[1].trim()
    : value.trim();
}

/**
 * Returns the domain part of an address, for the Message-ID.
 */
function domainOf(
  value: string,
): string {
  const address =
    extractAddress(value);

  const at = address.indexOf("@");

  return at >= 0
    ? address.slice(at + 1)
    : "localhost";
}

function base64(
  value: string,
): string {
  return Buffer.from(
    value,
    "utf8",
  ).toString("base64");
}

/**
 * Builds an RFC 5322 message. The body is normalized to CRLF line
 * endings and dot-stuffed so a line of a single "." cannot end the
 * DATA stream early.
 */
function buildMessage(
  message: EmailMessage,
): string {
  const headers = [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domainOf(message.from)}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
  ].join("\r\n");

  const body = message.body
    .replace(/\r?\n/g, "\r\n")
    .replace(/^\./gm, "..");

  return `${headers}\r\n\r\n${body}`;
}
