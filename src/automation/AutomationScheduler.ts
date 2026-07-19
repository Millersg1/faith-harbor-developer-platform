/**
 * A unit of periodic automation work.
 *
 * Returns the number of drafts it prepared, so the scheduler can log
 * useful activity. May be synchronous or asynchronous.
 */
export type ScanTask = (
) => number | Promise<number>;

/**
 * Runs an automation scan on a fixed interval.
 *
 * This is the heartbeat behind time-based automation. It is started
 * only by the running server, never inside tests, so the test suite
 * stays free of timers. Each tick is best-effort: a failing scan is
 * logged and the schedule continues.
 */
export class AutomationScheduler {
  private timer?:
    ReturnType<typeof setInterval>;

  private running = false;

  constructor(
    private readonly task: ScanTask,
    private readonly intervalMs: number,
    private readonly logger: {
      log: (message: string) => void;
      error: (
        message: string,
        error: unknown,
      ) => void;
    } = {
      log: (message) =>
        console.log(message),
      error: (message, error) =>
        console.error(
          message,
          error,
        ),
    },
  ) {}

  /**
   * Starts the schedule and runs one scan right away.
   *
   * Calling start() more than once has no additional effect.
   */
  start(): void {
    if (this.timer) {
      return;
    }

    // Run once at startup so overdue work is caught immediately.
    void this.tick();

    this.timer = setInterval(
      () => {
        void this.tick();
      },
      this.intervalMs,
    );

    // Do not keep the process alive solely for this timer.
    if (
      typeof this.timer.unref ===
      "function"
    ) {
      this.timer.unref();
    }

    this.logger.log(
      `Automation scheduler started (every ${Math.round(this.intervalMs / 60000)} min).`,
    );
  }

  /**
   * Stops the schedule.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Runs one scan, guarding against overlapping runs and swallowing
   * errors so a single failure never stops the schedule.
   */
  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const created =
        await this.task();

      if (created > 0) {
        this.logger.log(
          `Automation scan prepared ${created} draft(s) for review.`,
        );
      }
    } catch (error) {
      this.logger.error(
        "Automation scan failed.",
        error,
      );
    } finally {
      this.running = false;
    }
  }
}
