import { createConfiguredApp } from "./app";
import { config } from "./config";

async function startServer(): Promise<void> {
  const app = await createConfiguredApp();

  const server = app.listen(
    config.PORT,
    () => {
      console.log(
        `${config.APP_NAME} ${config.APP_VERSION} listening on port ${config.PORT}`,
      );
    },
  );

  function shutdown(signal: string): void {
    console.log(
      `Received ${signal}. Shutting down.`,
    );

    server.close((error) => {
      if (error) {
        console.error(error);
        process.exit(1);
      }

      process.exit(0);
    });
  }

  process.on(
    "SIGINT",
    () => shutdown("SIGINT"),
  );

  process.on(
    "SIGTERM",
    () => shutdown("SIGTERM"),
  );
}

startServer().catch((error: unknown) => {
  console.error(
    "Faith Harbor OS failed to start.",
    error,
  );

  process.exit(1);
});