/**
 * Stage 12A Step 3 — ONE-SHOT NameSilo OTE authoritative-DNS verification.
 *
 * A tightly-bounded add-then-delete of a single harmless TXT record on an
 * already-registered OTE domain, to prove authoritative-zone management end to
 * end. It NEVER touches nameservers, DNSSEC, lock, privacy, contacts, auto-renew,
 * transfers, hosting, or anything else. Every mutation is preview-checked, guarded
 * by a single-use authorization consumed BEFORE the call, never retried, and
 * reconciled read-only.
 *
 * Safety gates:
 *  - AUTHORITY: proceeds only when the live nameservers classify as the managed
 *    provider (NameSilo, recordManagement "supported") AND the caller vouches the
 *    reading is fresh. Stale/unknown/external/cross-provider ⇒ zero calls.
 *  - PREVIEW: the intended change must be exactly one addition of a non-apex,
 *    non-wildcard, NON-protected TXT record with no matching existing record
 *    (duplicate prevention); zero modifications, zero deletions.
 *  - DELETE binds to the provider RECORD ID, never host/type alone.
 *
 * This module logs nothing; it returns a SANITIZED audit (enums + fingerprints +
 * hashes + timestamps). A success with no provider reference is reported honestly
 * as `reference_absent`.
 */

import { createHash } from "node:crypto";

import type { AuthoritativeDnsProvider } from "../dns/dnsAuthority";
import { classifyAuthority } from "../dns/dnsAuthority";
import { isProtected } from "../dns/dnsValidation";
import type { DnsRecord, DomainRegistrarProvider, RegistrarOutcome } from "../RegistrarProvider";
import { OneShotAuthorization, OneShotGuardError } from "./oteRegisterOnce";

export const ADD_ONE_OTE_TXT_ACK = "ADD_ONE_OTE_TXT_RECORD";
export const DELETE_ONE_OTE_TXT_ACK = "DELETE_ONE_OTE_TXT_RECORD";

const fp = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 12);
const refOrAbsent = (ref?: string): string => (ref && ref.trim() ? fp(ref) : "reference_absent");
const recKey = (r: Pick<DnsRecord, "type" | "host" | "value">): string => `${r.type.toUpperCase()}|${r.host.toLowerCase()}|${r.value}`;

export type DnsOpClassification = "added" | "deleted" | "failed" | "rejected" | "transport_unknown" | "needs_attention";

export interface DnsAudit {
  operation: "dns_add" | "dns_delete";
  recordType: "TXT";
  hostFingerprint: string;
  valueFingerprint: string;
  classification: DnsOpClassification;
  providerRefHash: string; // hash or "reference_absent"
  at: string;
}

export interface DnsPreview {
  additions: DnsRecord[];
  modifications: DnsRecord[];
  deletions: DnsRecord[];
  protectedConflicts: string[];
}

/** Zero-mutation authority gate. Throws (no provider call) unless managed+fresh. */
export function assertManagedAuthority(nameservers: string[], providers: AuthoritativeDnsProvider[], fresh: boolean): void {
  if (!fresh) throw new OneShotGuardError("authority_stale");
  const cls = classifyAuthority(nameservers, providers);
  if (cls.provider !== "namesilo" || cls.recordManagement !== "supported") {
    throw new OneShotGuardError(`authority_not_managed:${cls.provider}`);
  }
}

/** Builds the preview for adding exactly one TXT record; throws on any violation. */
export function previewTxtAddition(baseline: DnsRecord[], record: DnsRecord): DnsPreview {
  if (record.type !== "TXT") throw new OneShotGuardError("type_not_txt");
  if (record.host === "@" || record.host === "") throw new OneShotGuardError("apex_forbidden");
  if (record.host.includes("*")) throw new OneShotGuardError("wildcard_forbidden");
  if (isProtected(record)) throw new OneShotGuardError("protected_record_forbidden");
  // Duplicate prevention: no existing record with the same (type, host).
  if (baseline.some((b) => b.type.toUpperCase() === "TXT" && b.host.toLowerCase() === record.host.toLowerCase())) {
    throw new OneShotGuardError("duplicate_host");
  }
  return { additions: [record], modifications: [], deletions: [], protectedConflicts: [] };
}

function classify(outcome: RegistrarOutcome): DnsOpClassification {
  switch (outcome) {
    case "definitive_success": return "added";
    case "definitive_failure": return "failed";
    case "provider_rejection": return "rejected";
    case "transport_failure_pre_acceptance": return "transport_unknown";
    case "ambiguous_unknown": return "needs_attention";
  }
}

export interface DnsOneShotDeps {
  registrar: DomainRegistrarProvider;
  providers: AuthoritativeDnsProvider[];
  now: () => string;
  newId: () => string;
}

