import { createConfiguredApp } from "./app";
import type { AutomationScanner } from "./automation/AutomationScanner";
import { AutomationScheduler } from "./automation/AutomationScheduler";
import { config } from "./config";
import type { SQLiteDatabase } from "./persistence/SQLiteDatabase";

async function startServer(): Promise<void> {
  const app = await createConfiguredApp();

  const database =
    app.locals.database as
      | SQLiteDatabase
      | undefined;

  // Start the periodic automation scan (overdue invoices, etc.).
  // A zero interval disables it. Drafts still require human approval.
  const scanner =
    app.locals.automationScanner as
      | AutomationScanner
      | undefined;

  const scheduler =
    scanner &&
    config.AUTOMATION_SCAN_INTERVAL_MINUTES >
      0
      ? new AutomationScheduler(
          () => scanner.run(),
          config.AUTOMATION_SCAN_INTERVAL_MINUTES *
            60 *
            1000,
        )
      : undefined;

  scheduler?.start();

  let shuttingDown = false;

  const server = app.listen(
    config.PORT,
    () => {
      console.log(
        `${config.APP_NAME} ${config.APP_VERSION} listening on port ${config.PORT}`,
      );
    },
  );

  function shutdown(signal: string): void {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    console.log(
      `Received ${signal}. Shutting down.`,
    );

    scheduler?.stop();

    server.close((error) => {
      try {
        database?.close();
      } catch (databaseError) {
        console.error(
          "Failed to close the database.",
          databaseError,
        );
      }

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