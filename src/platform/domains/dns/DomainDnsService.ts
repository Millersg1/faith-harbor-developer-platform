/**
 * DNS & nameserver provisioning service (Stage 8) — provider-neutral, sandbox/
 * fake only. Enforces the hard safety boundaries from the architecture (§8) and
 * the Stage 8 authorization:
 *
 *  - **Only after confirmed registration.** Every mutation gates on a confirmed,
 *    tenant-owned registration; DNS state is tracked SEPARATELY from ownership.
 *  - **Preview before apply.** Callers can diff a change set (adds/updates/
 *    deletes + protected conflicts + validation issues) without touching the
 *    provider.
 *  - **Preserve, don't clobber.** Existing records are kept on edit; a change
 *    that deletes or overwrites a PROTECTED record (mail/SPF/DKIM/DMARC/CAA/
 *    ACME/sub-delegation) is refused unless the caller explicitly authorizes it.
 *  - **Honest outcomes.** A provider mutation carries the five-way outcome; an
 *    `ambiguous_unknown` (or a thrown/timeout) is NEVER blindly retried, makes
 *    NO auto-rollback promise, and drives read-only reconciliation instead.
 *  - **Honest propagation.** Results say changes take time to propagate — never
 *    "instant".
 *  - **PII-minimised audit.** Every change appends an immutable record with the
 *    change type, record type + host label and a value FINGERPRINT — never the
 *    record value itself.
 *  - **Crossover defense.** A hosting account can only be attached when it
 *    belongs to the SAME tenant as the registration.
 */

import { createHash } from "node:crypto";

import type { DomainRegistrationRepository } from "../DomainRegistrationRepository";
import type {
  DnsRecord,
  DnsRecordChange,
  DomainRegistrarProvider,
  NameserverMode,
} from "../RegistrarProvider";
import {
  classifyAuthority,
  type AuthoritativeDnsProvider,
  type AuthorityClassification,
} from "./dnsAuthority";
import {
  protectionReason,
  validateNameservers,
  validateRecord,
  type ValidationIssue,
} from "./dnsValidation";
import type { DomainDnsRepository, DnsState } from "./DomainDnsRepository";

export class DnsGateError extends Error {
  constructor(readonly gate: string) {
    super(`DNS gate failed: ${gate}.`);
    this.name = "DnsGateError";
  }
}
export class DnsValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(`DNS validation failed (${issues.length} issue(s)).`);
    this.name = "DnsValidationError";
  }
}
export class DnsProtectedError extends Error {
  constructor(readonly conflicts: ProtectedConflict[]) {
    super(`Change would alter ${conflicts.length} protected record(s); explicit authorization required.`);
    this.name = "DnsProtectedError";
  }
}
/**
 * Refuses a zone-record mutation because the domain is NOT using a managed
 * provider's authoritative DNS (or that authority is not freshly verified).
 */
export class DnsAuthorityError extends Error {
  constructor(
    readonly authorityProvider: string,
    readonly recordManagement: string,
  ) {
    super(
      `Zone-record management is unavailable: authoritative DNS is "${authorityProvider}" ` +
        `(record management: ${recordManagement}). Records can only be edited when the ` +
        `domain uses a managed provider's authoritative DNS, freshly verified.`,
    );
    this.name = "DnsAuthorityError";
  }
}

export interface ProtectedConflict {
  reason: string;
  type: string;
  host: string;
}

export interface RecordChangePreview {
  issues: ValidationIssue[];
  additions: DnsRecord[];
  updates: { from: DnsRecord; to: DnsRecord }[];
  deletions: DnsRecord[];
  protectedConflicts: ProtectedConflict[];
  /** Records left untouched (preservation is the default). */
  preserved: number;
  propagationNote: string;
}

export interface DnsMutationView {
  outcome: string;
  applied: boolean;
  reconcileRequired: boolean;
  provisioningStatus: string;
  propagationNote: string;
  /** True when nothing about the local zone can be trusted until reconciled. */
  autoRollback: false;
}

const PROPAGATION_NOTE =
  "DNS changes are not instant — global propagation typically takes minutes to " +
  "several hours (up to 48h for some resolvers). Verify before relying on it.";

