import {
  isAiProvider,
  toPublicAiSettings,
  type AiProvider,
  type OrganizationAiSettingsRecord,
  type PublicAiSettings,
} from "./OrganizationAiSettings";
import { OrganizationAiSettingsRepository } from "./OrganizationAiSettingsRepository";

export interface SetAiSettingsRequest {
  provider: AiProvider;
  apiKey: string;
  model?: string;
}

/**
 * Manages the acting tenant's own AI credentials (bring-your-own-key).
 * Everything is tenant-scoped through the repository, so a tenant only ever
 * touches its own settings.
 */
export class OrganizationAiSettingsService {
  constructor(
    private readonly repository =
      new OrganizationAiSettingsRepository(),
  ) {}

  /** The raw settings (including the key) — for internal use only. */
  async getRaw(): Promise<
    OrganizationAiSettingsRecord | undefined
  > {
    return this.repository.get();
  }

  /** The safe, client-facing view (masked key). */
  async getPublic(): Promise<PublicAiSettings | null> {
    const raw =
      await this.repository.get();

    return raw
      ? toPublicAiSettings(raw)
      : null;
  }

  async set(
    request: SetAiSettingsRequest,
  ): Promise<PublicAiSettings> {
    if (
      !isAiProvider(request.provider)
    ) {
      throw new Error(
        "Choose a supported provider (openai or openrouter).",
      );
    }

    const apiKey = (
      request.apiKey ?? ""
    ).trim();

    if (apiKey.length < 12) {
      throw new Error(
        "Enter a valid API key.",
      );
    }

    const record =
      await this.repository.upsert({
        provider: request.provider,
        apiKey,
        model:
          request.model?.trim() ||
          undefined,
        updatedAt:
          new Date().toISOString(),
      });

    return toPublicAiSettings(record);
  }

  async clear(): Promise<void> {
    await this.repository.delete();
  }
}
