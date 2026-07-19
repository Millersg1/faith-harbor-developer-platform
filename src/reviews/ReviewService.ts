import { randomUUID } from "node:crypto";

import type { AutomationService } from "../automation/AutomationService";
import type { ClientService } from "../clients/ClientService";

import {
  DisconnectedGoogleBusinessProfile,
  type GoogleBusinessProfile,
} from "./GoogleBusinessProfile";
import { ReviewRepository } from "./ReviewRepository";
import type {
  ReviewIntegrationStatus,
  ReviewProfile,
  ReviewRecord,
  ReviewRequestInput,
} from "./ReviewTypes";

/**
 * The narrow slice of the AI service used to draft review replies.
 */
export interface ReviewResponderAI {
  generate(request: {
    capability: "writing";
    prompt: string;
  }): Promise<{ content: string }>;
}

/**
 * Result of preparing review requests.
 */
export interface ReviewRequestResult {
  prepared: number;
  skipped: number;
}

/**
 * Manages Google review requests, monitoring, and replies.
 *
 * Requests are honest and un-gated: every customer supplied is asked
 * the same way, and the emails are prepared as human-approved drafts
 * in the automation engine. Monitoring and replies require the Google
 * Business Profile integration; without it they report "not
 * connected" rather than pretending.
 */
export class ReviewService {
  constructor(
    private readonly clients: ClientService,
    private readonly automation: AutomationService,
    private readonly repository =
      new ReviewRepository(),
    private readonly google: GoogleBusinessProfile =
      new DisconnectedGoogleBusinessProfile(),
    private readonly ai?: ReviewResponderAI,
  ) {}

  /**
   * Saves the Google review link and business name for a client.
   */
  setProfile(input: {
    clientId: string;
    businessName: string;
    reviewUrl: string;
    googlePlaceId?: string;
  }): ReviewProfile {
    // Ensure the client exists.
    this.clients.get(input.clientId);

    const businessName =
      input.businessName.trim();

    const reviewUrl =
      input.reviewUrl.trim();

    if (!businessName) {
      throw new Error(
        "A review profile requires a business name.",
      );
    }

    if (!reviewUrl) {
      throw new Error(
        "A review profile requires a Google review link.",
      );
    }

    const existing =
      this.repository.getProfile(
        input.clientId,
      );

    const now =
      new Date().toISOString();

    return this.repository.upsertProfile(
      {
        clientId: input.clientId,
        businessName,
        reviewUrl,
        googlePlaceId:
          input.googlePlaceId?.trim() ||
          existing?.googlePlaceId,
        createdAt:
          existing?.createdAt ?? now,
        updatedAt: now,
      },
    );
  }

  getProfile(
    clientId: string,
  ): ReviewProfile | undefined {
    return this.repository.getProfile(
      clientId,
    );
  }

  listProfiles(): readonly ReviewProfile[] {
    return this.repository.listProfiles();
  }

  /**
   * Prepares a review-request email draft for each customer.
   *
   * Requires a saved review profile (for the link). Returns how many
   * drafts were prepared and how many were skipped (already asked, or
   * missing an email).
   */
  requestReviews(
    input: ReviewRequestInput,
  ): ReviewRequestResult {
    this.clients.get(input.clientId);

    const profile =
      this.repository.getProfile(
        input.clientId,
      );

    if (!profile) {
      throw new Error(
        "Set the Google review link for this client before requesting reviews.",
      );
    }

    let prepared = 0;
    let skipped = 0;

    for (
      const customer of input.customers
    ) {
      const draft =
        this.automation.onReviewRequested(
          {
            clientId:
              input.clientId,
            customerName:
              customer.name,
            customerEmail:
              customer.email,
            businessName:
              profile.businessName,
            reviewUrl:
              profile.reviewUrl,
          },
        );

      if (draft) {
        prepared += 1;
      } else {
        skipped += 1;
      }
    }

    return { prepared, skipped };
  }

  /**
   * Returns imported reviews for a client (empty until connected).
   */
  listReviews(
    clientId: string,
  ): readonly ReviewRecord[] {
    return this.repository.listReviews(
      clientId,
    );
  }

  /**
   * Imports the latest reviews from Google for a client.
   *
   * Returns the number imported. When Google is not connected this is
   * a no-op returning 0.
   */
  async syncReviews(
    clientId: string,
  ): Promise<number> {
    const profile =
      this.repository.getProfile(
        clientId,
      );

    if (
      !this.google.isConnected() ||
      !profile?.googlePlaceId
    ) {
      return 0;
    }

    const imported =
      await this.google.fetchReviews(
        profile.googlePlaceId,
      );

    for (const review of imported) {
      this.repository.saveReview({
        ...review,
        clientId,
      });
    }

    return imported.length;
  }

  /**
   * Drafts a reply to a review using AI. Returns the suggested text
   * for human review; it is not posted until approved.
   */
  async draftReply(
    review: ReviewRecord,
  ): Promise<string | null> {
    if (!this.ai) {
      return null;
    }

    try {
      const result =
        await this.ai.generate({
          capability: "writing",
          prompt:
            this.buildReplyPrompt(
              review,
            ),
        });

      const text =
        result.content?.trim();

      return text && text.length > 0
        ? text
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Posts an approved reply to Google. Requires the integration.
   */
  async postReply(
    clientId: string,
    reviewId: string,
    reply: string,
  ): Promise<void> {
    const profile =
      this.repository.getProfile(
        clientId,
      );

    if (!profile?.googlePlaceId) {
      throw new Error(
        "This client has no Google Business Profile location configured.",
      );
    }

    await this.google.postReply(
      profile.googlePlaceId,
      reviewId,
      reply,
    );

    const review =
      this.repository
        .listReviews(clientId)
        .find(
          (item) =>
            item.id === reviewId,
        );

    if (review) {
      this.repository.saveReview({
        ...review,
        replied: true,
        replyText: reply,
      });
    }
  }

  /**
   * Reports whether the Google Business Profile integration is ready.
   */
  integrationStatus():
    ReviewIntegrationStatus {
    const connected =
      this.google.isConnected();

    return {
      googleConnected: connected,
      message: connected
        ? "Google Business Profile is connected. Review monitoring and replies are available."
        : "Review requests are active. Connect the Google Business Profile API to also monitor reviews and post replies.",
    };
  }

  private buildReplyPrompt(
    review: ReviewRecord,
  ): string {
    return [
      "Write a short, warm, professional reply to this Google review, on behalf of the business.",
      "Rules: be genuine and specific to what they said; thank them; do not invent facts, offers, or names; keep it under 60 words. Return only the reply text.",
      "",
      `Rating: ${review.rating} out of 5`,
      `Reviewer: ${review.author}`,
      `Review: ${review.comment}`,
    ].join("\n");
  }

  /**
   * Creates a review record id (exposed for tests / imports).
   */
  static newReviewId(): string {
    return randomUUID();
  }
}
