import {
  createServer,
  connect as netConnect,
  type Server,
  type Socket,
} from "node:net";
import type { Duplex } from "node:stream";
import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import { SmtpEmailTransport } from "./SmtpEmailTransport";

interface CapturedEmail {
  authUser?: string;
  authPass?: string;
  mailFrom?: string;
  rcptTo?: string;
  data?: string;
}

interface FakeServer {
  server: Server;
  port: number;
  captured: CapturedEmail;
}

/**
 * A tiny in-process SMTP server that speaks just enough of the
 * protocol to exercise the transport. It never uses TLS, so the test
 * stays fully offline and deterministic.
 */
function startFakeSmtp(
  options: {
    failAuth?: boolean;
  } = {},
): Promise<FakeServer> {
  const captured: CapturedEmail =
    {};

  return new Promise(
    (resolve) => {
      const server = createServer(
        (socket: Socket) => {
          socket.setEncoding("utf8");

          let buffer = "";

          let inData = false;

          let dataBuffer = "";

          let authStage:
            | "none"
            | "user"
            | "pass" = "none";

          socket.write(
            "220 fake ESMTP\r\n",
          );

          const handleLine = (
            line: string,
          ): void => {
            if (
              authStage === "user"
            ) {
              captured.authUser =
                Buffer.from(
                  line,
                  "base64",
                ).toString("utf8");

              authStage = "pass";

              socket.write(
                "334 UGFzc3dvcmQ6\r\n",
              );

              return;
            }

            if (
              authStage === "pass"
            ) {
              captured.authPass =
                Buffer.from(
                  line,
                  "base64",
                ).toString("utf8");

              authStage = "none";

              socket.write(
                options.failAuth
                  ? "535 authentication failed\r\n"
                  : "235 2.7.0 Authenticated\r\n",
              );

              return;
            }

            const upper =
              line.toUpperCase();

            if (
              upper.startsWith(
                "EHLO",
              ) ||
              upper.startsWith(
                "HELO",
              )
            ) {
              socket.write(
                "250-fake greets you\r\n250 AUTH LOGIN\r\n",
              );

              return;
            }

            if (
              upper === "AUTH LOGIN"
            ) {
              authStage = "user";

              socket.write(
                "334 VXNlcm5hbWU6\r\n",
              );

              return;
            }

            if (
              upper.startsWith(
                "MAIL FROM:",
              )
            ) {
              captured.mailFrom =
                line.slice(10);

              socket.write(
                "250 OK\r\n",
              );

              return;
            }

            if (
              upper.startsWith(
                "RCPT TO:",
              )
            ) {
              captured.rcptTo =
                line.slice(8);

              socket.write(
                "250 OK\r\n",
              );

              return;
            }

            if (upper === "DATA") {
              inData = true;

              socket.write(
                "354 End data with <CR><LF>.<CR><LF>\r\n",
              );

              return;
            }

            if (upper === "QUIT") {
              socket.write(
                "221 Bye\r\n",
              );

              socket.end();

              return;
            }

            socket.write(
              "500 unrecognized\r\n",
            );
          };

          socket.on(
            "data",
            (chunk: string) => {
              if (inData) {
                dataBuffer += chunk;

                const end =
                  dataBuffer.indexOf(
                    "\r\n.\r\n",
                  );

                if (end !== -1) {
                  captured.data =
                    dataBuffer.slice(
                      0,
                      end,
                    );

                  inData = false;

                  dataBuffer = "";

                  socket.write(
                    "250 queued\r\n",
                  );
                }

                return;
              }

              buffer += chunk;

              let index: number;

              while (
                (index =
                  buffer.indexOf(
                    "\r\n",
                  )) !== -1
              ) {
                const line =
                  buffer.slice(
                    0,
                    index,
                  );

                buffer =
                  buffer.slice(
                    index + 2,
                  );

                handleLine(line);

                if (inData) {
                  // Remaining bytes are message data.
                  if (buffer) {
                    dataBuffer +=
                      buffer;

                    buffer = "";
                  }
                }
              }
            },
          );
        },
      );

      server.listen(0, () => {
        const address =
          server.address();

        const port =
          typeof address === "object" &&
          address
            ? address.port
            : 0;

        resolve({
          server,
          port,
          captured,
        });
      });
    },
  );
}

