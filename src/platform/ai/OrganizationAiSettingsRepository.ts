import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  AiProvider,
  OrganizationAiSettingsRecord,
} from "./OrganizationAiSettings";

interface AiSettingsRow {
  organization_id: string;
  provider: string;
  api_key: string;
  model: string | null;
  updated_at: string;
}

/**
 * Stores one AI-settings record per tenant (keyed by organization). Reads
 * and writes are scoped to the current tenant, so a tenant can only ever
 * see or change its own AI credentials.
 */
export class OrganizationAiSettingsRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      OrganizationAiSettingsRecord
    >();

  async get(): Promise<
    OrganizationAiSettingsRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM organization_ai_settings WHERE organization_id = $1",
          [organizationId],
        );

      const row = result.rows[0] as
        | unknown as
        | AiSettingsRow
        | undefined;

      return row
        ? mapRow(row)
        : undefined;
    }

    return this.memory.get(
      organizationId,
    );
  }

  async upsert(
    settings: Omit<
      OrganizationAiSettingsRecord,
      "organizationId"
    >,
  ): Promise<OrganizationAiSettingsRecord> {
    const organizationId =
      this.tenantId();

    const record: OrganizationAiSettingsRecord =
      { ...settings, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO organization_ai_settings
           (organization_id, provider, api_key, model, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id) DO UPDATE SET
           provider = EXCLUDED.provider,
           api_key = EXCLUDED.api_key,
           model = EXCLUDED.model,
           updated_at = EXCLUDED.updated_at`,
        [
          record.organizationId,
          record.provider,
          record.apiKey,
          record.model ?? null,
          record.updatedAt,
        ],
      );

      return record;
    }

    this.memory.set(
      organizationId,
      record,
    );

    return record;
  }

  async delete(): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM organization_ai_settings WHERE organization_id = $1",
        [organizationId],
      );

      return;
    }

    this.memory.delete(
      organizationId,
    );
  }
}

function mapRow(
  row: AiSettingsRow,
): OrganizationAiSettingsRecord {
  const record: OrganizationAiSettingsRecord =
    {
      organizationId:
        row.organization_id,
      provider:
        row.provider as AiProvider,
      apiKey: row.api_key,
      updatedAt: row.updated_at,
    };

  if (row.model) {
    record.model = row.model;
  }

  return record;
}