export interface DomainDnsServiceDeps {
  dns: DomainDnsRepository;
  registrations: DomainRegistrationRepository;
  registrar: DomainRegistrarProvider;
  now: () => string;
  newId: () => string;
  /** The All Elite Cloud nameservers (injected, never hard-coded/fabricated). */
  alleliteNameservers: string[];
  /**
   * How live nameservers map to an authoritative-DNS provider (injected, never
   * fabricated). e.g. NameSilo DNS = dnsowl.com (records supported); All Elite
   * cPanel = allelitehosting.com (externally managed until an adapter exists).
   */
  authoritativeDnsProviders: AuthoritativeDnsProvider[];
  /**
   * The authoritative-DNS provider id whose zone THIS registrar can mutate. For
   * a NameSilo registrar this is "namesilo". Record mutation is refused unless
   * the domain's authority matches this AND is freshly verified.
   */
  registrarAuthoritativeProvider: string;
}

export class DomainDnsService {
  constructor(private readonly d: DomainDnsServiceDeps) {}

  // ---- gate: confirmed, tenant-owned registration -------------------------
  private async requireConfirmed(registrationId: string) {
    const reg = await this.d.registrations.get(registrationId);
    if (!reg) throw new DnsGateError("registration_not_found");
    if (reg.status !== "active") throw new DnsGateError("registration_not_confirmed");
    return reg;
  }

