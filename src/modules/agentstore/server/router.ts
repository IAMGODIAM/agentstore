import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure, adminProcedure } from "@/server/api/trpc";
import {
  listListings,
  getListing,
  createListing,
  submitForReview,
  approveListing,
  suspendListing,
  dispatchTask,
  claimTask,
  submitTask,
  approveTask,
  requestPayout,
  createReview,
  getTasksForListing,
  getMyTasks,
} from "./service";

export const agentStoreRouter = createTRPCRouter({
  // ── Listings ──────────────────────────────────────────────
  "listings.list": publicProcedure
    .input(z.object({
      category: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
      cursor: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return listListings(input ?? {});
    }),

  "listings.get": publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      return getListing(input.slug);
    }),

  "listings.create": protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
      tagline: z.string().min(1).max(200),
      description: z.string().min(1).max(5000),
      category: z.string().min(1),
      capabilityTags: z.array(z.string()).min(1).max(10),
      priceCreditsPerTask: z.number().int().min(1).max(10000),
      mcpEndpoint: z.string().url().optional(),
      installCommand: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return createListing({ publisherId: ctx.session.user.id, ...input });
    }),

  "listings.submitForReview": protectedProcedure
    .input(z.object({ listingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return submitForReview({ listingId: input.listingId, publisherId: ctx.session.user.id });
    }),

  "listings.approve": adminProcedure
    .input(z.object({ listingId: z.string() }))
    .mutation(async ({ input }) => {
      return approveListing(input.listingId);
    }),

  "listings.suspend": adminProcedure
    .input(z.object({ listingId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      return suspendListing(input.listingId);
    }),

  // ── Tasks ─────────────────────────────────────────────────
  "tasks.dispatch": protectedProcedure
    .input(z.object({
      listingId: z.string(),
      title: z.string().min(1).max(200),
      description: z.string().min(1).max(5000),
      qualityGatePct: z.number().int().min(1).max(100).default(85),
    }))
    .mutation(async ({ ctx, input }) => {
      return dispatchTask({ operatorId: ctx.session.user.id, ...input });
    }),

  "tasks.claim": protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return claimTask({ taskId: input.taskId, agentId: ctx.session.user.id });
    }),

  "tasks.submit": protectedProcedure
    .input(z.object({
      taskId: z.string(),
      artifactUrl: z.string().url(),
      artifactNotes: z.string().optional(),
      miroFishScore: z.number().min(0).max(100).optional(),
      dagStamp: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return submitTask({ agentId: ctx.session.user.id, ...input });
    }),

  "tasks.approve": protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return approveTask({ taskId: input.taskId, operatorId: ctx.session.user.id });
    }),

  "tasks.myTasks": protectedProcedure
    .input(z.object({
      role: z.enum(["operator", "agent"]),
      status: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return getMyTasks({ userId: ctx.session.user.id, ...input });
    }),

  "tasks.forListing": protectedProcedure
    .input(z.object({ listingId: z.string(), limit: z.number().default(20), cursor: z.string().optional() }))
    .query(async ({ input }) => {
      return getTasksForListing(input);
    }),

  // ── Payouts ───────────────────────────────────────────────
  "payouts.request": protectedProcedure
    .input(z.object({
      taskId: z.string(),
      method: z.enum(["STRIPE", "USDT", "EDEN"]).default("STRIPE"),
    }))
    .mutation(async ({ ctx, input }) => {
      return requestPayout({ publisherId: ctx.session.user.id, ...input });
    }),

  // ── Reviews ───────────────────────────────────────────────
  "reviews.create": protectedProcedure
    .input(z.object({
      taskId: z.string(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return createReview({ reviewerId: ctx.session.user.id, ...input });
    }),

  // ── Health ────────────────────────────────────────────────
  health: publicProcedure.query(() => ({
    status: "ok",
    module: "agentstore",
    dag: "phase0-agentstore-harness-2026-0520",
  })),
});
