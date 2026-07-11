import { z } from "zod";
import { departments } from "../domain/departments";

export const createWorkflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  department: z.enum(departments),
  owner: z.string().min(1),
  requiresApproval: z.boolean().default(false),
  steps: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        completed: z.boolean().default(false),
      }),
    )
    .default([]),
  metadata: z.record(z.unknown()).optional(),
});

export const actorSchema = z.object({
  actor: z.string().min(1).default("system"),
});
