/**
 * A tenant's own AI provider credentials. When set, that organization's AI
 * features (e.g. website generation) run on THEIR key and THEIR spend —
 * "bring your own key". When absent, the tenant falls back to the
 * platform's included/free AI.
 *
 * The stored key is a secret: it is never returned to clients in full (only
 * a masked hint), and lives only in the tenant-scoped table.
 */
export type AiProvider =
  | "openai"
  | "openrouter";

export interface OrganizationAiSettingsRecord {
  organizationId: string;
  provider: AiProvider;
  /** The tenant's API key for the chosen provider. Never sent to clients. */
  apiKey: string;
  /** Optional model override (e.g. "gpt-4o-mini", "openai/gpt-4o-mini"). */
  model?: string;
  updatedAt: string;
}

/** The safe, client-facing view of a tenant's AI settings — no raw key. */
export interface PublicAiSettings {
  provider: AiProvider;
  model?: string;
  hasKey: boolean;
  /** A masked hint like "sk-…a1b2", never the full key. */
  keyHint?: string;
  updatedAt: string;
}

export function isAiProvider(
  value: unknown,
): value is AiProvider {
  return (
    value === "openai" ||
    value === "openrouter"
  );
}

/** Masks a key to a short hint: first 3 + last 4 chars, rest elided. */
export function maskKey(
  key: string,
): string {
  if (!key) {
    return "";
  }

  if (key.length <= 8) {
    return "…";
  }

  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

export function toPublicAiSettings(
  record: OrganizationAiSettingsRecord,
): PublicAiSettings {
  const view: PublicAiSettings = {
    provider: record.provider,
    hasKey: Boolean(record.apiKey),
    updatedAt: record.updatedAt,
  };

  if (record.model) {
    view.model = record.model;
  }

  if (record.apiKey) {
    view.keyHint = maskKey(
      record.apiKey,
    );
  }

  return view;
}
