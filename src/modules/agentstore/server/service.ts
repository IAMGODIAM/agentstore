import { db } from "@/server/db";
import { createLogger } from "@/lib/logger";
import { TRPCError } from "@trpc/server";

const logger = createLogger("agentstore-service");

// ── Listings ──────────────────────────────────────────────────────────────────

export async function listListings(input: {
  category?: string;
  search?: string;
  limit?: number;
  cursor?: string;
}) {
  const { category, search, limit = 20, cursor } = input;
  const items = await db.agentListing.findMany({
    where: {
      status: "ACTIVE",
      ...(category ? { category } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { tagline: { contains: search, mode: "insensitive" } },
          { capabilityTags: { has: search } },
        ],
      } : {}),
    },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ featuredUntil: "desc" }, { miroFishAvgScore: "desc" }, { createdAt: "desc" }],
  });

  const hasMore = items.length > limit;
  return {
    items: hasMore ? items.slice(0, -1) : items,
    nextCursor: hasMore ? items[items.length - 2]!.id : null,
  };
}

export async function getListing(slug: string) {
  const listing = await db.agentListing.findUnique({
    where: { slug },
    include: { reviews: { take: 10, orderBy: { createdAt: "desc" } } },
  });
  if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Agent listing not found" });
  return listing;
}

export async function createListing(input: {
  publisherId: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  category: string;
  capabilityTags: string[];
  priceCreditsPerTask: number;
  mcpEndpoint?: string;
  installCommand?: string;
}) {
  logger.info({ publisherId: input.publisherId, slug: input.slug }, "Creating agent listing");
  const existing = await db.agentListing.findUnique({ where: { slug: input.slug } });
  if (existing) throw new TRPCError({ code: "CONFLICT", message: "Slug already taken" });
  return db.agentListing.create({ data: { ...input, status: "DRAFT" } });
}

export async function submitForReview(input: { listingId: string; publisherId: string }) {
  const listing = await db.agentListing.findUnique({ where: { id: input.listingId } });
  if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
  if (listing.publisherId !== input.publisherId) throw new TRPCError({ code: "FORBIDDEN" });
  if (listing.status !== "DRAFT") throw new TRPCError({ code: "BAD_REQUEST", message: "Only DRAFT listings can be submitted for review" });
  return db.agentListing.update({ where: { id: input.listingId }, data: { status: "PENDING_REVIEW" } });
}

export async function approveListing(listingId: string) {
  return db.agentListing.update({ where: { id: listingId }, data: { status: "ACTIVE" } });
}

export async function suspendListing(listingId: string) {
  return db.agentListing.update({ where: { id: listingId }, data: { status: "SUSPENDED" } });
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function dispatchTask(input: {
  operatorId: string;
  listingId: string;
  title: string;
  description: string;
  qualityGatePct: number;
}) {
  const listing = await db.agentListing.findUnique({ where: { id: input.listingId } });
  if (!listing || listing.status !== "ACTIVE") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Active listing not found" });
  }

  // TODO: deduct credits from operator via billing service
  const creditsEscrowed = listing.priceCreditsPerTask;
  logger.info({ operatorId: input.operatorId, listingId: input.listingId, creditsEscrowed }, "Dispatching task");

  return db.agentTask.create({
    data: {
      listingId: input.listingId,
      operatorId: input.operatorId,
      title: input.title,
      description: input.description,
      qualityGatePct: input.qualityGatePct,
      creditsEscrowed,
      status: "OPEN",
    },
  });
}

export async function claimTask(input: { taskId: string; agentId: string }) {
  // Atomic claim — prevents double-claim via transaction
  return db.$transaction(async (tx) => {
    const task = await tx.agentTask.findUnique({ where: { id: input.taskId } });
    if (!task) throw new TRPCError({ code: "NOT_FOUND" });
    if (task.status !== "OPEN") throw new TRPCError({ code: "CONFLICT", message: "Task already claimed" });
    return tx.agentTask.update({
      where: { id: input.taskId },
      data: { status: "CLAIMED", assignedAgentId: input.agentId, claimedAt: new Date() },
    });
  });
}

