/**
 * Per-client Google review configuration.
 *
 * Each agency client is a business with its own Google Business
 * Profile. The review URL is the public "leave a review" link used in
 * review-request emails. The Google Business Profile fields are used
 * by the (optional) monitoring and response integration.
 */
export interface ReviewProfile {
  /**
   * The agency client this profile belongs to.
   */
  clientId: string;

  /**
   * The business name shown to customers in review requests.
   */
  businessName: string;

  /**
   * The public Google "write a review" link.
   */
  reviewUrl: string;

  /**
   * The Google Place ID / Business Profile location id, when known.
   * Used by the monitoring and response integration.
   */
  googlePlaceId?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * A request to prepare review-request emails for one client.
 */
export interface ReviewRequestInput {
  clientId: string;
  customers: ReviewCustomer[];
}

/**
 * A single customer to ask for a review.
 */
export interface ReviewCustomer {
  name: string;
  email: string;
}

/**
 * A Google review imported for monitoring.
 *
 * Populated only when the Google Business Profile integration is
 * connected; otherwise the monitoring list is empty.
 */
export interface ReviewRecord {
  id: string;
  clientId: string;
  author: string;
  rating: number;
  comment: string;
  createdAt: string;

  /**
   * Whether a reply has been posted back to Google.
   */
  replied: boolean;
  replyText?: string;
}

/**
 * Whether the Google Business Profile integration is available.
 */
export interface ReviewIntegrationStatus {
  /**
   * True once Google Business Profile API credentials are configured.
   * Review requests work without this; monitoring and responses need
   * it.
   */
  googleConnected: boolean;

  message: string;
}
