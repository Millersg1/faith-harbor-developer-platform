import type { EmailStatus } from "../../communications/EmailTypes";

/**
 * A record of an email the tenant sent (or attempted), stored in the tenant's
 * outbox. `status` is "sent" (handed to a provider), "logged" (no provider
 * configured — recorded but not delivered), or "failed".
 */
export interface PlatformEmailRecord {
  id: string;
  organizationId: string;
  to: string;
  subject: string;
  body: string;
  from: string;
  status: EmailStatus;
  provider: string;
  error?: string;
  createdAt: string;
}
