import type { AnthropicConfiguration } from "../config/AnthropicConfiguration";
import type { OpenAIConfiguration } from "../config/OpenAIConfiguration";

/**
 * Configuration for providers enabled during AI framework startup.
 */
export interface AIBootstrapConfiguration {
  openai?: OpenAIConfiguration;
  anthropic?: AnthropicConfiguration;
}