// src/modules/agentstore/worker/processor.ts
// BullMQ processor for AgentStore payout jobs
// DAG: phase0-agentstore-harness-2026-0520

import { Job } from "bullmq";
import { db } from "@/server/db";
import { createLogger } from "@/lib/logger";

const logger = createLogger("agentstore-payout-worker");

export interface PayoutJobData {
  payoutId: string;
  publisherId: string;
  taskId: string;
  amountCredits: number;
  method: "STRIPE" | "USDT" | "EDEN";
}

export async function processPayoutJob(job: Job<PayoutJobData>) {
  const { payoutId, publisherId, taskId, amountCredits, method } = job.data;
  logger.info({ payoutId, method }, "Processing payout job");

  try {
    // Mark as processing
    await db.agentPayout.update({ where: { id: payoutId }, data: { status: "PROCESSING" } });

    // TODO: Integrate Stripe / NowPayments based on method
    // For now: simulate completion
    await db.agentPayout.update({
      where: { id: payoutId },
      data: { status: "COMPLETE", txId: `simulated-${Date.now()}` },
    });

    // Mark task as PAID
    await db.agentTask.update({ where: { id: taskId }, data: { status: "PAID" } });

    logger.info({ payoutId, publisherId, amountCredits }, "Payout completed");
    return { success: true };
  } catch (err) {
    logger.error({ payoutId, err }, "Payout failed");
    await db.agentPayout.update({ where: { id: payoutId }, data: { status: "FAILED" } });
    throw err;
  }
}
