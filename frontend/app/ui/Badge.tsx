// ─── Badge ────────────────────────────────────────────────────────────
// Small status badge used for document status and chat route indicators.
//
// Document statuses:
//   "pending"   — amber, pulsing (waiting to be processed)
//   "chunking"  — amber, pulsing (being processed)
//   "embedded"  — emerald, solid (ready to use)
//   "failed"    — red, solid (something went wrong)
//
// Chat route indicators:
//   "simple"    — default zinc badge
//   "multi_hop" — violet badge (for future use)

interface BadgeProps {
  children: React.ReactNode;
  variant?: "emerald" | "amber" | "red" | "zinc" | "violet";
  /** When true, the badge pulses to draw attention (for processing states) */
  pulse?: boolean;
  className?: string;
}

export default function Badge({
  children,
  variant = "zinc",
  pulse = false,
  className = "",
}: BadgeProps) {
  // Base classes for all badges
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

  // Color variants
  const variants = {
    emerald: "bg-emerald-500/10 text-emerald-400",   // Embedded / success
    amber: "bg-amber-500/10 text-amber-400",         // Pending / processing
    red: "bg-red-500/10 text-red-400",               // Failed / error
    zinc: "bg-white/10 text-zinc-400",               // Default / neutral
    violet: "bg-violet-500/10 text-violet-400",      // Multi-hop route
  };

  // Optional pulse animation for processing states
  const pulseClass = pulse ? "animate-pulse" : "";

  return (
    <span className={`${base} ${variants[variant]} ${pulseClass} ${className}`}>
      {children}
    </span>
  );
}

// ─── Helper: map DocumentStatus to Badge props ────────────────────────
// Usage: <Badge {...statusBadgeVariant(doc.status)}>{doc.status}</Badge>
// This keeps the mapping logic in one place instead of scattered across components.
import type { DocumentStatus } from "@/lib/types";

export function statusBadgeVariant(
  status: DocumentStatus
): { variant: BadgeProps["variant"]; pulse: boolean } {
  switch (status) {
    case "embedded":
      return { variant: "emerald", pulse: false };
    case "failed":
      return { variant: "red", pulse: false };
    case "pending":
    case "chunking":
      return { variant: "amber", pulse: true }; // Pulsing = "still working"
  }
}