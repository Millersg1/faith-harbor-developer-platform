import type { AICapability } from "./Capability";

export interface AIRequest {
  capability: AICapability;
  prompt: string;
  context?: Record<string, unknown>;
}

export interface AIResponse {
  provider: string;
  capability: AICapability;
  content: string;
  tokensUsed?: number;
  model?: string;
}

export interface ProviderHealth {
  status: "healthy" | "degraded" | "offline";
  checkedAt: string;
}

/**
 * Describes an AI provider without requiring provider-specific checks.
 */
export interface ProviderMetadata {
  readonly vendor: string;
  readonly version: string;
  readonly models: readonly string[];
  readonly supportsStreaming: boolean;
  readonly supportsVision: boolean;
  readonly supportsTools: boolean;
  readonly website?: string;
  readonly documentation?: string;
}

/**
 * Contract implemented by every AI provider in Faith Harbor OS.
 */
export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly AICapability[];
  readonly metadata: ProviderMetadata;

  generate(request: AIRequest): Promise<AIResponse>;

  health(): Promise<ProviderHealth>;
}