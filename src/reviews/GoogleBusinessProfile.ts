import type { ReviewRecord } from "./ReviewTypes";

/**
 * Reads reviews and posts replies through the Google Business Profile
 * API.
 *
 * Review *requests* (email asking a customer to review) never need
 * this — they only use the public review link. Monitoring reviews and
 * posting replies do need it, which requires a Google Cloud project,
 * Business Profile API access (Google approval), and each client
 * granting OAuth access to their profile.
 */
export interface GoogleBusinessProfile {
  /**
   * Whether API credentials are configured and usable.
   */
  isConnected(): boolean;

  /**
   * Imports reviews for one Business Profile location.
   */
  fetchReviews(
    placeId: string,
  ): Promise<
    Omit<ReviewRecord, "clientId">[]
  >;

  /**
   * Posts a reply to a review.
   */
  postReply(
    placeId: string,
    reviewId: string,
    reply: string,
  ): Promise<void>;
}

/**
 * The default when no Google credentials are configured.
 *
 * Reporting "not connected" honestly is better than pretending to
 * work: review requests still function fully; monitoring returns
 * nothing and replies are refused with a clear message until the
 * Business Profile API is set up.
 */
export class DisconnectedGoogleBusinessProfile
  implements GoogleBusinessProfile
{
  isConnected(): boolean {
    return false;
  }

  async fetchReviews(): Promise<
    Omit<ReviewRecord, "clientId">[]
  > {
    return [];
  }

  async postReply(): Promise<void> {
    throw new Error(
      "Google Business Profile is not connected. " +
        "Connect the Google Business Profile API to post review replies.",
    );
  }
}
