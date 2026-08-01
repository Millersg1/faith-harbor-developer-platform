import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { QuestionnaireAnswers } from "./TenantQuestionnaire";

interface Row {
  organization_id: string;
  answers: unknown;
  updated_at: string;
}

export interface QuestionnaireRecord {
  organizationId: string;
  answers: QuestionnaireAnswers;
  updatedAt: string;
}

/**
 * One legal questionnaire per organization (singleton), tenant-scoped. The
 * organization id comes from the tenant context — never the caller — so a
 * tenant can only ever read or write its own answers.
 */
export class TenantQuestionnaireRepository extends TenantScopedRepository {
  private readonly memory = new Map<
    string,
    QuestionnaireRecord
  >();

  async get(): Promise<QuestionnaireRecord | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const result = await this.db.query(
        "SELECT * FROM tenant_legal_questionnaire WHERE organization_id = $1",
        [organizationId],
      );
      const row = result.rows[0] as unknown as Row | undefined;
      return row ? mapRow(row) : undefined;
    }
    return this.memory.get(organizationId);
  }

  async upsert(
    answers: QuestionnaireAnswers,
    updatedAt: string,
  ): Promise<QuestionnaireRecord> {
    const organizationId = this.tenantId();
    const record: QuestionnaireRecord = {
      organizationId,
      answers,
      updatedAt,
    };
    if (this.db) {
      await this.db.query(
        `INSERT INTO tenant_legal_questionnaire (organization_id, answers, updated_at)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (organization_id)
         DO UPDATE SET answers = EXCLUDED.answers, updated_at = EXCLUDED.updated_at`,
        [organizationId, JSON.stringify(answers), updatedAt],
      );
      return record;
    }
    this.memory.set(organizationId, record);
    return record;
  }
}

function mapRow(row: Row): QuestionnaireRecord {
  let answers: QuestionnaireAnswers = {};
  if (row.answers && typeof row.answers === "object") {
    answers = row.answers as QuestionnaireAnswers;
  } else if (typeof row.answers === "string") {
    try {
      answers = JSON.parse(row.answers) as QuestionnaireAnswers;
    } catch {
      answers = {};
    }
  }
  return {
    organizationId: row.organization_id,
    answers,
    updatedAt: row.updated_at,
  };
}
