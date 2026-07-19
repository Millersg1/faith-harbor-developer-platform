import type { AIWorker } from "../AIWorker";
import { ProposalWriter } from "./ProposalWriter";

/**
 * All AI workers built into Faith Harbor OS.
 *
 * Additional workers should be added here as they are
 * developed.
 */
export const builtinWorkers: readonly AIWorker[] = [
  ProposalWriter,
];