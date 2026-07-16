import type { ProposalRecord } from "./ProposalRecord";

export class ProposalRepository {
  private readonly proposals =
    new Map<string, ProposalRecord>();

  create(
    proposal: ProposalRecord,
  ): ProposalRecord {
    this.proposals.set(
      proposal.id,
      proposal,
    );

    return proposal;
  }

  get(
    id: string,
  ): ProposalRecord {
    const proposal =
      this.proposals.get(id);

    if (!proposal) {
      throw new Error(
        `Proposal "${id}" was not found.`,
      );
    }

    return proposal;
  }

  list(): ProposalRecord[] {
    return Array.from(
      this.proposals.values(),
    );
  }

  update(
    proposal: ProposalRecord,
  ): ProposalRecord {
    this.proposals.set(
      proposal.id,
      proposal,
    );

    return proposal;
  }
}