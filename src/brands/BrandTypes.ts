/**
 * A brand is one of the businesses run under Faith Harbor LLC — for
 * example Faith Harbor Web Hosting, All Elite Hosting, or SaaS
 * Surface. Clients are tagged with a brand so the one OS can run
 * several brands while all revenue flows to the same accounts.
 */
export interface BrandRecord {
  id: string;

  /**
   * Display name shown in the UI and on customer-facing email.
   */
  name: string;

  /**
   * Primary domain, e.g. "faithharborwebhosting.com". Optional.
   */
  domain?: string;

  /**
   * The "from" address for automated email sent on this brand's
   * behalf. Falls back to the system default when empty.
   */
  fromEmail?: string;

  /**
   * The signature/closing used on this brand's automated email. Lets
   * a faith-based brand and a secular brand each speak in their own
   * voice. Falls back to a neutral professional signature when empty.
   */
  emailSignature?: string;

  createdAt: string;
  updatedAt: string;
}

export interface BrandRequest {
  name: string;
  domain?: string;
  fromEmail?: string;
  emailSignature?: string;
}
