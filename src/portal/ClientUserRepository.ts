import type {
  DatabaseSync,
} from "node:sqlite";

import type { ClientUser } from "./ClientUser";

interface ClientUserRow {
  id: string;
  client_id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

/**
 * Stores client portal user accounts. In memory without a database;
 * persistent with SQLite.
 */
export class ClientUserRepository {
  private readonly users =
    new Map<string, ClientUser>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    user: ClientUser,
  ): ClientUser {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO client_users (
            id, client_id, email, password_hash, created_at
          ) VALUES (?, ?, ?, ?, ?)
        `)
        .run(
          user.id,
          user.clientId,
          user.email,
          user.passwordHash,
          user.createdAt,
        );

      return user;
    }

    this.users.set(user.id, user);

    return user;
  }

  findByEmail(
    email: string,
  ): ClientUser | undefined {
    const normalized = email
      .trim()
      .toLowerCase();

    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT id, client_id, email, password_hash, created_at
            FROM client_users
            WHERE lower(email) = ?
          `)
          .get(normalized) as unknown as
          ClientUserRow | undefined;

      return row
        ? this.mapRow(row)
        : undefined;
    }

    return Array.from(
      this.users.values(),
    ).find(
      (user) =>
        user.email
          .trim()
          .toLowerCase() ===
        normalized,
    );
  }

  findByClientId(
    clientId: string,
  ): ClientUser[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT id, client_id, email, password_hash, created_at
            FROM client_users
            WHERE client_id = ?
            ORDER BY created_at ASC
          `)
          .all(clientId) as unknown as
          ClientUserRow[];

      return rows.map((row) =>
        this.mapRow(row),
      );
    }

    return Array.from(
      this.users.values(),
    ).filter(
      (user) =>
        user.clientId === clientId,
    );
  }

  private mapRow(
    row: ClientUserRow,
  ): ClientUser {
    return {
      id: row.id,
      clientId: row.client_id,
      email: row.email,
      passwordHash:
        row.password_hash,
      createdAt: row.created_at,
    };
  }
}
