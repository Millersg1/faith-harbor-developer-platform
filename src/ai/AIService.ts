import type {
  AIProvider,
  AIRequest,
  AIResponse,
} from "./AIProvider";
import type { AIDecisionRecord } from "./director/AIDecisionRecord";
import type { AIExecutionPlan } from "./execution/AIExecutionPlan";
import {
  buildFaithHarborPrompt,
} from "./FaithHarborGrounding";
import type { AIProviderScorecard } from "./metrics/AIProviderScorecard";
import { ProviderManager } from "./ProviderManager";
import { ProviderRegistry } from "./ProviderRegistry";
import type {
  AddRuntimeMessageInput,
  CreateRuntimeSessionInput,
  CreateWorkerSessionInput,
} from "./runtime/RuntimeSessionManager";
import { RuntimeSessionManager } from "./runtime/RuntimeSessionManager";
import type { RuntimeMessage } from "./runtime/RuntimeMessage";
import type { RuntimeSession } from "./runtime/RuntimeSession";
import type { AIWorker } from "./workers/AIWorker";
import { AIWorkerRegistry } from "./workers/AIWorkerRegistry";

/**
 * Provides the public application-facing interface for AI operations.
 *
 * Other Faith Harbor OS modules should depend on this service instead
 * of directly selecting or invoking concrete AI providers.
 *
 * Every executed request is grounded in the canonical Faith Harbor
 * identity and governance context before reaching a provider.
 */
