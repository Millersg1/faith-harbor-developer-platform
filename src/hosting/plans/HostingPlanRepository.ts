import type { DatabaseSync } from "node:sqlite";

import type {
  HostingPlanRecord,
  HostingPlanSpecs,
} from "./HostingPlanTypes";

interface HostingPlanRow {
  id: string;
  kind: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly_cents: number;
  price_yearly_cents: number;
  specs_json: string;
  features_json: string;
  whm_package: string | null;
  popular: number;
  active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Stores hosting plans. In memory without a database; persistent with
 * SQLite.
 */
export class HostingPlanRepository {
  private readonly plans =
    new Map<string, HostingPlanRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  create(
    plan: HostingPlanRecord,
  ): HostingPlanRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO hosting_plans (
            id, kind, name, slug, description,
            price_monthly_cents, price_yearly_cents,
            specs_json, features_json, whm_package,
            popular, active, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          plan.id,
          plan.kind,
          plan.name,
          plan.slug,
          plan.description ?? null,
          plan.priceMonthlyCents,
          plan.priceYearlyCents,
          JSON.stringify(plan.specs),
          JSON.stringify(plan.features),
          plan.whmPackage ?? null,
          plan.popular ? 1 : 0,
          plan.active ? 1 : 0,
          plan.sortOrder,
          plan.createdAt,
          plan.updatedAt,
        );

      return plan;
    }

    this.plans.set(plan.id, plan);

    return plan;
  }

  update(
    plan: HostingPlanRecord,
  ): HostingPlanRecord {
    if (this.database) {
      this.database
        .prepare(`
          UPDATE hosting_plans SET
            kind = ?, name = ?, slug = ?, description = ?,
            price_monthly_cents = ?, price_yearly_cents = ?,
            specs_json = ?, features_json = ?, whm_package = ?,
            popular = ?, active = ?, sort_order = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(
          plan.kind,
          plan.name,
          plan.slug,
          plan.description ?? null,
          plan.priceMonthlyCents,
          plan.priceYearlyCents,
          JSON.stringify(plan.specs),
          JSON.stringify(plan.features),
          plan.whmPackage ?? null,
          plan.popular ? 1 : 0,
          plan.active ? 1 : 0,
          plan.sortOrder,
          plan.updatedAt,
          plan.id,
        );

      return plan;
    }

    this.plans.set(plan.id, plan);

    return plan;
  }

  get(
    id: string,
  ): HostingPlanRecord | undefined {
    if (this.database) {
      const row =
        this.database
          .prepare(
            "SELECT * FROM hosting_plans WHERE id = ?",
          )
          .get(id) as unknown as
          HostingPlanRow | undefined;

      return row
        ? this.mapRow(row)
        : undefined;
    }

    return this.plans.get(id);
  }

  getBySlug(
    slug: string,
  ): HostingPlanRecord | undefined {
    if (this.database) {
      const row =
        this.database
          .prepare(
            "SELECT * FROM hosting_plans WHERE slug = ?",
          )
          .get(slug) as unknown as
          HostingPlanRow | undefined;

      return row
        ? this.mapRow(row)
        : undefined;
    }

    for (const plan of this.plans.values()) {
      if (plan.slug === slug) {
        return plan;
      }
    }

    return undefined;
  }

  list(): HostingPlanRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(
            "SELECT * FROM hosting_plans ORDER BY sort_order ASC, price_monthly_cents ASC",
          )
          .all() as unknown as
          HostingPlanRow[];

      return rows.map((row) =>
        this.mapRow(row),
      );
    }

    return Array.from(
      this.plans.values(),
    ).sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.priceMonthlyCents -
          b.priceMonthlyCents,
    );
  }

  delete(id: string): void {
    if (this.database) {
      this.database
        .prepare(
          "DELETE FROM hosting_plans WHERE id = ?",
        )
        .run(id);

      return;
    }

    this.plans.delete(id);
  }

  private mapRow(
    row: HostingPlanRow,
  ): HostingPlanRecord {
    const plan: HostingPlanRecord = {
      id: row.id,
      kind:
        row.kind === "reseller"
          ? "reseller"
          : "shared",
      name: row.name,
      slug: row.slug,
      priceMonthlyCents:
        row.price_monthly_cents,
      priceYearlyCents:
        row.price_yearly_cents,
      specs: this.parseSpecs(
        row.specs_json,
      ),
      features: this.parseFeatures(
        row.features_json,
      ),
      popular: row.popular === 1,
      active: row.active === 1,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    if (row.description) {
      plan.description =
        row.description;
    }

    if (row.whm_package) {
      plan.whmPackage =
        row.whm_package;
    }

    return plan;
  }

  private parseSpecs(
    value: string,
  ): HostingPlanSpecs {
    try {
      const parsed = JSON.parse(
        value,
      ) as Partial<HostingPlanSpecs>;

      return {
        storageMb:
          Number(parsed.storageMb) || 0,
        bandwidthGb:
          Number(parsed.bandwidthGb) ||
          0,
        websites:
          Number(parsed.websites) || 0,
        emailAccounts:
          Number(
            parsed.emailAccounts,
          ) || 0,
        mysqlDatabases:
          Number(
            parsed.mysqlDatabases,
          ) || 0,
      };
    } catch {
      return {
        storageMb: 0,
        bandwidthGb: 0,
        websites: 0,
        emailAccounts: 0,
        mysqlDatabases: 0,
      };
    }
  }

  private parseFeatures(
    value: string,
  ): string[] {
    try {
      const parsed = JSON.parse(value);

      return Array.isArray(parsed)
        ? parsed.map((f) => String(f))
        : [];
    } catch {
      return [];
    }
  }
}
