import {
  describe,
  expect,
  it,
} from "vitest";

import { AutomationService } from "../automation/AutomationService";
import { AutomationRepository } from "../automation/AutomationRepository";
import { ClientService } from "../clients/ClientService";
import { EmailRepository } from "../communications/EmailRepository";
import { EmailService } from "../communications/EmailService";
import { LoggingEmailTransport } from "../communications/EmailTransport";

import { ReviewRepository } from "./ReviewRepository";
import { ReviewService } from "./ReviewService";

function setup(
  ai?: {
    generate: (r: {
      capability: "writing";
      prompt: string;
    }) => Promise<{
      content: string;
    }>;
  },
) {
  const clients =
    new ClientService();

  const automation =
    new AutomationService(
      new EmailService(
        new LoggingEmailTransport(),
        "Faith Harbor OS",
        new EmailRepository(),
      ),
      new AutomationRepository(),
    );

  const reviews =
    new ReviewService(
      clients,
      automation,
      new ReviewRepository(),
      undefined,
      ai,
    );

  const client = clients.create({
    companyName: "Grace Chapel",
    primaryContact: "Pastor John",
  });

  return {
    clients,
    automation,
    reviews,
    client,
  };
}

describe("ReviewService", () => {
  it("saves a review profile", () => {
    const { reviews, client } =
      setup();

    const profile =
      reviews.setProfile({
        clientId: client.id,
        businessName:
          "Grace Chapel",
        reviewUrl:
          "https://g.page/r/grace/review",
      });

    expect(profile.reviewUrl)
      .toBe(
        "https://g.page/r/grace/review",
      );
    expect(
      reviews.getProfile(client.id)
        ?.businessName,
    ).toBe("Grace Chapel");
  });

  it("requires a profile before requesting reviews", () => {
    const { reviews, client } =
      setup();

    expect(() =>
      reviews.requestReviews({
        clientId: client.id,
        customers: [
          {
            name: "Sam",
            email: "sam@example.com",
          },
        ],
      }),
    ).toThrow(
      "Set the Google review link",
    );
  });

  it("prepares one review-request draft per customer", () => {
    const {
      reviews,
      automation,
      client,
    } = setup();

    reviews.setProfile({
      clientId: client.id,
      businessName: "Grace Chapel",
      reviewUrl:
        "https://g.page/r/grace/review",
    });

    const result =
      reviews.requestReviews({
        clientId: client.id,
        customers: [
          {
            name: "Sam",
            email: "sam@example.com",
          },
          {
            name: "Dana",
            email: "dana@example.com",
          },
        ],
      });

    expect(result.prepared).toBe(2);
    expect(result.skipped).toBe(0);

    const drafts =
      automation.listPending();

    expect(drafts).toHaveLength(2);
    expect(drafts[0].trigger)
      .toBe("review.requested");
    // The Google link is in the email body.
    expect(drafts[0].body)
      .toContain(
        "https://g.page/r/grace/review",
      );
  });

  it("does not ask the same customer twice", () => {
    const { reviews, client } =
      setup();

    reviews.setProfile({
      clientId: client.id,
      businessName: "Grace Chapel",
      reviewUrl:
        "https://g.page/r/grace/review",
    });

    reviews.requestReviews({
      clientId: client.id,
      customers: [
        {
          name: "Sam",
          email: "sam@example.com",
        },
      ],
    });

    const second =
      reviews.requestReviews({
        clientId: client.id,
        customers: [
          {
            name: "Sam",
            email: "sam@example.com",
          },
        ],
      });

    expect(second.prepared).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it("reports Google as not connected by default", () => {
    const { reviews } = setup();

    const status =
      reviews.integrationStatus();

    expect(status.googleConnected)
      .toBe(false);
    expect(status.message)
      .toContain(
        "Review requests are active",
      );
  });

  it("returns no monitored reviews until connected", async () => {
    const { reviews, client } =
      setup();

    expect(
      reviews.listReviews(client.id),
    ).toHaveLength(0);

    // Sync is a no-op while disconnected.
    expect(
      await reviews.syncReviews(
        client.id,
      ),
    ).toBe(0);
  });

  it("drafts an AI reply when AI is available", async () => {
    const { reviews } = setup({
      generate: async () => ({
        content:
          "Thank you so much, Sam!",
      }),
    });

    const reply =
      await reviews.draftReply({
        id: "r1",
        clientId: "c1",
        author: "Sam",
        rating: 5,
        comment: "Great service!",
        createdAt:
          "2026-01-01T00:00:00.000Z",
        replied: false,
      });

    expect(reply)
      .toBe(
        "Thank you so much, Sam!",
      );
  });

  it("returns null AI reply when no AI configured", async () => {
    const { reviews } = setup();

    const reply =
      await reviews.draftReply({
        id: "r1",
        clientId: "c1",
        author: "Sam",
        rating: 5,
        comment: "Great!",
        createdAt:
          "2026-01-01T00:00:00.000Z",
        replied: false,
      });

    expect(reply).toBeNull();
  });
});
