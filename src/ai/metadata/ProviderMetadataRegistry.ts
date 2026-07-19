import type { ProviderMetadata } from "../AIProvider";

/**
 * Stores and queries metadata for installed AI providers.
 */
export class ProviderMetadataRegistry {
  private readonly metadata = new Map<
    string,
    ProviderMetadata
  >();

  /**
   * Registers provider metadata.
   */
  register(
    providerId: string,
    metadata: ProviderMetadata,
  ): void {
    this.metadata.set(providerId, metadata);
  }

  /**
   * Returns metadata for a provider.
   */
  get(
    providerId: string,
  ): ProviderMetadata | undefined {
    return this.metadata.get(providerId);
  }

  /**
   * Returns metadata for all providers.
   */
  getAll(): readonly ProviderMetadata[] {
    return [...this.metadata.values()];
  }

  /**
   * Returns providers by vendor.
   */
  findByVendor(
    vendor: string,
  ): readonly ProviderMetadata[] {
    return this.getAll().filter(
      (metadata) => metadata.vendor === vendor,
    );
  }

  /**
   * Returns providers supporting streaming.
   */
  findStreaming(): readonly ProviderMetadata[] {
    return this.getAll().filter(
      (metadata) => metadata.supportsStreaming,
    );
  }

  /**
   * Returns providers supporting vision.
   */
  findVision(): readonly ProviderMetadata[] {
    return this.getAll().filter(
      (metadata) => metadata.supportsVision,
    );
  }

  /**
   * Returns providers supporting tools.
   */
  findTools(): readonly ProviderMetadata[] {
    return this.getAll().filter(
      (metadata) => metadata.supportsTools,
    );
  }

  /**
   * Returns providers supporting a model.
   */
  findByModel(
    model: string,
  ): readonly ProviderMetadata[] {
    return this.getAll().filter(
      (metadata) =>
        metadata.models.includes(model),
    );
  }

  /**
   * Clears all metadata.
   */
  clear(): void {
    this.metadata.clear();
  }
}