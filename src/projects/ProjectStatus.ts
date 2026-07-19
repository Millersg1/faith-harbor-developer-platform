/**
 * Represents the lifecycle of a project.
 *
 * planned
 *   Project has been created but work has not started.
 *
 * active
 *   Work is currently underway.
 *
 * completed
 *   Project has been successfully finished.
 *
 * archived
 *   Project is retained for historical purposes.
 */
export type ProjectStatus =
  | "planned"
  | "active"
  | "completed"
  | "archived";