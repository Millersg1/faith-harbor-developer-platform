import {
  describe,
  expect,
  it,
} from "vitest";

import {
  AiDraftPersonalizer,
  type PersonalizerAI,
} from "./DraftPersonalizer";

const input = {
  to: "jane@example.com",
  subject: "Welcome",
  body: "Hi Jane, thanks for reaching out.",
  trigger: "lead.created",
};

describe("AiDraftPersonalizer", () => {
  it("returns the AI-rewritten body", async () => {
    const ai: PersonalizerAI = {
      generate: async (request) => {
        // The prompt should carry the template body.
        expect(request.prompt)
          .toContain(
            "Hi Jane",
          );

        return {
          content:
            "Hi Jane,\n\nWe are so glad you reached out!",
        };
      },
    };

    const personalizer =
      new AiDraftPersonalizer(ai);

    const result =
      await personalizer.personalize(
        input,
      );

    expect(result)
      .toBe(
        "Hi Jane,\n\nWe are so glad you reached out!",
      );
  });

  it("falls back to null when the AI throws", async () => {
    const ai: PersonalizerAI = {
      generate: async () => {
        throw new Error(
          "provider down",
        );
      },
    };

    const result =
      await new AiDraftPersonalizer(
        ai,
      ).personalize(input);

    expect(result).toBeNull();
  });

  it("falls back to null on empty content", async () => {
    const ai: PersonalizerAI = {
      generate: async () => ({
        content: "   ",
      }),
    };

    const result =
      await new AiDraftPersonalizer(
        ai,
      ).personalize(input);

    expect(result).toBeNull();
  });

  it("falls back to null when the AI is too slow", async () => {
    const ai: PersonalizerAI = {
      generate: () =>
        new Promise(() => {
          // never resolves
        }),
    };

    // 50ms timeout so the test is fast.
    const result =
      await new AiDraftPersonalizer(
        ai,
        50,
      ).personalize(input);

    expect(result).toBeNull();
  });
});
