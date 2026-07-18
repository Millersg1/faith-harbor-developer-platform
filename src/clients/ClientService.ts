import { randomUUID } from "node:crypto";

import type {
  DatabaseSync,
} from "node:sqlite";

import type {
  ClientRecord,
  CreateClientRequest,
} from "./ClientTypes";

interface ClientRow {
  id: string;
  company_name: string;
  primary_contact: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  notes: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Creates and retrieves Faith Harbor client records.
 *
 * Without a database connection, records are kept in memory.
 * When SQLite is supplied, records persist across restarts.
 */
export class ClientService {
  private readonly clients =
    new Map<string, ClientRecord>();

  constructor(
    private readonly database?:
      DatabaseSync,
  ) {}

  create(
    request: CreateClientRequest,
  ): ClientRecord {
    const now =
      new Date().toISOString();

    const client:
      ClientRecord = {
        id: randomUUID(),

        companyName:
          request.companyName.trim(),

        primaryContact:
          request.primaryContact.trim(),

        metadata:
          request.metadata ?? {},

        createdAt: now,

        updatedAt: now,
      };

    if (request.email) {
      client.email =
        request.email.trim();
    }

    if (request.phone) {
      client.phone =
        request.phone.trim();
    }

    if (request.website) {
      client.website =
        request.website.trim();
    }

    if (request.industry) {
      client.industry =
        request.industry.trim();
    }

    if (request.notes) {
      client.notes =
        request.notes.trim();
    }

    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO clients (
            id,
            company_name,
            primary_contact,
            email,
            phone,
            website,
            industry,
            notes,
            metadata_json,
            created_at,
            updated_at
          ) VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `)
        .run(
          client.id,
          client.companyName,
          client.primaryContact,
          client.email ?? null,
          client.phone ?? null,
          client.website ?? null,
          client.industry ?? null,
          client.notes ?? null,
          JSON.stringify(
            client.metadata ?? {},
          ),
          client.createdAt,
          client.updatedAt,
        );

      return client;
    }

    this.clients.set(
      client.id,
      client,
    );

    return client;
  }

  list(): ClientRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id,
              company_name,
              primary_contact,
              email,
              phone,
              website,
              industry,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM clients
            ORDER BY created_at DESC
          `)
          .all() as unknown as
          ClientRow[];

      return rows.map(
        (row) =>
          this.mapRow(row),
      );
    }

    return Array.from(
      this.clients.values(),
    );
  }

  get(
    id: string,
  ): ClientRecord {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT
              id,
              company_name,
              primary_contact,
              email,
              phone,
              website,
              industry,
              notes,
              metadata_json,
              created_at,
              updated_at
            FROM clients
            WHERE id = ?
          `)
          .get(id) as
          | ClientRow
          | undefined;

      if (!row) {
        throw new Error(
          `Client "${id}" was not found.`,
        );
      }

      return this.mapRow(row);
    }

    const client =
      this.clients.get(id);

    if (!client) {
      throw new Error(
        `Client "${id}" was not found.`,
      );
    }

    return client;
  }

  /**
   * Permanently deletes one client.
   *
   * Related-record protection is enforced by ClientRouter
   * before this method is called.
   */
  delete(
    id: string,
  ): void {
    if (this.database) {
      const result =
        this.database
          .prepare(`
            DELETE FROM clients
            WHERE id = ?
          `)
          .run(id);

      if (result.changes === 0) {
        throw new Error(
          `Client "${id}" was not found.`,
        );
      }

      return;
    }

    const deleted =
      this.clients.delete(id);

    if (!deleted) {
      throw new Error(
        `Client "${id}" was not found.`,
      );
    }
  }

  /**
   * Converts one SQLite row into the public client record.
   */
  private mapRow(
    row: ClientRow,
  ): ClientRecord {
    const client:
      ClientRecord = {
        id: row.id,

        companyName:
          row.company_name,

        primaryContact:
          row.primary_contact,

        metadata:
          this.parseMetadata(
            row.metadata_json,
          ),

        createdAt:
          row.created_at,

        updatedAt:
          row.updated_at,
      };

    if (row.email) {
      client.email = row.email;
    }

    if (row.phone) {
      client.phone = row.phone;
    }

    if (row.website) {
      client.website =
        row.website;
    }

    if (row.industry) {
      client.industry =
        row.industry;
    }

    if (row.notes) {
      client.notes = row.notes;
    }

    return client;
  }

  /**
   * Safely parses client metadata stored as JSON.
   */
  private parseMetadata(
    value: string,
  ): Record<string, unknown> {
    try {
      const parsed: unknown =
        JSON.parse(value);

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as
          Record<string, unknown>;
      }
    } catch {
      // Invalid historical metadata is treated as empty.
    }

    return {};
  }
}