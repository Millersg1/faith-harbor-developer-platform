export const proposalStatuses = [
  "draft",
  "review",
  "approved",
  "sent",
  "accepted",
  "declined",
  "archived",
] as const;

export type ProposalStatus =
  (typeof proposalStatuses)[number];