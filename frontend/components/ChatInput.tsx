"use client";

import { useRef, useEffect, type KeyboardEvent } from "react";
import Spinner from "@/app/ui/Spinner";

interface ChatInputProps {
  onSend: (message: string) => void; // call this to send the message
  disabled: boolean; // When true, input is disabled and shows a streaming indicator
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit content (This creates the auto-growing effect)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Reset height to auto first so it shrinks when text is deleted
    textarea.style.height = "auto";
    // Set height to scrollHeight, capped at 4 lines (~96px with our line-height)
    const maxHeight = 96; // ~4 lines
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  });

  // ── Keyboard handler ──────────────────────────────────────────────
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter (without Shift) = send message
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevent newline
      const value = textareaRef.current?.value.trim();
      if (!value || disabled) return; // Don't send empty messages or while streaming
      onSend(value);
      // Clear the textarea after sending
      if (textareaRef.current) {
        textareaRef.current.value = "";
        textareaRef.current.style.height = "auto"; // Reset to single line
      }
    }
    // Shift+Enter = newline (default behavior, no action needed)
  }

  return (
    <div className="border-t border-white/10 bg-[#09090b] p-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-3 rounded-xl border border-white/10 bg-zinc-900 px-4 py-3">
          {/* ── Textarea ── */}
          <textarea
            ref={textareaRef}
            placeholder={
              disabled ? "Waiting for response…" : "Ask a question…"
            }
            disabled={disabled}
            onKeyDown={handleKeyDown}
            rows={1}
            className="max-h-24 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none disabled:opacity-50"
          />

          {/* ── Send Button / Streaming Indicator ── */}
          {disabled ? (
            // Show spinner while AI is streaming a response
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Spinner size="sm" />
              <span>Streaming…</span>
            </div>
          ) : (
            // Send button — emerald circle with arrow icon
            <button
              onClick={() => {
                const value = textareaRef.current?.value.trim();
                if (!value) return;
                onSend(value);
                if (textareaRef.current) {
                  textareaRef.current.value = "";
                  textareaRef.current.style.height = "auto";
                }
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
              title="Send message (Enter)"
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
                  d="M5 12h14M12 5l7 7-7 7"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}