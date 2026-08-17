/**
 * Authorization policy for sensitive domain actions. Pure + testable; the route
 * layer (Stage 11) enforces the decisions with real session + reauth checks.
 *
 * Defaults (owner-set):
 *  - Ownership/registrant/contact changes are OWNER-ONLY.
 *  - An admin may perform them ONLY if the owner has explicitly granted domain
 *    admin authority (`ownerGrantedDomainAdmin`).
 *  - MEMBERS may never purchase, transfer, unlock, request an EPP code, change
 *    auto-renew, or change registrant ownership.
 *  - Registration, transfer, unlock, registrant change, EPP request, and
 *    auto-renew changes require RECENT REAUTHENTICATION.
 */

import type { PlatformUserRole } from "../../users/PlatformUser";

export type DomainAction =
  | "search"
  | "quote"
  | "view"
  | "purchase"
  | "renew"
  | "registrant_change"
  | "contact_change"
  | "transfer"
  | "unlock"
  | "epp_request"
  | "auto_renew_change"
  | "dns_change";

/** Actions that require recent reauthentication before proceeding. */
const REAUTH_ACTIONS: ReadonlySet<DomainAction> = new Set([
  "purchase",
  "transfer",
  "unlock",
  "registrant_change",
  "epp_request",
  "auto_renew_change",
]);

/** Actions restricted to owner (or an explicitly owner-granted admin). */
const OWNER_SENSITIVE: ReadonlySet<DomainAction> = new Set([
  "registrant_change",
  "contact_change",
  "transfer",
  "unlock",
  "epp_request",
  "auto_renew_change",
  "purchase",
]);

export interface AuthContext {
  role: PlatformUserRole;
  /** Owner explicitly granted this admin domain authority. */
  ownerGrantedDomainAdmin?: boolean;
  /** The session reauthenticated recently enough for a sensitive action. */
  reauthenticatedRecently?: boolean;
}

export interface AuthDecision {
  allowed: boolean;
  reason?: "role" | "reauth_required";
}

export function requiresReauth(action: DomainAction): boolean {
  return REAUTH_ACTIONS.has(action);
}

export function authorizeDomainAction(
  action: DomainAction,
  ctx: AuthContext,
): AuthDecision {
  // Read-only actions are open to any authenticated member.
  const readOnly = action === "search" || action === "quote" || action === "view";

  if (!readOnly) {
    // Members never perform mutating/ownership actions.
    if (ctx.role === "member") {
      return { allowed: false, reason: "role" };
    }
    if (OWNER_SENSITIVE.has(action)) {
      const ok =
        ctx.role === "owner" ||
        (ctx.role === "admin" && ctx.ownerGrantedDomainAdmin === true);
      if (!ok) return { allowed: false, reason: "role" };
    } else {
      // Non-owner-sensitive mutations (renew, dns_change): owner/admin only.
      if (ctx.role !== "owner" && ctx.role !== "admin") {
        return { allowed: false, reason: "role" };
      }
    }
    if (requiresReauth(action) && !ctx.reauthenticatedRecently) {
      return { allowed: false, reason: "reauth_required" };
    }
  }
  return { allowed: true };
}
