import type {
  DatabaseSync,
} from "node:sqlite";

/**
 * Stores administrator settings that can change at runtime — the
 * password hash (once changed in-app) and the TOTP secret (once 2FA
 * is enabled). A simple key/value store.
 *
 * The .env credentials remain the fallback: if nothing is stored
 * here, the app authenticates exactly as before, so enabling these
 * features can never lock the administrator out.
 */
export class AdminSettingsRepository {
  private readonly memory =
    new Map<string, string>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  get(
    key: string,
  ): string | undefined {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT value
            FROM admin_settings
            WHERE key = ?
          `)
          .get(key) as
          | { value: string }
          | undefined;

      return row?.value;
    }

    return this.memory.get(key);
  }

  set(
    key: string,
    value: string,
  ): void {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO admin_settings (key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value
        `)
        .run(key, value);

      return;
    }

    this.memory.set(key, value);
  }

  delete(key: string): void {
    if (this.database) {
      this.database
        .prepare(`
          DELETE FROM admin_settings
          WHERE key = ?
        `)
        .run(key);

      return;
    }

    this.memory.delete(key);
  }
}
