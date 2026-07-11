export const aiCapabilities = [
  "planning",
  "research",
  "writing",
  "summarization",
  "code_generation",
  "code_review",
  "testing",
  "data_analysis",
  "image_generation",
  "audio_generation",
  "orchestration",
] as const;

export type AICapability = (typeof aiCapabilities)[number];