/**
 * Represents the lifecycle of a software product or repository.
 *
 * planning
 *   Being scoped and designed; not yet in active development.
 *
 * active
 *   Under active development.
 *
 * maintenance
 *   Released and being maintained.
 *
 * archived
 *   Retired; retained for the record.
 */
export type ProductStatus =
  | "planning"
  | "active"
  | "maintenance"
  | "archived";
