import {
  describe,
  expect,
  it,
} from "vitest";

import { AutomationScheduler } from "./AutomationScheduler";

const silentLogger = {
  log: () => {},
  error: () => {},
};

function flush(): Promise<void> {
  return new Promise((resolve) =>
    setImmediate(resolve),
  );
}

describe("AutomationScheduler", () => {
  it("runs the task once immediately on start", async () => {
    let calls = 0;

    const scheduler =
      new AutomationScheduler(
        () => {
          calls += 1;
          return 0;
        },
        60_000,
        silentLogger,
      );

    scheduler.start();
    await flush();
    scheduler.stop();

    expect(calls).toBe(1);
  });

  it("does not start a second schedule when start is called twice", async () => {
    let calls = 0;

    const scheduler =
      new AutomationScheduler(
        () => {
          calls += 1;
          return 0;
        },
        60_000,
        silentLogger,
      );

    scheduler.start();
    scheduler.start();
    await flush();
    scheduler.stop();

    // Only the first start's immediate run happened.
    expect(calls).toBe(1);
  });

  it("swallows task errors so the schedule survives", async () => {
    let errors = 0;

    const scheduler =
      new AutomationScheduler(
        () => {
          throw new Error(
            "scan blew up",
          );
        },
        60_000,
        {
          log: () => {},
          error: () => {
            errors += 1;
          },
        },
      );

    // Must not throw.
    scheduler.start();
    await flush();
    scheduler.stop();

    expect(errors).toBe(1);
  });

  it("stop before start is safe", () => {
    const scheduler =
      new AutomationScheduler(
        () => 0,
        60_000,
        silentLogger,
      );

    expect(() =>
      scheduler.stop(),
    ).not.toThrow();
  });
});
