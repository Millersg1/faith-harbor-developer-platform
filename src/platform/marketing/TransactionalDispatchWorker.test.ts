import { describe, expect, it } from "vitest";

import {
  ConfirmationDispatchRepository,
  ConfirmationDispatchService,
  type DispatchAttempt,
} from "./ConfirmationDispatchService";
import {
  LeadMagnetDispatchRepository,
  LeadMagnetDispatchService,
  type MagnetSendAttempt,
} from "../magnet/LeadMagnetDispatchService";
import { TransactionalDispatchWorker } from "./TransactionalDispatchWorker";

function harness() {
  const now = () => 1_700_000_000_000;
  const confirmation = new ConfirmationDispatchService(new ConfirmationDispatchRepository(), now);
  const magnet = new LeadMagnetDispatchService(new LeadMagnetDispatchRepository(), now);
  const counts = { confirmation: 0, magnet: 0 };
  const worker = new TransactionalDispatchWorker({
    confirmation: {
      service: confirmation,
      eligibility: async () => ({ eligible: true }),
      send: async (): Promise<DispatchAttempt> => {
        counts.confirmation += 1;
        return { classification: "accepted", providerId: "c" };
      },
    },
    magnet: {
      service: magnet,
      send: async (): Promise<MagnetSendAttempt> => {
        counts.magnet += 1;
        return { classification: "accepted", providerId: "m" };
      },
    },
  });
  return { worker, confirmation, magnet, counts };
}

async function enqueueConfirmation(confirmation: ConfirmationDispatchService) {
  await confirmation.enqueue({
    organizationId: "orgA",
    activationId: "act-1",
    email: "c@x.com",
    confirmBase: "https://a.example",
  });
}
async function enqueueMagnet(magnet: LeadMagnetDispatchService) {
  await magnet.enqueue({
    organizationId: "orgA",
    fulfillmentId: "ful1",
    formId: "form1",
    fileId: "file1",
    email: "lead@x.com",
    downloadBase: "https://a.example",
  });
}

describe("TransactionalDispatchWorker — independent of marketing mode", () => {
  it("processes BOTH confirmation and magnet dispatch (no mode gating whatsoever)", async () => {
    // This worker has no `mode` dependency at all — it always runs. There is no
    // "outbox marketing enabled" condition anywhere in it.
    const { worker, confirmation, magnet, counts } = harness();
    await enqueueConfirmation(confirmation);
    await enqueueMagnet(magnet);
    const health = await worker.runOnce("w");
    expect(counts.confirmation).toBe(1);
    expect(counts.magnet).toBe(1);
    expect(health.confirmation.sent).toBe(1);
    expect(health.magnet.sent).toBe(1);
  });

  it("graceful shutdown claims no new work", async () => {
    const { worker, confirmation, magnet, counts } = harness();
    await enqueueConfirmation(confirmation);
    await enqueueMagnet(magnet);
    worker.beginShutdown();
    await worker.runOnce("w");
    expect(counts.confirmation).toBe(0);
    expect(counts.magnet).toBe(0);
  });

  it("health counters carry no PII / addresses / tokens", async () => {
    const { worker, confirmation, magnet } = harness();
    await enqueueConfirmation(confirmation);
    await enqueueMagnet(magnet);
    const health = await worker.runOnce("w");
    const blob = JSON.stringify(health);
    expect(blob).not.toMatch(/@/);
    expect(blob).not.toMatch(/lead|token|smtp|password/i);
  });
});
