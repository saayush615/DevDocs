"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import {
  listConversations,
  createConversation,
  deleteConversation,
} from "@/lib/api";
import type { Conversation } from "@/lib/types";
import Button from "@/app/ui/Button";

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Fetch conversations
  const refresh = useCallback(async () => {
    try {
      const data = await listConversations();
      setConversations(data);
    } catch {
      // Silently fail — sidebar will show empty list, user can retry
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch conversations on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // "New Chat" btn handler
  async function handleNewChat() {
    setCreating(true);
    try {
      const conv = await createConversation("New chat");
      await refresh();
      router.push(`/chat/${conv.id}`);
    } catch {
      // If creation fails, the user can try again
    } finally {
      setCreating(false);
    }
  }

  // Delete conversation handler
  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation(); // Prevent the click from navigating to the conversation
    try {
      await deleteConversation(id);
      if (pathname === `/chat/${id}`) {
        router.push("/chat");
      }
      await refresh();
    } catch {
      // Silently fail — conversation will reappear on next refresh
    }
  }

  // ── Extract the conversation ID from the current URL ──────────────
  // Matches URLs like /chat/abc123 → extracts "abc123"
  // Returns null if we're not on a chat page
  const activeId = pathname.match(/^\/chat\/([^/]+)/)?.[1] ?? null;

  // Signout handler
  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-white/10 bg-zinc-900/50">
      {/* ── Top Section: "New chat" button ── */}
      <div className="p-3">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={handleNewChat}
          disabled={creating}
        >
          {/* Plus icon (inline SVG — no icon library needed) */}
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
          {creating ? "Creating…" : "New chat"}
        </Button>
      </div>

      {/* ── Middle Section: Conversation List (scrollable) ── */}
      <nav className="flex-1 overflow-y-auto px-2">
        {loading ? (
          // Loading state — show 3 skeleton lines
          <div className="space-y-2 p-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-9 animate-pulse rounded-lg bg-white/5"
              />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          // Empty state — no conversations yet
          <p className="p-4 text-center text-sm text-zinc-600">
            No conversations yet
          </p>
        ) : (
          // Conversation list — each item links to /chat/[id]
          conversations.map((conv) => {
            const isActive = conv.id === activeId;
            return (
              <div
                key={conv.id}
                onClick={() => router.push(`/chat/${conv.id}`)}
                className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors
                  ${isActive
                    ? "bg-white/10 text-zinc-100"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  }
                `}
              >
                {/* Conversation title — truncate if too long */}
                <span className="truncate">{conv.title}</span>

                {/* Delete button — visible on hover (always visible for active) */}
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className={`ml-2 shrink-0 rounded p-1 text-zinc-600 transition-colors hover:text-red-400
                    ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
                  `}
                  title="Delete conversation"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </nav>

      {/* ── Bottom Section: Docs link + User info + Sign out ── */}
      <div className="border-t border-white/10 p-3">
        {/* Documents link */}
        <button
          onClick={() => router.push("/documents")}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
        >
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Documents
        </button>

        {/* User info + sign out */}
        <div className="mt-2 flex items-center justify-between rounded-lg px-3 py-2">
          <span className="truncate text-xs text-zinc-500">
            {session?.user.name ?? session?.user.email}
          </span>
          <button
            onClick={handleSignOut}
            className="shrink-0 rounded p-1 text-zinc-600 transition-colors hover:text-red-400"
            title="Sign out"
          >
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
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}