export interface AddTxtRequest {
  domain: string;
  nameservers: string[];
  authorityFresh: boolean;
  host: string;
  value: string;
  ttl: number;
  acknowledgment: string;
  auth: OneShotAuthorization;
}

export interface AddTxtResult {
  classification: DnsOpClassification;
  /** Provider record id of the added record (for the bound delete). */
  recordId?: string;
  matchCount: number;
  baselineCount: number;
  baseline: DnsRecord[];
  audit: DnsAudit;
}

export async function addOneTxtRecord(deps: DnsOneShotDeps, req: AddTxtRequest): Promise<AddTxtResult> {
  assertManagedAuthority(req.nameservers, deps.providers, req.authorityFresh); // zero calls if it throws
  const baseline = await deps.registrar.getDnsRecords(req.domain); // read-only baseline (may throw provider error)
  const record: DnsRecord = { type: "TXT", host: req.host, value: req.value, ttl: req.ttl };
  previewTxtAddition(baseline, record); // throws on any violation (apex/wildcard/protected/duplicate/type)

  req.auth.consume(req.acknowledgment); // single-use; a retry/2nd run throws
  const result = await deps.registrar.applyDnsRecords(req.domain, [{ op: "upsert", record }], deps.newId());

  let classification = classify(result.outcome);
  let recordId: string | undefined;
  let matchCount = 0;
  // Success + ambiguous/transport → read-only reconciliation to find the record.
  if (result.outcome === "definitive_success" || result.outcome === "ambiguous_unknown" || result.outcome === "transport_failure_pre_acceptance") {
    try {
      const after = await deps.registrar.getDnsRecords(req.domain);
      const matches = after.filter((r) => recKey(r) === recKey(record));
      matchCount = matches.length;
      // Exactly one matching record ⇒ added (resolves success + ambiguous +
      // transport); anything else ⇒ needs_attention (never resubmitted).
      if (matches.length === 1) { recordId = matches[0].providerRecordId; classification = "added"; }
      else classification = "needs_attention";
    } catch {
      if (result.outcome !== "definitive_success") classification = "needs_attention";
    }
  }
  const audit: DnsAudit = {
    operation: "dns_add", recordType: "TXT", hostFingerprint: fp(req.host), valueFingerprint: fp(req.value),
    classification, providerRefHash: refOrAbsent(result.providerCorrelationId), at: deps.now(),
  };
  return { classification, recordId, matchCount, baselineCount: baseline.length, baseline, audit };
}

export interface DeleteTxtRequest {
  domain: string;
  nameservers: string[];
  authorityFresh: boolean;
  /** REQUIRED provider record id — delete binds to this, never host/type alone. */
  recordId: string;
  host: string;
  value: string;
  /** The pre-add baseline, to confirm preservation after deletion. */
  baseline: DnsRecord[];
  acknowledgment: string;
  auth: OneShotAuthorization;
}

export interface DeleteTxtResult {
  classification: DnsOpClassification;
  absent: boolean;
  baselinePreserved: boolean;
  audit: DnsAudit;
}

export async function deleteOneTxtRecord(deps: DnsOneShotDeps, req: DeleteTxtRequest): Promise<DeleteTxtResult> {
  assertManagedAuthority(req.nameservers, deps.providers, req.authorityFresh);
  if (!req.recordId || !req.recordId.trim()) throw new OneShotGuardError("delete_requires_record_id");

  req.auth.consume(req.acknowledgment);
  const target = { type: "TXT" as const, host: req.host, value: req.value, providerRecordId: req.recordId };
  const result = await deps.registrar.applyDnsRecords(req.domain, [{ op: "delete", record: target }], deps.newId());

  let classification = classify(result.outcome);
  let absent = false;
  let baselinePreserved = true;
  if (result.outcome === "definitive_success" || result.outcome === "ambiguous_unknown" || result.outcome === "transport_failure_pre_acceptance") {
    try {
      const after = await deps.registrar.getDnsRecords(req.domain);
      absent = !after.some((r) => r.providerRecordId === req.recordId);
      // Preservation: every pre-add baseline record still present (by id, else key).
      baselinePreserved = req.baseline.every((b) =>
        after.some((r) => (b.providerRecordId ? r.providerRecordId === b.providerRecordId : recKey(r) === recKey(b))));
      // Deleted ONLY when the exact target is gone AND nothing else changed;
      // collateral loss or a still-present target ⇒ needs_attention (never repeat).
      classification = absent && baselinePreserved ? "deleted" : "needs_attention";
    } catch {
      if (result.outcome !== "definitive_success") classification = "needs_attention";
    }
  }
  const audit: DnsAudit = {
    operation: "dns_delete", recordType: "TXT", hostFingerprint: fp(req.host), valueFingerprint: fp(req.value),
    classification, providerRefHash: refOrAbsent(result.providerCorrelationId || req.recordId), at: deps.now(),
  };
  return { classification, absent, baselinePreserved, audit };
}
