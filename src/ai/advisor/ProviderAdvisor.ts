import type { AIRequest } from "../AIProvider";
import type { ProviderRecommendation } from "./ProviderRecommendation";

/**
 * Advises the AI Director on which provider should
 * execute a request.
 */
export interface ProviderAdvisor {
  /**
   * Returns the recommended provider for a request.
   */
  recommend(
    request: AIRequest,
  ): ProviderRecommendation;
}