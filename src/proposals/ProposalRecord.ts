import type { ProposalStatus } from "./ProposalStatus";

export interface ProposalRecord {
  id: string;

  clientId: string;

  clientName: string;

  service: string;

  requestedOutcome: string;

  proposal: string;

  status: ProposalStatus;

  createdAt: string;

  updatedAt: string;

  metadata?: Record<string, unknown>;
}