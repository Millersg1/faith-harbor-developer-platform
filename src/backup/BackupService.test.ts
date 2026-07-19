import {
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import { BackupService } from "./BackupService";

const tempDirs: string[] = [];

function makeDatabase() {
  const dir = mkdtempSync(
    join(tmpdir(), "fh-backup-"),
  );

  tempDirs.push(dir);

  const db = new DatabaseSync(
    join(dir, "main.db"),
  );

  db.exec(
    "CREATE TABLE clients (id TEXT, name TEXT)",
  );
  db.exec(
    "INSERT INTO clients VALUES ('c1', 'Grace Chapel')",
  );

  return {
    db,
    backupDir: join(
      dir,
      "backups",
    ),
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, {
      recursive: true,
      force: true,
    });
  }
});

describe("BackupService", () => {
  it("writes a consistent, openable snapshot", () => {
    const { db, backupDir } =
      makeDatabase();

    const service =
      new BackupService(db, {
        directory: backupDir,
      });

    const info = service.runBackup(
      new Date(
        "2026-01-01T00:00:00.000Z",
      ),
    );

    expect(existsSync(info.file))
      .toBe(true);
    expect(info.sizeBytes)
      .toBeGreaterThan(0);

    // The snapshot is a real database with the data in it.
    const snapshot =
      new DatabaseSync(info.file);

    const row = snapshot
      .prepare(
        "SELECT name FROM clients WHERE id = 'c1'",
      )
      .get() as {
      name: string;
    };

    expect(row.name).toBe(
      "Grace Chapel",
    );

    snapshot.close();
    db.close();
  });

  it("retains only the most recent snapshots", () => {
    const { db, backupDir } =
      makeDatabase();

    const service =
      new BackupService(db, {
        directory: backupDir,
        retain: 2,
      });

    service.runBackup(
      new Date(
        "2026-01-01T00:00:00.000Z",
      ),
    );
    service.runBackup(
      new Date(
        "2026-01-02T00:00:00.000Z",
      ),
    );
    service.runBackup(
      new Date(
        "2026-01-03T00:00:00.000Z",
      ),
    );

    const snapshots =
      service.list();

    expect(snapshots).toHaveLength(2);

    // Newest first; the oldest (Jan 1) was pruned.
    expect(snapshots[0].file)
      .toContain("2026-01-03");
    expect(
      snapshots.some((s) =>
        s.file.includes(
          "2026-01-01",
        ),
      ),
    ).toBe(false);

    db.close();
  });

  it("lists nothing when no backups exist", () => {
    const { db, backupDir } =
      makeDatabase();

    const service =
      new BackupService(db, {
        directory: backupDir,
      });

    expect(service.list())
      .toHaveLength(0);

    db.close();
  });
});