let fake: FakeServer | undefined;

afterEach(() => {
  fake?.server.close();
  fake = undefined;
});

/**
 * Connects to the fake server over a plain socket, standing in for
 * the real TLS connection the transport would open in production.
 */
function connectToFake(
  port: number,
): () => Promise<Duplex> {
  return () =>
    new Promise<Duplex>(
      (resolve, reject) => {
        const socket = netConnect(
          {
            host: "127.0.0.1",
            port,
          },
        );

        socket.once(
          "connect",
          () => resolve(socket),
        );

        socket.once(
          "error",
          reject,
        );
      },
    );
}

describe("SmtpEmailTransport", () => {
  it("delivers a message through the full SMTP conversation", async () => {
    fake =
      await startFakeSmtp();

    const transport =
      new SmtpEmailTransport(
        {
          host: "smtp.example",
          port: 465,
          user: "hello@example.com",
          password: "secret",
          secure: false,
        },
        connectToFake(fake.port),
      );

    const result =
      await transport.send({
        from: "hello@example.com",
        to: "client@example.org",
        subject: "Welcome",
        body: "Hello there.\nSecond line.",
      });

    expect(result.status)
      .toBe("sent");
    expect(result.provider)
      .toBe("smtp");

    expect(fake.captured.authUser)
      .toBe("hello@example.com");
    expect(fake.captured.authPass)
      .toBe("secret");
    expect(fake.captured.mailFrom)
      .toBe("<hello@example.com>");
    expect(fake.captured.rcptTo)
      .toBe("<client@example.org>");
    expect(fake.captured.data)
      .toContain(
        "Subject: Welcome",
      );
    expect(fake.captured.data)
      .toContain("Hello there.");
    expect(fake.captured.data)
      .toContain("Second line.");
  });

  it("extracts the bare address from a display-name from field", async () => {
    fake =
      await startFakeSmtp();

    const transport =
      new SmtpEmailTransport(
        {
          host: "smtp.example",
          port: 465,
          user: "hello@example.com",
          password: "secret",
          secure: false,
        },
        connectToFake(fake.port),
      );

    await transport.send({
      from: "Faith Harbor <hello@example.com>",
      to: "client@example.org",
      subject: "Hi",
      body: "Body.",
    });

    expect(fake.captured.mailFrom)
      .toBe("<hello@example.com>");
  });

  it("reports failure when authentication is rejected", async () => {
    fake =
      await startFakeSmtp({
        failAuth: true,
      });

    const transport =
      new SmtpEmailTransport(
        {
          host: "smtp.example",
          port: 465,
          user: "hello@example.com",
          password: "wrong",
          secure: false,
        },
        connectToFake(fake.port),
      );

    const result =
      await transport.send({
        from: "hello@example.com",
        to: "client@example.org",
        subject: "Welcome",
        body: "Hello.",
      });

    expect(result.status)
      .toBe("failed");
    expect(result.provider)
      .toBe("smtp");
    expect(result.error)
      .toContain("535");
  });

  it("reports failure when the connection cannot be opened", async () => {
    const transport =
      new SmtpEmailTransport(
        {
          host: "smtp.example",
          port: 465,
          user: "hello@example.com",
          password: "secret",
          secure: false,
        },
        () =>
          Promise.reject(
            new Error(
              "connection refused",
            ),
          ),
      );

    const result =
      await transport.send({
        from: "hello@example.com",
        to: "client@example.org",
        subject: "Welcome",
        body: "Hello.",
      });

    expect(result.status)
      .toBe("failed");
    expect(result.error)
      .toContain(
        "connection refused",
      );
  });
});
