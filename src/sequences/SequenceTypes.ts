/**
 * A sequence is an ordered set of emails sent automatically over time
 * to a contact — the "drip" or "workflow" that welcomes and onboards a
 * buyer. This is the SaaS Surface marketing-automation engine.
 *
 * Unlike the human-approved automation drafts (client comms that a
 * person reviews before sending), sequence emails auto-send: the owner
 * builds the sequence once and enrolls contacts, and the engine
 * delivers each step on schedule. That is the expected behavior for an
 * opt-in onboarding drip to one's own buyers.
 */
export interface SequenceStep {
  /**
   * Zero-based position in the sequence.
   */
  position: number;

  /**
   * Minutes to wait before sending this step. For step 0 the delay is
   * measured from enrollment; for later steps, from the previous step's
   * send. A delay of 0 means "send on the next scheduler tick".
   */
  delayMinutes: number;

  subject: string;

  /**
   * Email body. Supports the placeholders {{first_name}}, {{name}},
   * and {{email}}, filled from the enrolled contact.
   */
  body: string;
}

export interface SequenceRecord {
  id: string;

  name: string;

  /**
   * The brand whose voice and "from" address this sequence uses.
   */
  brandId?: string;

  steps: SequenceStep[];

  createdAt: string;
}

export type EnrollmentStatus =
  | "active"
  | "completed";

export interface EnrollmentRecord {
  id: string;

  sequenceId: string;

  email: string;

  name?: string;

  /**
   * The CRM client this contact maps to, when one was created or found.
   */
  clientId?: string;

  /**
   * Index of the NEXT step to send. When it reaches the step count the
   * enrollment is complete.
   */
  position: number;

  status: EnrollmentStatus;

  /**
   * When the next step becomes due (ISO). Null once completed.
   */
  nextSendAt?: string;

  createdAt: string;

  updatedAt: string;
}

/**
 * A request to create a sequence, matching the SaaS Surface
 * create-workflow contract: a name and an ordered list of steps.
 */
export interface CreateSequenceRequest {
  name: string;
  brandId?: string;
  steps: Array<{
    subject: string;
    body: string;
    delayMinutes?: number;
  }>;
}

/**
 * A request to enroll a contact into a sequence, matching the SaaS
 * Surface enroll-in-workflow contract.
 */
export interface EnrollRequest {
  sequenceId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}
