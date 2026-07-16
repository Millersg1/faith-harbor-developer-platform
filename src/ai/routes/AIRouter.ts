import { Router } from "express";

import {
  aiProviders,
  orchestrationPlatforms,
} from "../../domain/ai";
import type { AIService } from "../AIService";

interface AIChatRequestBody {
  prompt?: unknown;
  provider?: unknown;
}

/**
 * Creates the HTTP routes used by the Faith Harbor AI Console.
 */
export function createAIRouter(
  aiService?: AIService,
): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const registeredProviders =
      aiService?.getProviders().map((provider) => ({
        id: provider.id,
        name: provider.name,
        capabilities: provider.capabilities,
        models: provider.metadata.models,
      })) ?? [];

    res.json({
      providers: aiProviders,
      orchestration: orchestrationPlatforms,
      registeredProviders,
      available: Boolean(aiService),
      finalAuthority: "Human leadership",
    });
  });

  router.get("/metrics", (_req, res) => {
    if (!aiService) {
      res.status(503).json({
        error: {
          code: "AI_NOT_CONFIGURED",
          message:
            "No AI provider is currently configured.",
        },
      });

      return;
    }

    const scorecards =
      aiService.getProviderScorecards();

    res.json({
      count: scorecards.length,
      scorecards,
    });
  });

  router.get(
    "/metrics/:providerId",
    (req, res) => {
      if (!aiService) {
        res.status(503).json({
          error: {
            code: "AI_NOT_CONFIGURED",
            message:
              "No AI provider is currently configured.",
          },
        });

        return;
      }

      const scorecard =
        aiService.getProviderScorecard(
          req.params.providerId,
        );

      if (!scorecard) {
        res.status(404).json({
          error: {
            code: "PROVIDER_METRICS_NOT_FOUND",
            message:
              `No metrics were found for provider "${req.params.providerId}".`,
          },
        });

        return;
      }

      res.json({
        scorecard,
      });
    },
  );

  router.post("/chat", async (req, res, next) => {
    try {
      if (!aiService) {
        res.status(503).json({
          error: {
            code: "AI_NOT_CONFIGURED",
            message:
              "No AI provider is currently configured.",
          },
        });

        return;
      }

      const body = req.body as AIChatRequestBody;

      if (
        typeof body.prompt !== "string" ||
        body.prompt.trim().length === 0
      ) {
        res.status(400).json({
          error: {
            code: "INVALID_PROMPT",
            message:
              "A non-empty prompt is required.",
          },
        });

        return;
      }

      const result = await aiService.generate({
        capability: "writing",
        prompt: body.prompt.trim(),
        context: {
          requestedProvider:
            typeof body.provider === "string"
              ? body.provider
              : undefined,
        },
      });

      res.json({
        success: true,
        response: result.content,
        provider: result.provider,
        model: result.model,
        capability: result.capability,
        tokensUsed: result.tokensUsed,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}