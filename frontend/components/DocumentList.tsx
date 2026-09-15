"use client";

import { useEffect, useState, useCallback } from "react";
import { listDocuments } from "@/lib/api";
import type { Document } from "@/lib/types";
import Badge, { statusBadgeVariant } from "@/app/ui/Badge";
import Spinner from "@/app/ui/Spinner";

export default function DocumentList() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listDocuments();
      setDocuments(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Polling: refresh every 3 seconds while documents are processing ──
  // Any document with status "pending" or "chunking" means we're still
  // waiting for the AI service to finish embedding. Once all documents
  // are in a terminal state ("embedded" or "failed"), polling stops.
  useEffect(() => {
    const hasProcessing = documents.some(
      (doc) => doc.status === "pending" || doc.status === "chunking"
    );

    if (!hasProcessing) return; // Nothing to poll — all done

    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval); // Cleanup on unmount or when no longer processing
  }, [documents, refresh]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" />
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={refresh}
          className="mt-2 text-sm text-zinc-400 underline hover:text-zinc-200"
        >
          Try again
        </button>
      </div>
    );
  }

  // ── Empty state ──
  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center">
        <svg
          className="mx-auto mb-3 h-10 w-10 text-zinc-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-sm text-zinc-400">No documents yet</p>
        <p className="mt-1 text-xs text-zinc-600">
          Upload a .md or .txt file to get started
        </p>
      </div>
    );
  }

  // ── Document list ──
  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        // Get badge color + pulse based on document status
        const badge = statusBadgeVariant(doc.status);
        const isProcessing = doc.status === "pending" || doc.status === "chunking";

        return (
          <div
            key={doc.id}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3 transition-colors hover:bg-zinc-900"
          >
            {/* Left side: title + metadata */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-100">
                {doc.title}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {doc.chunkCount > 0
                  ? `${doc.chunkCount} chunks`
                  : "Processing…"}{" "}
                · {new Date(doc.createdAt).toLocaleDateString()}
              </p>
            </div>

            {/* Right side: status badge + processing spinner */}
            <div className="ml-4 flex items-center gap-2">
              {isProcessing && <Spinner size="sm" />}
              <Badge variant={badge.variant} pulse={badge.pulse}>
                {doc.status}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}