export async function submitTask(input: {
  taskId: string;
  agentId: string;
  artifactUrl: string;
  artifactNotes?: string;
  miroFishScore?: number;
  dagStamp?: string;
}) {
  const task = await db.agentTask.findUnique({ where: { id: input.taskId } });
  if (!task) throw new TRPCError({ code: "NOT_FOUND" });
  if (task.assignedAgentId !== input.agentId) throw new TRPCError({ code: "FORBIDDEN" });
  if (!["CLAIMED", "IN_PROGRESS"].includes(task.status)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Task cannot be submitted in current state" });
  }
  return db.agentTask.update({
    where: { id: input.taskId },
    data: {
      status: "SUBMITTED",
      artifactUrl: input.artifactUrl,
      artifactNotes: input.artifactNotes,
      miroFishScore: input.miroFishScore,
      dagStamp: input.dagStamp,
      submittedAt: new Date(),
    },
  });
}

export async function approveTask(input: { taskId: string; operatorId: string }) {
  const task = await db.agentTask.findUnique({ where: { id: input.taskId } });
  if (!task) throw new TRPCError({ code: "NOT_FOUND" });
  if (task.operatorId !== input.operatorId) throw new TRPCError({ code: "FORBIDDEN" });
  if (task.status !== "SUBMITTED") throw new TRPCError({ code: "BAD_REQUEST", message: "Task must be SUBMITTED to approve" });

  // Approve + queue payout
  const updated = await db.agentTask.update({
    where: { id: input.taskId },
    data: { status: "APPROVED", approvedAt: new Date() },
  });

  // Auto-create payout record
  const listing = await db.agentListing.findUnique({ where: { id: task.listingId } });
  if (listing && task.assignedAgentId) {
    await db.agentPayout.create({
      data: {
        publisherId: listing.publisherId,
        taskId: task.id,
        amountCredits: task.creditsEscrowed,
        method: "STRIPE",
        status: "PENDING",
      },
    });
  }

  logger.info({ taskId: input.taskId }, "Task approved — payout queued");
  return updated;
}

export async function requestPayout(input: { publisherId: string; taskId: string; method: "STRIPE" | "USDT" | "EDEN" }) {
  const payout = await db.agentPayout.findFirst({
    where: { taskId: input.taskId, publisherId: input.publisherId },
  });
  if (!payout) throw new TRPCError({ code: "NOT_FOUND", message: "No payout record found" });
  if (payout.status !== "PENDING") throw new TRPCError({ code: "CONFLICT", message: "Payout already processed" });
  return db.agentPayout.update({
    where: { id: payout.id },
    data: { method: input.method, status: "PROCESSING" },
  });
}

export async function createReview(input: {
  taskId: string;
  reviewerId: string;
  rating: number;
  comment?: string;
}) {
  const task = await db.agentTask.findUnique({ where: { id: input.taskId } });
  if (!task) throw new TRPCError({ code: "NOT_FOUND" });
  if (task.operatorId !== input.reviewerId) throw new TRPCError({ code: "FORBIDDEN", message: "Only the operator can review" });
  if (task.status !== "APPROVED") throw new TRPCError({ code: "BAD_REQUEST", message: "Task must be approved before review" });

  const review = await db.agentReview.create({
    data: {
      taskId: input.taskId,
      listingId: task.listingId,
      reviewerId: input.reviewerId,
      rating: input.rating,
      comment: input.comment,
    },
  });

  // Update listing avg score
  const reviews = await db.agentReview.findMany({ where: { listingId: task.listingId } });
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  await db.agentListing.update({ where: { id: task.listingId }, data: { miroFishAvgScore: avg } });

  return review;
}

export async function getMyTasks(input: {
  userId: string;
  role: "operator" | "agent";
  status?: string;
  limit?: number;
  cursor?: string;
}) {
  const { userId, role, status, limit = 20, cursor } = input;
  const where = {
    ...(role === "operator" ? { operatorId: userId } : { assignedAgentId: userId }),
    ...(status ? { status: status as any } : {}),
  };
  const items = await db.agentTask.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    include: { listing: { select: { name: true, slug: true, category: true } } },
  });
  const hasMore = items.length > limit;
  return { items: hasMore ? items.slice(0, -1) : items, nextCursor: hasMore ? items[items.length - 2]!.id : null };
}

export async function getTasksForListing(input: { listingId: string; limit?: number; cursor?: string }) {
  const { listingId, limit = 20, cursor } = input;
  const items = await db.agentTask.findMany({
    where: { listingId },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
  });
  const hasMore = items.length > limit;
  return { items: hasMore ? items.slice(0, -1) : items, nextCursor: hasMore ? items[items.length - 2]!.id : null };
}
