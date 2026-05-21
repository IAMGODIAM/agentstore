// src/app/store/page.tsx — AgentStore marketplace page
// DAG: phase0-agentstore-harness-2026-0520
"use client";
import { useState } from "react";
import { api } from "@/trpc/react";

const CATEGORIES = ["All", "Research", "Content", "Code", "Analysis", "Outreach", "Data", "Strategy"];

export default function AgentStorePage() {
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");

  const { data, isLoading } = api["agentstore.listings.list"].useQuery({
    category: category === "All" ? undefined : category,
    search: search || undefined,
    limit: 20,
  });

  return (
    <div className="min-h-screen bg-[#070710] text-[#e8d5a3]">
      {/* Header */}
      <div className="border-b border-[#c9a84c33] px-6 py-8">
        <h1 className="text-3xl font-mono font-bold text-[#c9a84c]">AgentStore</h1>
        <p className="mt-2 text-sm text-[#e8d5a399]">Discover, hire, and pay AI agents for real tasks.</p>

        {/* Search */}
        <input
          className="mt-4 w-full max-w-lg rounded border border-[#c9a84c33] bg-[#c9a84c08] px-4 py-2 text-sm text-[#e8d5a3] placeholder-[#e8d5a355] focus:border-[#c9a84c] focus:outline-none"
          placeholder="Search agents by capability..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Categories */}
        <div className="mt-4 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat === "All" ? undefined : cat)}
              className={`rounded border px-3 py-1 text-xs font-mono transition-colors ${
                (cat === "All" && !category) || category === cat
                  ? "border-[#c9a84c] bg-[#c9a84c] text-[#070710]"
                  : "border-[#c9a84c33] text-[#e8d5a399] hover:border-[#c9a84c] hover:text-[#e8d5a3]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Listings grid */}
      <div className="px-6 py-8">
        {isLoading ? (
          <div className="text-center text-sm text-[#e8d5a355]">Loading agents...</div>
        ) : !data?.items.length ? (
          <div className="text-center text-sm text-[#e8d5a355]">No agents found. Be the first to list.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((listing) => (
              <a
                key={listing.id}
                href={`/store/${listing.slug}`}
                className="block rounded border border-[#c9a84c22] bg-[#c9a84c08] p-5 transition-all hover:border-[#c9a84c55] hover:bg-[#c9a84c12]"
              >
                {listing.featuredUntil && new Date(listing.featuredUntil) > new Date() && (
                  <div className="mb-2 inline-block rounded bg-[#c9a84c] px-2 py-0.5 text-[10px] font-bold text-[#070710]">
                    FEATURED
                  </div>
                )}
                <div className="font-mono text-base font-semibold text-[#c9a84c]">{listing.name}</div>
                <div className="mt-1 text-xs text-[#e8d5a399]">{listing.tagline}</div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {listing.capabilityTags.slice(0, 3).map((tag) => (
                    <span key={tag} className="rounded border border-[#c9a84c22] px-2 py-0.5 text-[10px] text-[#e8d5a366]">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-mono text-sm text-[#4cc98a]">
                    {listing.priceCreditsPerTask} credits / task
                  </span>
                  {listing.miroFishVerified && (
                    <span className="text-[10px] text-[#c9a84c]">✦ MiroFish Verified</span>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
