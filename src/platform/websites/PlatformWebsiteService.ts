import { randomUUID } from "node:crypto";

import { estimateCostMicros } from "../ai/AiUsageEvent";
import type { AiUsageRepository } from "../ai/AiUsageRepository";
import type { OrganizationAiSettingsService } from "../ai/OrganizationAiSettingsService";
import type { PlatformClientService } from "../clients/PlatformClientService";
import type {
  CreatePlatformWebsiteRequest,
  PlatformWebsiteRecord,
  UpdatePlatformWebsiteRequest,
} from "./PlatformWebsite";
import { PlatformWebsiteRepository } from "./PlatformWebsiteRepository";
import {
  createWebsiteGenerator,
  DisconnectedWebsiteGenerator,
  type WebsiteGenerator,
} from "./WebsiteGenerator";

/** Builds a generator from a provider/key — injectable for tests. */
export type GeneratorFactory = (input: {
  provider: string;
  apiKey: string;
  model?: string;
}) => WebsiteGenerator;

/** Thrown when generation is attempted but no AI key is configured. */
export class GeneratorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "GeneratorUnavailableError";
  }
}

/**
 * Manages AI-generated websites for the acting tenant.
 *
 * Building, generating, and publishing are tenant-scoped. When a website is
 * for one of the tenant's clients, the client reference is validated through
 * the tenant-scoped client service, so a site can never point at another
 * organization's client.
 */
export class PlatformWebsiteService {
  constructor(
    private readonly repository =
      new PlatformWebsiteRepository(),
    private readonly generator: WebsiteGenerator =
      new DisconnectedWebsiteGenerator(),
    private readonly clients?: PlatformClientService,
    private readonly aiSettings?: OrganizationAiSettingsService,
    private readonly aiUsage?: AiUsageRepository,
    private readonly generatorFactory: GeneratorFactory =
      createWebsiteGenerator,
  ) {}

  /**
   * Whether the platform's included AI is available. A tenant with its own
   * key can still generate even when this is false.
   */
  generationAvailable(): boolean {
    return this.generator.isConnected();
  }

  async create(
    request: CreatePlatformWebsiteRequest,
  ): Promise<PlatformWebsiteRecord> {
    const name = request.name.trim();

    if (!name) {
      throw new Error(
        "A website needs a name.",
      );
    }

    if (request.clientId) {
      await this.assertClientInTenant(
        request.clientId,
      );
    }

    const now =
      new Date().toISOString();

    return this.repository.create({
      id: randomUUID(),
      clientId: request.clientId,
      name,
      brief:
        request.brief?.trim() ||
        undefined,
      accentColor:
        request.accentColor?.trim() ||
        undefined,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(
    id: string,
  ): Promise<PlatformWebsiteRecord> {
    const website =
      await this.repository.get(id);

    if (!website) {
      throw new Error(
        "Website not found.",
      );
    }

    return website;
  }

  async list(): Promise<
    readonly PlatformWebsiteRecord[]
  > {
    return this.repository.list();
  }

  async count(): Promise<number> {
    return (
      await this.repository.list()
    ).length;
  }

  /**
   * Generates (or regenerates) the site's HTML from its brief via the AI
   * generator, and stores it. Throws {@link GeneratorUnavailableError} when
   * no AI key is configured so the API can surface a clear message.
   */
  async generate(
    id: string,
  ): Promise<PlatformWebsiteRecord> {
    const website =
      await this.get(id);

    // Resolve which generator to use: the tenant's own key (their spend)
    // when they've configured one, otherwise the platform's included AI.
    const settings = this.aiSettings
      ? await this.aiSettings.getRaw()
      : undefined;

    let generator: WebsiteGenerator;
    let ownKey: boolean;
    let provider: string;

    if (settings?.apiKey) {
      generator =
        this.generatorFactory({
          provider:
            settings.provider,
          apiKey: settings.apiKey,
          model: settings.model,
        });
      ownKey = true;
      provider = settings.provider;
    } else {
      generator = this.generator;
      ownKey = false;
      provider = "platform";
    }

    if (!generator.isConnected()) {
      throw new GeneratorUnavailableError(
        "AI website generation isn't set up yet. Add your own AI key in settings to enable it.",
      );
    }

    const result =
      await generator.generate({
        name: website.name,
        description:
          website.brief ||
          website.name,
        accentColor:
          website.accentColor,
      });

    // Meter the usage so cost is always visible (and never an open tab).
    if (this.aiUsage) {
      const model =
        result.model ||
        settings?.model ||
        "unknown";
      const usage = result.usage ?? {
        inputTokens: 0,
        outputTokens: 0,
      };

      await this.aiUsage.record({
        id: randomUUID(),
        kind: "website_generation",
        provider,
        model,
        inputTokens:
          usage.inputTokens,
        outputTokens:
          usage.outputTokens,
        costMicros:
          estimateCostMicros(
            model,
            usage.inputTokens,
            usage.outputTokens,
          ),
        ownKey,
        createdAt:
          new Date().toISOString(),
      });
    }

    const updated: PlatformWebsiteRecord =
      {
        ...website,
        html: result.html,
        updatedAt:
          new Date().toISOString(),
      };

    return this.repository.update(
      updated,
    );
  }

  async update(
    id: string,
    changes: UpdatePlatformWebsiteRequest,
  ): Promise<PlatformWebsiteRecord> {
    const existing =
      await this.get(id);

    if (changes.clientId) {
      await this.assertClientInTenant(
        changes.clientId,
      );
    }

    const clientId =
      changes.clientId === null
        ? undefined
        : (changes.clientId ??
          existing.clientId);

    const updated: PlatformWebsiteRecord =
      {
        ...existing,
        clientId,
        name:
          changes.name?.trim() ||
          existing.name,
        brief:
          changes.brief !== undefined
            ? changes.brief.trim() ||
              undefined
            : existing.brief,
        accentColor:
          changes.accentColor !==
          undefined
            ? changes.accentColor.trim() ||
              undefined
            : existing.accentColor,
        html:
          changes.html !== undefined
            ? changes.html
            : existing.html,
        status:
          changes.status ??
          existing.status,
        domain:
          changes.domain !== undefined
            ? changes.domain.trim() ||
              undefined
            : existing.domain,
        updatedAt:
          new Date().toISOString(),
      };

    return this.repository.update(
      updated,
    );
  }

  async delete(
    id: string,
  ): Promise<void> {
    await this.repository.delete(id);
  }

  private async assertClientInTenant(
    clientId: string,
  ): Promise<void> {
    if (!this.clients) {
      throw new Error(
        "Cannot attach a client: client service is unavailable.",
      );
    }

    await this.clients.get(clientId);
  }
}
