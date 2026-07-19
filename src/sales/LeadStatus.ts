/**
 * Represents the stage of a sales lead in the pipeline.
 *
 * new
 *   A fresh lead that has not been worked yet.
 *
 * contacted
 *   Initial outreach has been made.
 *
 * qualified
 *   The lead is a genuine opportunity worth pursuing.
 *
 * proposal
 *   A proposal or quote has been sent.
 *
 * won
 *   The opportunity was won and can become a client.
 *
 * lost
 *   The opportunity did not close.
 */
export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";