export class AIService {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly manager: ProviderManager,
    private readonly runtime =
      new RuntimeSessionManager(),
    private readonly workers =
      new AIWorkerRegistry(),
  ) {}

  /**
   * Registers an AI provider with the system.
   */
  registerProvider(
    provider: AIProvider,
  ): void {
    this.registry.register(provider);

    this.manager
      .getMetricsRegistry()
      .register(
        provider.id,
        provider.name,
      );
  }

  /**
   * Removes an AI provider from the system.
   */
  unregisterProvider(
    providerId: string,
  ): boolean {
    const removed =
      this.registry.unregister(
        providerId,
      );

    if (removed) {
      this.manager
        .getMetricsRegistry()
        .unregister(providerId);
    }

    return removed;
  }

  /**
   * Determines whether a provider is registered.
   */
  hasProvider(
    providerId: string,
  ): boolean {
    return this.registry.has(
      providerId,
    );
  }

  /**
   * Returns all currently registered providers.
   */
  getProviders():
  readonly AIProvider[] {
    return this.registry.getAll();
  }

  /**
   * Returns all AI provider operational scorecards.
   */
  getProviderScorecards():
  readonly AIProviderScorecard[] {
    return this.manager
      .getMetricsRegistry()
      .getAll();
  }

  /**
   * Returns one provider operational scorecard.
   */
  getProviderScorecard(
    providerId: string,
  ): AIProviderScorecard | undefined {
    return this.manager
      .getMetricsRegistry()
      .get(providerId);
  }

  /**
   * Returns the Director's decision history.
   */
  getDecisionHistory():
  readonly AIDecisionRecord[] {
    return this.manager
      .getDecisionLog()
      .getAll();
  }

  /**
   * Registers a reusable AI worker.
   */
  registerWorker(
    worker: AIWorker,
  ): void {
    this.workers.register(worker);
  }

  /**
   * Removes a reusable AI worker.
   */
  unregisterWorker(
    workerId: string,
  ): boolean {
    return this.workers.unregister(
      workerId,
    );
  }

  /**
   * Determines whether an AI worker is registered.
   */
  hasWorker(
    workerId: string,
  ): boolean {
    return this.workers.has(
      workerId,
    );
  }

  /**
   * Returns one registered AI worker.
   */
  getWorker(
    workerId: string,
  ): AIWorker {
    return this.workers.get(
      workerId,
    );
  }

  /**
   * Returns all registered AI workers.
   */
  getWorkers():
  readonly AIWorker[] {
    return this.workers.list();
  }

  /**
   * Creates an LLM runtime session.
   */
  createRuntimeSession(
    input: CreateRuntimeSessionInput,
  ): RuntimeSession {
    return this.runtime.create(
      input,
    );
  }

  /**
   * Creates a runtime session from a registered AI worker.
   */
  createWorkerSession(
    workerId: string,
    input:
      CreateWorkerSessionInput = {},
  ): RuntimeSession {
    const worker =
      this.workers.get(workerId);

    return this.runtime
      .createFromWorker(
        worker,
        input,
      );
  }

  /**
   * Returns one LLM runtime session.
   */
  getRuntimeSession(
    sessionId: string,
  ): RuntimeSession {
    return this.runtime.get(
      sessionId,
    );
  }

  /**
   * Returns all LLM runtime sessions.
   */
  getRuntimeSessions():
  readonly RuntimeSession[] {
    return this.runtime.list();
  }

  /**
   * Returns all messages belonging to a runtime session.
   */
  getRuntimeMessages(
    sessionId: string,
  ): readonly RuntimeMessage[] {
    return this.runtime.getMessages(
      sessionId,
    );
  }

  /**
   * Adds a message directly to a runtime session.
   */
  addRuntimeMessage(
    sessionId: string,
    input: AddRuntimeMessageInput,
  ): RuntimeMessage {
    return this.runtime.addMessage(
      sessionId,
      input,
    );
  }

  /**
   * Deletes a runtime session and its messages.
   */
  deleteRuntimeSession(
    sessionId: string,
  ): boolean {
    return this.runtime.delete(
      sessionId,
    );
  }

  /**
   * Sends a user message through the AI Director and stores
   * both sides of the conversation in the runtime session.
   */
  async sendRuntimeMessage(
    sessionId: string,
    content: string,
  ): Promise<RuntimeMessage> {
    const session =
      this.runtime.get(sessionId);

    const userMessage =
      this.runtime.addMessage(
        sessionId,
        {
          role: "user",
          content,
        },
      );

    try {
      const response =
        await this.generate({
          capability:
            session.capability,

          prompt:
            this.buildRuntimePrompt(
              sessionId,
            ),

          context: {
            requestedProvider:
              session.provider,

            requestedModel:
              session.model,

            runtimeSessionId:
              session.id,
          },
        });

      return this.runtime.addMessage(
        sessionId,
        {
          role: "assistant",

          content:
            response.content,

          provider:
            response.provider,

          model:
            response.model,

          metadata: {
            capability:
              response.capability,

            tokensUsed:
              response.tokensUsed,
          },
        },
      );
    } catch (error) {
      this.runtime.addMessage(
        sessionId,
        {
          role: "assistant",

          content:
            "The AI request could not be completed.",

          metadata: {
            failed: true,

            userMessageId:
              userMessage.id,
          },
        },
      );

      throw error;
    }
  }

  /**
   * Creates an execution plan without running the request.
   *
   * Planning does not send content to a provider, so the original
   * request remains intact until execution.
   */
  plan(
    request: AIRequest,
  ): AIExecutionPlan {
    return this.manager.plan(
      request,
    );
  }

  /**
   * Executes an AI request through the AI Director.
   *
   * Before execution, the request is grounded in Faith Harbor's
   * canonical identity, mission, architecture, and governance rules.
   * The selected provider therefore receives trusted organizational
   * context together with the current request.
   */
  async generate(
    request: AIRequest,
  ): Promise<AIResponse> {
    const groundedRequest:
      AIRequest = {
        ...request,

        prompt:
          buildFaithHarborPrompt(
            request.prompt,
          ),

        context: {
          ...request.context,

          faithHarborGrounded:
            true,

          humanAuthority:
            true,
        },
      };

    return this.manager.generate(
      groundedRequest,
    );
  }

  /**
   * Builds a plain-text conversation transcript for providers
   * that currently accept one prompt string.
   */
  private buildRuntimePrompt(
    sessionId: string,
  ): string {
    return this.runtime
      .getMessages(sessionId)
      .map(
        (message) =>
          `${message.role.toUpperCase()}: ${message.content}`,
      )
      .join("\n\n");
  }
}