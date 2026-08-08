/**
 * Effective opt-in policy for a public submission's MARKETING activation.
 *
 * Trust in the request Origin decides whether the tenant's configured single-
 * vs-double opt-in policy may be honored, or whether double opt-in is FORCED:
 *
 * - No Origin (server-to-server), `Origin: null` (sandboxed/opaque origin), or a
 *   form set to `allowAnyOrigin` → the request's provenance is not trustworthy,
 *   so marketing activation is FORCED through double opt-in regardless of the
 *   tenant's setting. The lead + lead-magnet still proceed; only an immediately
 *   active marketing enrollment is withheld until the recipient confirms.
 * - A specifically allowlisted browser Origin (and the form is not
 *   allowAnyOrigin) → follow the tenant's explicitly configured policy
 *   (single or double opt-in).
 */
export interface OptInContext {
  /** Raw request Origin header (may be undefined or the literal "null"). */
  origin: string | undefined;
  /** True iff the Origin is in the form's explicit allowlist. */
  originAllowlisted: boolean;
  /** The form's allowAnyOrigin setting. */
  allowAnyOrigin: boolean;
  /** The tenant's configured double-opt-in preference for this form. */
  formDoubleOptIn: boolean;
}

export interface OptInDecision {
  /** Whether the marketing activation must use double opt-in. */
  doubleOptIn: boolean;
  /** True when double opt-in was FORCED by an untrusted origin (not tenant choice). */
  forced: boolean;
}

export function resolveOptInPolicy(ctx: OptInContext): OptInDecision {
  const trustworthyBrowserOrigin =
    !ctx.allowAnyOrigin &&
    ctx.originAllowlisted &&
    typeof ctx.origin === "string" &&
    ctx.origin.length > 0 &&
    ctx.origin.toLowerCase() !== "null";
  if (trustworthyBrowserOrigin) {
    // Honor the tenant's explicit choice.
    return { doubleOptIn: ctx.formDoubleOptIn, forced: false };
  }
  // No Origin / Origin: null / allowAnyOrigin → force double opt-in.
  return { doubleOptIn: true, forced: true };
}
