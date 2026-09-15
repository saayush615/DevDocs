"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createConversation } from "@/lib/api";
import Button from "@/app/ui/Button";
import Spinner from "@/app/ui/Spinner";

export default function ChatPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleNewChat() {
    setCreating(true);
    try {
      const conv = await createConversation("New chat");
      router.push(`/chat/${conv.id}`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      {/* ── Empty State ── */}
      <div className="text-center">
        {/* App icon */}
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
          <svg
            className="h-6 w-6 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </div>

        <h2 className="text-lg font-semibold text-zinc-100">
          DevDocs Copilot
        </h2>
        <p className="mt-2 max-w-sm text-sm text-zinc-500">
          Ask questions about your uploaded documents. The AI retrieves
          relevant chunks and answers with citations.
        </p>

        {/* ── New Chat Button ── */}
        <Button
          onClick={handleNewChat}
          disabled={creating}
          className="mt-6"
        >
          {creating ? (
            <Spinner size="sm" />
          ) : (
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          )}
          {creating ? "Creating…" : "Start new chat"}
        </Button>

        {/* ── Tips ── */}
        <div className="mt-8 max-w-sm space-y-2 text-left">
          <p className="text-xs font-medium text-zinc-500">Quick tips:</p>
          <ul className="space-y-1 text-xs text-zinc-600">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-emerald-400">→</span>
              Upload documents in the Documents tab first
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-emerald-400">→</span>
              Ask specific questions for better answers
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-emerald-400">→</span>
              Answers include citations linking back to source docs
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}