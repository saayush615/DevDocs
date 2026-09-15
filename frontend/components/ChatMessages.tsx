"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import type { Message } from "@/lib/types";
import Badge from "@/app/ui/Badge";

interface ChatMessagesProps {
  messages: Message[];
}

export default function ChatMessages({ messages }: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Auto-scroll to bottom when messages change ────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  // ── Empty state ──
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-zinc-600">
          Send a message to start the conversation
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.map((msg) => (
          <div key={msg.id}>
            {/* ── User Message ── */}
            {msg.role === "user" && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl bg-zinc-800 px-4 py-3 text-sm text-zinc-100">
                  {msg.content}
                </div>
              </div>
            )}

            {/* ── Assistant Message ── */}
            {msg.role === "assistant" && (
              <div className="flex flex-col gap-2">
                {/* Badge showing which route the agent took */}
                {msg.routeTaken && (
                  <div>
                    <Badge
                      variant={
                        msg.routeTaken === "multi_hop" ? "violet" : "zinc"
                      }
                    >
                      {msg.routeTaken === "multi_hop"
                        ? "Multi-hop"
                        : "Simple retrieval"}
                    </Badge>
                  </div>
                )}

                {/* Rendered markdown answer */}
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown
                    components={{
                      // Custom styling for code blocks
                      code: ({ className, children, ...props }) => {
                        const isBlock = className?.includes("language-");
                        if (isBlock) {
                          return (
                            <code
                              className="block overflow-x-auto rounded-lg bg-zinc-800 p-4 text-xs"
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        }
                        return (
                          <code
                            className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-emerald-400"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                      // Custom styling for links (open in new tab)
                      a: ({ children, ...props }) => (
                        <a
                          className="text-emerald-400 underline hover:text-emerald-300"
                          target="_blank"
                          rel="noopener noreferrer"
                          {...props}
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>

                {/* ── Citations Block ── */}
                {/* Only shown when the assistant message has citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <details className="group mt-2">
                    <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                      {msg.citations.length} source
                      {msg.citations.length !== 1 ? "s" : ""} cited
                    </summary>
                    <div className="mt-2 space-y-2">
                      {msg.citations.map((cite, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-white/5 bg-zinc-900/50 p-3"
                        >
                          <p className="text-xs text-zinc-500">
                            Doc: {cite.document_id.slice(0, 8)}… · Chunk{" "}
                            {cite.chunk_index}
                          </p>
                          <p className="mt-1 text-xs text-zinc-400">
                            {cite.snippet}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}