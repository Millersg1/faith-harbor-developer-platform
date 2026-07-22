import { createConfiguredApp } from "./app";
import type { AutomationScanner } from "./automation/AutomationScanner";
import { AutomationScheduler } from "./automation/AutomationScheduler";
import type { BackupService } from "./backup/BackupService";
import { config } from "./config";
import type { SQLiteDatabase } from "./persistence/SQLiteDatabase";
import type { SequenceService } from "./sequences/SequenceService";
import type { RecurringBillingService } from "./hosting/billing/RecurringBillingService";

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

  // SaaS Surface drip engine: on each tick, any onboarding-email step
  // that has come due is auto-sent. This reuses the automation
  // scheduler's safe interval runner (guards against overlap, swallows
  // errors). Distinct from the human-approved automation drafts above.
  const sequenceService =
    app.locals.sequenceService as
      | SequenceService
      | undefined;

  const sequenceScheduler =
    sequenceService &&
    config.SEQUENCE_TICK_INTERVAL_MINUTES >
      0
      ? new AutomationScheduler(
          () =>
            sequenceService.tick(),
          config.SEQUENCE_TICK_INTERVAL_MINUTES *
            60 *
            1000,
          {
            log: (message) =>
              console.log(message),
            error: (
              message,
              error,
            ) =>
              console.error(
                message,
                error,
              ),
          },
        )
      : undefined;

  sequenceScheduler?.start();

  // Recurring hosting billing: on each tick, raise renewal invoices that
  // have come due, send escalating reminders, and suspend accounts past
  // the grace period. Reactivation on payment happens instantly via the
  // paid-invoice handler, not this loop. Suspension is reversible;
  // termination is never automated. A zero interval disables it.
  const recurringBillingService =
    app.locals.recurringBillingService as
      | RecurringBillingService
      | undefined;

  const billingScheduler =
    recurringBillingService &&
    config.BILLING_CYCLE_INTERVAL_MINUTES >
      0
      ? new AutomationScheduler(
          // These actions execute (they are not drafts for review), so
          // log an accurate summary here and return 0 to suppress the
          // scheduler's generic "draft(s)" message.
          async () => {
            const actions =
              await recurringBillingService.runBillingCycle();

            if (actions > 0) {
              console.log(
                `Recurring billing: ${actions} action(s) taken (renewals, reminders, suspensions).`,
              );
            }

            return 0;
          },
          config.BILLING_CYCLE_INTERVAL_MINUTES *
            60 *
            1000,
          {
            log: (message) =>
              console.log(message),
            error: (
              message,
              error,
            ) =>
              console.error(
                message,
                error,
              ),
          },
        )
      : undefined;

  billingScheduler?.start();

  // Automatic database backups: one at startup, then on an interval.
  // A consistent snapshot is safe to take while the app is serving.
  const backupService =
    app.locals.backupService as
      | BackupService
      | undefined;

  let backupTimer:
    | ReturnType<typeof setInterval>
    | undefined;

  if (
    backupService &&
    config.BACKUP_INTERVAL_HOURS > 0
  ) {
    const runBackup = () => {
      try {
        const info =
          backupService.runBackup();

        console.log(
          `Backup written: ${info.file} (${info.sizeBytes} bytes)`,
        );
      } catch (error) {
        console.error(
          "Backup failed.",
          error,
        );
      }
    };

    runBackup();

    backupTimer = setInterval(
      runBackup,
      config.BACKUP_INTERVAL_HOURS *
        60 *
        60 *
        1000,
    );

    if (backupTimer.unref) {
      backupTimer.unref();
    }
  }

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

    sequenceScheduler?.stop();

    billingScheduler?.stop();

    if (backupTimer) {
      clearInterval(backupTimer);
    }

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