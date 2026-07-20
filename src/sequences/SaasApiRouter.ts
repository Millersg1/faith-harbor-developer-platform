import { Router } from "express";
import { z } from "zod";

import { ApiKeyService } from "../apikeys/ApiKeyService";
import {
  requireApiKey,
  type ApiKeyRequest,
} from "../apikeys/requireApiKey";
import type { AIService } from "../ai/AIService";
import { aiCapabilities } from "../ai/Capability";
import type { BrandService } from "../brands/BrandService";
import { SequenceService } from "./SequenceService";

const generateSchema = z.object({
  prompt: z.string().trim().min(1),
  capability: z
    .enum(aiCapabilities)
    .optional(),
});

/**
 * A step accepts a subject, a body, and an optional delay. The delay
 * may be given in minutes, hours, or days under several field names so
 * the endpoint matches whatever the calling integration sends.
 */
const stepSchema = z
  .object({
    subject: z.string().trim().min(1),
    body: z.string().trim().min(1),
    delayMinutes: z.number().optional(),
    delay_minutes: z.number().optional(),
    delayHours: z.number().optional(),
    delay_hours: z.number().optional(),
    delayDays: z.number().optional(),
    delay_days: z.number().optional(),
  })
  .transform((step) => {
    const minutes =
      step.delayMinutes ??
      step.delay_minutes ??
      (step.delayHours !== undefined
        ? step.delayHours * 60
        : undefined) ??
      (step.delay_hours !== undefined
        ? step.delay_hours * 60
        : undefined) ??
      (step.delayDays !== undefined
        ? step.delayDays * 60 * 24
        : undefined) ??
      (step.delay_days !== undefined
        ? step.delay_days * 60 * 24
        : undefined) ??
      0;

    return {
      subject: step.subject,
      body: step.body,
      delayMinutes: minutes,
    };
  });

const createWorkflowSchema = z.object({
  name: z.string().trim().min(1),
  steps: z.array(stepSchema).min(1),
});

const enrollSchema = z.object({
  email: z.string().trim().email(),
  workflow_id: z
    .string()
    .trim()
    .min(1)
    .optional(),
  workflowId: z
    .string()
    .trim()
    .min(1)
    .optional(),
  first_name: z
    .string()
    .trim()
    .optional(),
  last_name: z
    .string()
    .trim()
    .optional(),
  phone: z.string().trim().optional(),
});

/**
 * The SaaS Surface API. External systems (a product's Stripe webhook,
 * the /create business launcher) authenticate with an X-API-Key and
 * drive the drip-email engine. Paths mirror the established SaaS
 * Surface contract so existing integrations work unchanged.
 */
export function createSaasApiRouter(
  apiKeys: ApiKeyService,
  sequences: SequenceService,
  options: {
    brands?: BrandService;
    defaultEmail?: string;
    accountName?: string;
    ai?: AIService;
  } = {},
): Router {
  const router = Router();

  router.use(requireApiKey(apiKeys));

  // Connection check: confirms the key works and reports which brand
  // it acts for.
  router.get(
    "/me",
    (req: ApiKeyRequest, res) => {
      const key = req.apiKey;

      const brand = key?.brandId
        ? options.brands?.get(
            key.brandId,
          )
        : undefined;

      res.json({
        id: key?.id ?? null,
        name:
          brand?.name ??
          key?.name ??
          options.accountName ??
          "Faith Harbor OS",
        email:
          brand?.fromEmail ??
          options.defaultEmail ??
          null,
        brand_id: key?.brandId ?? null,
      });
    },
  );

  // Create a drip sequence ("workflow").
  router.post(
    "/actions/create-workflow",
    (req: ApiKeyRequest, res) => {
      const parsed =
        createWorkflowSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code:
              "INVALID_WORKFLOW",
            message:
              "A workflow needs a name and at least one step (subject + body).",
            details:
              parsed.error.flatten(),
          },
        });

        return;
      }

      const sequence =
        sequences.createSequence({
          name: parsed.data.name,
          brandId: req.apiKey?.brandId,
          steps: parsed.data.steps,
        });

      res.status(201).json({
        workflow: {
          id: sequence.id,
          name: sequence.name,
          steps: sequence.steps.length,
        },
      });
    },
  );

  // Enroll a contact into a sequence.
  router.post(
    "/actions/enroll-in-workflow",
    (req: ApiKeyRequest, res) => {
      const parsed =
        enrollSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "INVALID_ENROLLMENT",
            message:
              "Enrollment needs an email and a workflow_id.",
            details:
              parsed.error.flatten(),
          },
        });

        return;
      }

      const workflowId =
        parsed.data.workflow_id ??
        parsed.data.workflowId;

      if (!workflowId) {
        res.status(400).json({
          error: {
            code: "INVALID_ENROLLMENT",
            message:
              "A workflow_id is required.",
          },
        });

        return;
      }

      // Tenant isolation: a key may only enroll into a workflow that
      // belongs to the same brand it acts for. A key with no brand
      // owns the unbranded space. Unknown-or-other-brand workflows
      // return 404 so a key cannot probe another brand's ids.
      const sequence =
        sequences.getSequence(
          workflowId,
        );

      const callerBrand =
        req.apiKey?.brandId ?? null;

      if (
        !sequence ||
        (sequence.brandId ?? null) !==
          callerBrand
      ) {
        res.status(404).json({
          error: {
            code: "ENROLLMENT_FAILED",
            message: `Workflow "${workflowId}" was not found.`,
          },
        });

        return;
      }

      try {
        const result =
          sequences.enroll({
            sequenceId: workflowId,
            email: parsed.data.email,
            firstName:
              parsed.data.first_name,
            lastName:
              parsed.data.last_name,
            phone: parsed.data.phone,
          });

        res.status(201).json({
          client: result.client ?? null,
          enrollment: result.enrollment,
        });
      } catch (error) {
        res.status(404).json({
          error: {
            code: "ENROLLMENT_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Enrollment failed.",
          },
        });
      }
    },
  );

  // AI text generation, routed through this engine's provider manager
  // so every token — including SaaS Surface's — is recorded in AI
  // Spend. This is the reason to run SaaS Surface on this engine:
  // one place to see all AI cost.
  router.post(
    "/actions/generate-text",
    async (req: ApiKeyRequest, res) => {
      if (!options.ai) {
        res.status(503).json({
          error: {
            code: "AI_UNAVAILABLE",
            message:
              "No AI provider is configured on this engine.",
          },
        });

        return;
      }

      const parsed =
        generateSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "INVALID_GENERATION",
            message:
              "A prompt is required.",
            details:
              parsed.error.flatten(),
          },
        });

        return;
      }

      try {
        const response =
          await options.ai.generate({
            capability:
              parsed.data.capability ??
              "writing",
            prompt: parsed.data.prompt,
            context: {
              apiKeyId: req.apiKey?.id,
              brandId:
                req.apiKey?.brandId,
            },
          });

        res.json({
          content: response.content,
          provider: response.provider,
          model: response.model,
          tokensUsed:
            response.tokensUsed,
        });
      } catch (error) {
        res.status(502).json({
          error: {
            code: "GENERATION_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Generation failed.",
          },
        });
      }
    },
  );

  return router;
}
