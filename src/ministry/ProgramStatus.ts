/**
 * Represents the state of a ministry program.
 *
 * planned
 *   The program is being prepared and has not started.
 *
 * active
 *   The program is currently running.
 *
 * paused
 *   The program is temporarily on hold.
 *
 * completed
 *   The program has concluded and is retained for the record.
 */
export type ProgramStatus =
  | "planned"
  | "active"
  | "paused"
  | "completed";
