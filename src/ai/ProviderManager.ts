import type {
  AIProvider,
  AIRequest,
} from "./AIProvider";
import { ProviderRegistry } from "./ProviderRegistry";

/**
 * Responsible for selecting an AI provider to satisfy a request.
 *
 * The ProviderManager performs provider selection while the
 * ProviderRegistry simply stores available providers.
 */
export class ProviderManager {
  constructor(
    private readonly registry: ProviderRegistry,
  ) {}

  /**
   * Selects the first provider supporting the requested capability.
   *
   * Future versions may support:
   * - Priority routing
   * - Cost optimization
   * - Health-based routing
   * - Local-first routing
   * - Geographic routing
   */
  select(request: AIRequest): AIProvider {
    const providers = this.registry.findByCapability(
      request.capability,
    );

    if (providers.length === 0) {
      throw new Error(
        `No AI provider supports capability "${request.capability}".`,
      );
    }

    return providers[0];
  }

  /**
   * Executes a request using the selected provider.
   */
  async generate(request: AIRequest) {
    const provider = this.select(request);

    return provider.generate(request);
  }
}