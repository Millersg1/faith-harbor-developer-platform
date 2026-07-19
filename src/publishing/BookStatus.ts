/**
 * Represents the production lifecycle of a book.
 *
 * draft
 *   Manuscript is being written.
 *
 * editing
 *   Manuscript is in editing and revision.
 *
 * design
 *   Cover design and interior formatting.
 *
 * proof
 *   Final review and proofing before release.
 *
 * published
 *   The book has been released.
 *
 * archived
 *   Retained for the record; no longer in active production.
 */
export type BookStatus =
  | "draft"
  | "editing"
  | "design"
  | "proof"
  | "published"
  | "archived";
