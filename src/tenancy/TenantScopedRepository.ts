import type { PgQueryable } from "../persistence/PgQueryable";
import { requireTenant } from "./TenantContext";

/**
 * Base class for repositories whose every row belongs to exactly one
 * organization.
 *
 * The one rule of tenant isolation lives here: {@link tenantId} reads the
 * organization from the ambient tenant context and **throws when there
 * is none** (via requireTenant). Concrete repositories call it at the top
 * of every method and include `organization_id = <it>` in every query, so
 * there is no code path that can read or write across tenants — a missing
 * tenant errors instead of leaking.
 *
 * Subclasses write their `WHERE organization_id = $n` filters explicitly
 * rather than inheriting hidden magic: in a security-critical layer, a
 * filter you can see in every query is safer than one you have to trust.
 */
export abstract class TenantScopedRepository {
  constructor(
    protected readonly db?: PgQueryable,
  ) {}

  /**
   * The current tenant's organization id. Throws (fail closed) when
   * called outside a tenant scope.
   */
  protected tenantId(): string {
    return requireTenant()
      .organizationId;
  }
}
