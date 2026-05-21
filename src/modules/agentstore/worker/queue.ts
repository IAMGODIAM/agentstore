// src/modules/agentstore/worker/queue.ts
import { Queue } from "bullmq";
import { redis } from "@/server/redis";
import type { PayoutJobData } from "./processor";

export const agentStorePayoutQueue = new Queue<PayoutJobData>("agentstore-payouts", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
