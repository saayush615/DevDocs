"use client";

// QuotaMeter: shows the authenticated user's remaining limits in the sidebar.
// Fetches GET /api/quota on mount and on every navigation (uses usePathname).
// If the fetch fails it renders nothing, so the sidebar stays clean — the
// meter never breaks the page.

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { getQuota } from "@/lib/api";
import type { Quota, QuotaUsage } from "@/lib/types";

// Color the meter by how much is LEFT, not by how much was used:
//   >30% left = emerald (healthy) · >10% left = amber · ≤10% left = red
function usageColor(q: QuotaUsage): "emerald" | "amber" | "red" {
  const left = q.limit - q.used;
  if (left <= Math.ceil(q.limit * 0.1)) return "red";
  if (left <= Math.ceil(q.limit * 0.3)) return "amber";
  return "emerald";
}

const FILL = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
} as const;

const TEXT = {
  emerald: "text-emerald-400",
  amber: "text-amber-400",
  red: "text-red-400",
} as const;

// A compact "used/limit" readout used for the secondary counters.
function Stat({ label, value }: { label: string; value: QuotaUsage }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-zinc-600">
        {label}
      </span>
      <span className="text-sm text-zinc-300">
        {value.used}
        <span className="text-zinc-600">/{value.limit}</span>
      </span>
    </div>
  );
}

export default function QuotaMeter() {
  const pathname = usePathname();
  const [quota, setQuota] = useState<Quota | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getQuota();
      setQuota(data);
      setFailed(false);
    } catch {
      // Endpoint unavailable (quota feature not deployed yet) → hide quietly.
      setFailed(true);
    }
  }, []);

  // Refetch on mount AND on every route change, so the bar is fresh after
  // a chat reply, an upload, or a new chat. `quota` persists across these,
  // so the shimmer only shows on first load (no flicker on navigation).
  useEffect(() => {
    load();
  }, [load, pathname]);

  if (failed) return null; // no backend → render nothing

  if (!quota) {
    // Loading shimmer — three bars so the sidebar doesn't jump around.
    return (
      <div className="mb-2 space-y-2 rounded-xl border border-white/5 bg-zinc-900/50 p-3">
        <div className="h-3 w-20 animate-pulse rounded bg-white/5" />
        <div className="h-2 animate-pulse rounded bg-white/5" />
        <div className="h-2 w-2/3 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  const color = usageColor(quota.queries);
  const pct = Math.min(100, Math.round((quota.queries.used / quota.queries.limit) * 100));
  const left = Math.max(0, quota.queries.limit - quota.queries.used);

  return (
    <div className="mb-2 space-y-3 rounded-xl border border-white/10 bg-zinc-900/50 p-3">
      {/* Header row: label + manual refresh */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Today's usage
        </span>
        <button
          onClick={load}
          className="rounded p-0.5 text-zinc-600 transition-colors hover:text-zinc-300"
          title="Refresh"
        >
          {/* Refresh icon (inline SVG — no icon library) */}
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* Main meter: daily queries — the counter users hit most often */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-zinc-400">Queries</span>
          <span className={`text-xs font-medium ${TEXT[color]}`}>
            {left} left
          </span>
        </div>
        {/* Progress bar — fill width = used %, color = remaining health */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-500 ${FILL[color]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-right text-[10px] text-zinc-600">
          {quota.queries.used}/{quota.queries.limit} used today
        </p>
      </div>

      {/* Secondary mini-stats (daily uploads + lifetime documents) */}
      <div className="flex items-center justify-between border-t border-white/5 pt-2">
        <Stat label="Uploads" value={quota.uploads} />
        <Stat label="Documents" value={quota.documents} />
      </div>
    </div>
  );
}