  private async ensureState(registrationId: string): Promise<DnsState> {
    const existing = await this.d.dns.getState(registrationId);
    if (existing) return existing;
    const now = this.d.now();
    return this.d.dns.putState({
      id: this.d.newId(),
      registrationId,
      mode: "registrar_default",
      nameservers: [],
      provisioningStatus: "none",
      dnssecStatus: "unknown",
      syncState: "unknown",
      authorityProvider: "unknown",
      authorityState: "unknown",
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Read-only DNS state for a registration (tenant-scoped), or null. */
  async getState(registrationId: string) {
    return this.d.dns.getState(registrationId);
  }

  // ---- authority: WHO owns the zone (records only when we do, freshly) -----
  /**
   * Reads the LIVE nameservers and classifies which DNS service is authoritative
   * for the zone, persisting the result with a verification timestamp. This is
   * the freshness proof gating record mutation — a provider throw yields
   * `unknown` (never assumed as ours).
   */
  async verifyAuthority(registrationId: string): Promise<AuthorityClassification & { state: string }> {
    const reg = await this.requireConfirmed(registrationId);
    const state = await this.ensureState(registrationId);
    const now = this.d.now();
    let nameservers: string[];
    try {
      nameservers = await this.d.registrar.getNameservers(reg.asciiDomain);
    } catch {
      await this.d.dns.putState({ ...state, authorityProvider: "unknown", authorityState: "unknown", authorityVerifiedAt: now, updatedAt: now });
      return { provider: "unknown", recordManagement: "unknown", state: "unknown" };
    }
    const cls = classifyAuthority(nameservers, this.d.authoritativeDnsProviders);
    const authState = cls.provider === "unknown" ? "unknown" : "fresh";
    await this.d.dns.putState({ ...state, authorityProvider: cls.provider, authorityState: authState, authorityVerifiedAt: now, updatedAt: now });
    return { ...cls, state: authState };
  }

  /**
   * Reports whether the platform can manage zone records for this domain today.
   * cPanel/external-authoritative domains are `externally_managed`; unresolved
   * authority is `unknown`. UI uses this to represent the domain honestly.
   */
  async recordCapability(registrationId: string): Promise<{ manageable: boolean; authorityProvider: string; recordManagement: string }> {
    const authority = await this.verifyAuthority(registrationId);
    const manageable =
      authority.provider === this.d.registrarAuthoritativeProvider && authority.recordManagement === "supported";
    return { manageable, authorityProvider: authority.provider, recordManagement: authority.recordManagement };
  }

  // ---- nameservers --------------------------------------------------------
  async setNameserverMode(
    registrationId: string,
    mode: NameserverMode,
    customNameservers: string[] | undefined,
    actorUserId: string,
  ): Promise<DnsMutationView> {
    const reg = await this.requireConfirmed(registrationId);
    const state = await this.ensureState(registrationId);

    const nameservers =
      mode === "allelite"
        ? this.d.alleliteNameservers
        : mode === "custom"
          ? (customNameservers ?? []).map((n) => n.trim().toLowerCase())
          : []; // registrar_default: provider keeps its own NS

    if (mode !== "registrar_default") {
      const issues = validateNameservers(nameservers);
      if (issues.length) throw new DnsValidationError(issues);
    }

    const now = this.d.now();
    let outcome = "definitive_success";
    let applied = true;
    if (mode === "registrar_default") {
      // We do not push nameservers; the registrar's defaults remain authoritative.
      applied = true;
    } else {
      try {
        const res = await this.d.registrar.setNameservers(
          reg.asciiDomain, nameservers, `ns:${registrationId}:${hashList(nameservers)}`,
        );
        outcome = res.outcome;
        applied = res.applied;
      } catch {
        outcome = "ambiguous_unknown";
        applied = false;
      }
    }

    const success = outcome === "definitive_success";
    const provisioningStatus = success ? "active" : outcome === "ambiguous_unknown" ? "unknown" : "needs_attention";
    // A delegation change changes WHO is authoritative for the zone. When we know
    // the new nameservers (allelite/custom) classify from them; registrar_default
    // leaves it unknown until a live verification reads the registrar's NS.
    const authority =
      success && mode !== "registrar_default"
        ? classifyAuthority(nameservers, this.d.authoritativeDnsProviders)
        : { provider: "unknown" as string, recordManagement: "unknown" as string };
    const authorityState = authority.provider === "unknown" ? "unknown" : "fresh";
    await this.d.dns.putState({
      ...state,
      mode,
      nameservers: success ? nameservers : state.nameservers,
      provisioningStatus,
      syncState: success ? "fresh" : "unknown",
      lastProviderSyncAt: success ? now : state.lastProviderSyncAt,
      authorityProvider: success ? authority.provider : state.authorityProvider,
      authorityState: success ? authorityState : state.authorityState,
      authorityVerifiedAt: success ? now : state.authorityVerifiedAt,
      updatedAt: now,
    });
    await this.d.dns.appendChange({
      id: this.d.newId(), registrationId, changeType: "set_nameservers",
      host: mode, valueFingerprint: hashList(nameservers), outcome, actorUserId, createdAt: now,
    });

    return view(outcome, applied, provisioningStatus);
  }

  // ---- records: preview ---------------------------------------------------
  async previewRecordChanges(
    registrationId: string,
    changes: DnsRecordChange[],
  ): Promise<RecordChangePreview> {
    await this.requireConfirmed(registrationId);
    const current = await this.d.dns.listRecords(registrationId);
    const issues: ValidationIssue[] = [];
    const additions: DnsRecord[] = [];
    const updates: { from: DnsRecord; to: DnsRecord }[] = [];
    const deletions: DnsRecord[] = [];
    const protectedConflicts: ProtectedConflict[] = [];

    const sameKey = (a: Pick<DnsRecord, "type" | "host">, b: Pick<DnsRecord, "type" | "host">) =>
      a.type === b.type && a.host.toLowerCase() === b.host.toLowerCase();
    const exact = (a: DnsRecord, b: Pick<DnsRecord, "type" | "host" | "value">) =>
      sameKey(a, b) && a.value === b.value;

    for (const change of changes) {
      if (change.op === "upsert") {
        const recIssues = validateRecord(change.record);
        issues.push(...recIssues);
        if (recIssues.length) continue;
        const existing = current.find((r) => sameKey(r, change.record));
        if (!existing) {
          additions.push(change.record);
        } else if (existing.value !== change.record.value || existing.ttl !== change.record.ttl || existing.priority !== change.record.priority) {
          updates.push({ from: existing, to: change.record });
          const reason = protectionReason(existing);
          if (reason) protectedConflicts.push({ reason, type: existing.type, host: existing.host });
        }
      } else {
        const existing = current.find((r) => exact(r, change.record));
        if (existing) {
          deletions.push(existing);
          const reason = protectionReason(existing);
          if (reason) protectedConflicts.push({ reason, type: existing.type, host: existing.host });
        }
      }
    }

    const touched = new Set([...updates.map((u) => key(u.from)), ...deletions.map(key)]);
    const preserved = current.filter((r) => !touched.has(key(r))).length;

    return { issues, additions, updates, deletions, protectedConflicts, preserved, propagationNote: PROPAGATION_NOTE };
  }

  // ---- records: apply -----------------------------------------------------
  async applyRecordChanges(
    registrationId: string,
    changes: DnsRecordChange[],
    opts: { authorizeProtected?: boolean; actorUserId: string },
  ): Promise<DnsMutationView> {
    const reg = await this.requireConfirmed(registrationId);
    // AUTHORITY GATE: never edit a zone we do not authoritatively serve. Verify
    // (freshly, from the live nameservers) that a managed provider is
    // authoritative; refuse for cPanel/external/unknown — this also blocks any
    // cross-provider mutation attempt.
    const authority = await this.verifyAuthority(registrationId);
    if (authority.provider !== this.d.registrarAuthoritativeProvider || authority.recordManagement !== "supported") {
      throw new DnsAuthorityError(authority.provider, authority.recordManagement);
    }
    const preview = await this.previewRecordChanges(registrationId, changes);
    if (preview.issues.length) throw new DnsValidationError(preview.issues);
    if (preview.protectedConflicts.length && !opts.authorizeProtected) {
      throw new DnsProtectedError(preview.protectedConflicts);
    }

    const now = this.d.now();
    const state = await this.ensureState(registrationId);
    let outcome = "definitive_success";
    let applied = true;
    try {
      const res = await this.d.registrar.applyDnsRecords(
        reg.asciiDomain, changes, `dns:${registrationId}:${hashChanges(changes)}`,
      );
      outcome = res.outcome;
      applied = res.applied;
    } catch {
      // Cannot tell whether the provider applied it → ambiguous, reconcile.
      outcome = "ambiguous_unknown";
      applied = false;
    }

    const success = outcome === "definitive_success";
    if (success) {
      // Compute + persist the new managed desired set (preserve untouched).
      const next = applyChanges(await this.d.dns.listRecords(registrationId), changes);
      await this.d.dns.replaceRecords(registrationId, next, now);
      await this.d.dns.putState({ ...state, provisioningStatus: "active", syncState: "fresh", lastProviderSyncAt: now, updatedAt: now });
    } else if (outcome === "ambiguous_unknown") {
      // Do NOT change the local desired set; mark for reconciliation.
      await this.d.dns.putState({ ...state, provisioningStatus: "unknown", syncState: "unknown", updatedAt: now });
    } else {
      await this.d.dns.putState({ ...state, provisioningStatus: "needs_attention", updatedAt: now });
    }

    // Append one immutable audit row per change (type + host + fingerprint only).
    for (const change of changes) {
      const rec = change.record;
      await this.d.dns.appendChange({
        id: this.d.newId(), registrationId,
        changeType: change.op === "delete" ? "delete_record" : "upsert_record",
        recordType: rec.type, host: rec.host,
        valueFingerprint: hash(rec.value ?? ""), outcome, actorUserId: opts.actorUserId, createdAt: now,
      });
    }

    const provisioningStatus = success ? "active" : outcome === "ambiguous_unknown" ? "unknown" : "needs_attention";
    return view(outcome, applied, provisioningStatus);
  }

  // ---- read-only reconciliation ------------------------------------------
  /**
   * Reads the LIVE provider zone and compares it to the managed desired set.
   * Never mutates the provider. On a provider throw the state becomes
   * needs_attention (never fabricated as in-sync).
   */
  async reconcileZone(registrationId: string): Promise<{ syncState: string; drift: number }> {
    const reg = await this.requireConfirmed(registrationId);
    const now = this.d.now();
    let live: DnsRecord[];
    try {
      live = await this.d.registrar.getDnsRecords(reg.asciiDomain);
    } catch {
      await this.d.dns.markSync(registrationId, "needs_attention", now);
      return { syncState: "needs_attention", drift: -1 };
    }
    const desired = await this.d.dns.listRecords(registrationId);
    const liveKeys = new Set(live.map((r) => `${r.type}|${r.host.toLowerCase()}|${r.value}`));
    const desiredKeys = new Set(desired.map((r) => `${r.type}|${r.host.toLowerCase()}|${r.value}`));
    let drift = 0;
    for (const k of desiredKeys) if (!liveKeys.has(k)) drift++;
    for (const k of liveKeys) if (!desiredKeys.has(k)) drift++;
    const syncState = drift === 0 ? "fresh" : "stale";
    await this.d.dns.markSync(registrationId, syncState, now);
    return { syncState, drift };
  }

  // ---- DNSSEC status (read-only) -----------------------------------------
  async refreshDnssec(registrationId: string): Promise<string> {
    const reg = await this.requireConfirmed(registrationId);
    const state = await this.ensureState(registrationId);
    const now = this.d.now();
    try {
      const info = await this.d.registrar.getDnssec(reg.asciiDomain);
      const status = !info.supported ? "unsupported" : info.enabled ? "signed" : "unsigned";
      await this.d.dns.putState({ ...state, dnssecStatus: status, updatedAt: now });
      return status;
    } catch {
      await this.d.dns.putState({ ...state, dnssecStatus: "needs_attention", updatedAt: now });
      return "needs_attention";
    }
  }

  // ---- hosting attach (crossover defense) --------------------------------
  async attachHosting(registrationId: string, hostingAccountId: string, actorUserId: string): Promise<DnsState> {
    await this.requireConfirmed(registrationId);
    const owner = await this.d.dns.hostingAccountOrg(hostingAccountId);
    if (!owner) throw new DnsGateError("hosting_account_not_found_in_tenant"); // crossover defense
    const state = await this.ensureState(registrationId);
    const now = this.d.now();
    const next = await this.d.dns.putState({ ...state, hostingAccountId, updatedAt: now });
    await this.d.dns.appendChange({
      id: this.d.newId(), registrationId, changeType: "attach_hosting",
      valueFingerprint: hash(hostingAccountId), outcome: "definitive_success", actorUserId, createdAt: now,
    });
    return next;
  }

  async detachHosting(registrationId: string, actorUserId: string): Promise<DnsState> {
    await this.requireConfirmed(registrationId);
    const state = await this.ensureState(registrationId);
    const now = this.d.now();
    const next = await this.d.dns.putState({ ...state, hostingAccountId: undefined, updatedAt: now });
    await this.d.dns.appendChange({
      id: this.d.newId(), registrationId, changeType: "detach_hosting",
      outcome: "definitive_success", actorUserId, createdAt: now,
    });
    return next;
  }
}

// ---- helpers ---------------------------------------------------------------

function view(outcome: string, applied: boolean, provisioningStatus: string): DnsMutationView {
  return {
    outcome,
    applied,
    reconcileRequired: outcome === "ambiguous_unknown",
    provisioningStatus,
    propagationNote: PROPAGATION_NOTE,
    autoRollback: false,
  };
}

function key(r: Pick<DnsRecord, "type" | "host" | "value">): string {
  return `${r.type}|${r.host.toLowerCase()}|${r.value}`;
}

/** Applies a change set to a record list (preserving untouched records). */
function applyChanges(current: DnsRecord[], changes: DnsRecordChange[]): DnsRecord[] {
  const out = current.map((r) => ({ ...r }));
  const sameKey = (a: DnsRecord, b: Pick<DnsRecord, "type" | "host">) =>
    a.type === b.type && a.host.toLowerCase() === b.host.toLowerCase();
  for (const change of changes) {
    if (change.op === "delete") {
      const i = out.findIndex((r) => sameKey(r, change.record) && r.value === change.record.value);
      if (i >= 0) out.splice(i, 1);
    } else {
      const i = out.findIndex((r) => sameKey(r, change.record));
      // MX/TXT are multi-valued: an upsert of a new value adds rather than replaces.
      if (i >= 0 && change.record.type !== "MX" && change.record.type !== "TXT") {
        out[i] = { ...change.record };
      } else if (!out.some((r) => sameKey(r, change.record) && r.value === change.record.value)) {
        out.push({ ...change.record });
      }
    }
  }
  return out;
}

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}
function hashList(items: string[]): string {
  return hash(items.map((i) => i.toLowerCase()).sort().join(","));
}
function hashChanges(changes: DnsRecordChange[]): string {
  return hash(changes.map((c) => `${c.op}:${c.record.type}:${c.record.host}:${c.record.value}`).join("|"));
}
