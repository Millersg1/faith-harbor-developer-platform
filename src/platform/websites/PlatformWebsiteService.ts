import { randomUUID } from "node:crypto";

import type { PlatformClientService } from "../clients/PlatformClientService";
import type {
  CreatePlatformWebsiteRequest,
  PlatformWebsiteRecord,
  UpdatePlatformWebsiteRequest,
} from "./PlatformWebsite";
import { PlatformWebsiteRepository } from "./PlatformWebsiteRepository";
import {
  DisconnectedWebsiteGenerator,
  type WebsiteGenerator,
} from "./WebsiteGenerator";

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
  ) {}

  /** Whether AI generation is available (an AI key is configured). */
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

    if (!this.generator.isConnected()) {
      throw new GeneratorUnavailableError(
        "AI website generation isn't set up yet. Add an AI key to enable it.",
      );
    }

    const result =
      await this.generator.generate({
        name: website.name,
        description:
          website.brief ||
          website.name,
        accentColor:
          website.accentColor,
      });

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
