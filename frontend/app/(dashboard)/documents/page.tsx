"use client";

import { useState } from "react";
import DocumentUploader from "@/components/DocumentUploader";
import DocumentList from "@/components/DocumentList";

export default function DocumentsPage() {
  // Increment this key to force DocumentList to re-mount and re-fetch
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* ── Page Header ── */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-100">Documents</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Upload markdown or text files. The AI will chunk and embed them for
          retrieval in chat.
        </p>
      </div>

      {/* ── Upload Zone ── */}
      <DocumentUploader onUpload={() => setRefreshKey((k) => k + 1)} />

      {/* ── Document List ── */}
      {/* key={refreshKey} forces a full re-mount → triggers useEffect fetch */}
      <div className="mt-8">
        <DocumentList key={refreshKey} />
      </div>
    </div>
  );
}