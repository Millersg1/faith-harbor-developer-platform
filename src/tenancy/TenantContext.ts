import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The tenant a unit of work belongs to. Carried implicitly through the
 * async call stack so services and repositories can enforce isolation
 * without threading an organization id through every function signature.
 */
export interface TenantContext {
  organizationId: string;
}

const storage =
  new AsyncLocalStorage<TenantContext>();

/**
 * Runs `fn` with the given tenant in scope. A request middleware resolves
 * the tenant (from subdomain / custom domain / session) and wraps the
 * handler in this, so everything downstream sees the right organization.
 */
export function runWithTenant<T>(
  context: TenantContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

/**
 * The current tenant, or undefined when running outside any tenant scope
 * (for example platform-admin work that spans all organizations).
 */
export function currentTenant():
  | TenantContext
  | undefined {
  return storage.getStore();
}

/**
 * The current tenant, or a thrown error when there is none.
 *
 * This is the fail-closed guard at the heart of tenant isolation: any
 * tenant-scoped query that runs without a tenant in scope throws rather
 * than silently reading across every organization. It is far safer to
 * error than to leak.
 */
export function requireTenant(): TenantContext {
  const context = storage.getStore();

  if (!context) {
    throw new Error(
      "No tenant in scope: this operation must run within an organization.",
    );
  }

  return context;
}
