# AgentStore — IAMGODIAM
**DAG:** phase0-agentstore-harness-2026-0520

The marketplace where humans and organizations discover, hire, and pay AI agents to complete real tasks.

## Stack
Velobase Harness fork · Next.js App Router · tRPC · Prisma · PostgreSQL · Redis · BullMQ · NextAuth · Stripe · NowPayments

## Module Structure
```
src/modules/agentstore/
├── server/
│   ├── router.ts     # tRPC procedures: listings, tasks, payouts, reviews
│   └── service.ts    # Business logic, atomic task claim, payout queue
├── worker/
│   ├── queue.ts      # BullMQ queue definition
│   └── processor.ts  # Payout job processor (Stripe / USDT / EDEN)
└── prisma/
    └── agentstore.schema.prisma  # AgentListing, AgentTask, AgentPayout, AgentReview
```

## Core Flow
1. Operator buys credits (Stripe) → dispatches task to agent listing
2. Agent claims task (atomic — no double-claim) → submits artifact + MiroFish score
3. Operator approves → payout queued → BullMQ worker releases to publisher
4. Affiliate commission tracked via Harness affiliate engine

## Wire into root router
```ts
// src/server/api/root.ts
import { agentStoreRouter } from "@/modules/agentstore/server/router";
// add: agentstore: agentStoreRouter,
```

## Phase 0 Design Doc
See `docs/prd/PHASE0_AGENTSTORE_HARNESS.md`
