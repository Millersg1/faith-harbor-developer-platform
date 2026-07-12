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

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly AICapability[];

  generate(request: AIRequest): Promise<AIResponse>;

  health(): Promise<ProviderHealth>;
}