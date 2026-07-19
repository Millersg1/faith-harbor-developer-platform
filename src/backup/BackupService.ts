import {
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

/**
 * The narrow database capability the backup service needs.
 *
 * SQLite's "VACUUM INTO" writes a consistent snapshot of the live
 * database to a new file — safe to run while the app is serving.
 */
export interface BackupDatabase {
  exec(sql: string): void;
}

export interface BackupInfo {
  file: string;
  createdAt: string;
  sizeBytes: number;
}

export interface BackupOptions {
  /**
   * Where snapshots are written. Defaults to <cwd>/data/backups.
   */
  directory?: string;

  /**
   * How many of the most recent snapshots to keep. Older ones are
   * pruned after each successful backup. Defaults to 14.
   */
  retain?: number;
}

const FILE_PREFIX =
  "faith-harbor-";

const FILE_SUFFIX = ".db";

/**
 * Creates and retains point-in-time backups of the SQLite database.
 *
 * Each backup is a consistent snapshot produced with VACUUM INTO, so
 * it is a complete, openable database — not a copy of a file that may
 * be mid-write. Nothing is deleted until a new snapshot succeeds.
 */
export class BackupService {
  private readonly directory: string;

  private readonly retain: number;

  constructor(
    private readonly database: BackupDatabase,
    options: BackupOptions = {},
  ) {
    this.directory =
      options.directory ??
      join(
        process.cwd(),
        "data",
        "backups",
      );

    this.retain = Math.max(
      1,
      options.retain ?? 14,
    );
  }

  /**
   * Writes one snapshot and prunes older ones. `now` is injectable
   * for deterministic tests.
   */
  runBackup(
    now: Date = new Date(),
  ): BackupInfo {
    mkdirSync(this.directory, {
      recursive: true,
    });

    const stamp = now
      .toISOString()
      .replace(/[:.]/g, "-");

    const path = join(
      this.directory,
      `${FILE_PREFIX}${stamp}${FILE_SUFFIX}`,
    );

    // Forward slashes work in SQLite string literals on every OS;
    // single quotes are escaped defensively though the path is ours.
    const literal = path
      .replace(/\\/g, "/")
      .replace(/'/g, "''");

    this.database.exec(
      `VACUUM INTO '${literal}'`,
    );

    this.prune();

    const size =
      statSync(path).size;

    return {
      file: path,
      createdAt:
        now.toISOString(),
      sizeBytes: size,
    };
  }

  /**
   * Lists existing snapshots, newest first.
   */
  list(): BackupInfo[] {
    let entries: string[];

    try {
      entries = readdirSync(
        this.directory,
      );
    } catch {
      return [];
    }

    return entries
      .filter(
        (name) =>
          name.startsWith(
            FILE_PREFIX,
          ) &&
          name.endsWith(FILE_SUFFIX),
      )
      .map((name) => {
        const full = join(
          this.directory,
          name,
        );

        const info =
          statSync(full);

        return {
          file: full,
          createdAt:
            info.mtime.toISOString(),
          sizeBytes: info.size,
        };
      })
      .sort((a, b) =>
        b.createdAt.localeCompare(
          a.createdAt,
        ),
      );
  }

  /**
   * Deletes snapshots beyond the retention count.
   */
  private prune(): void {
    const snapshots = this.list();

    for (const snapshot of snapshots.slice(
      this.retain,
    )) {
      try {
        unlinkSync(snapshot.file);
      } catch {
        // A snapshot we cannot delete is left in place.
      }
    }
  }
}
