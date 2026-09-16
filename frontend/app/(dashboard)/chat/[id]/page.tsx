"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { getConversation, chatSSE } from "@/lib/api";
import type { Message, Citation } from "@/lib/types";
import ChatMessages from "@/components/ChatMessages";
import ChatInput from "@/components/ChatInput";
import Spinner from "@/app/ui/Spinner";

export default function ChatConversationPage() {
  // Read the conversation ID from the URL: /chat/[id]
  const params = useParams<{ id: string }>();
  const conversationId = params.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load conversation history on mount ────────────────────────────
  const loadConversation = useCallback(async () => {
    if (!conversationId) return;
    try {
      const conv = await getConversation(conversationId);
      setMessages(conv.messages); // Messages are ordered ascending by date
    } catch {
      setError("Failed to load conversation");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  // ── Send a message ────────────────────────────────────────────────
  // This is the core of the chat feature. It:
  //   1. Adds the user message to state (optimistic)
  //   2. Adds an empty assistant message (will be filled by streaming)
  //   3. Streams tokens from the backend via SSE
  //   4. Updates the assistant message in real time as tokens arrive
  //   5. Stores citations and route info when the stream completes
  async function handleSend(question: string) {
    if (isStreaming || !conversationId) return;

    setError(null);
    setIsStreaming(true);

    // ── Step 1: Create the user message object ──
    // We generate a temporary ID client-side. The real message is saved
    // by the backend, but we need to show it immediately (optimistic UI).
    const userMessage: Message = {
      id: `temp-user-${Date.now()}`,
      conversationId,
      role: "user",
      content: question,
      citations: null,
      routeTaken: null,
      createdAt: new Date().toISOString(),
    };

    // ── Step 2: Create an empty assistant message placeholder ──
    // The streaming tokens will fill this message's content over time.
    const assistantMessage: Message = {
      id: `temp-assistant-${Date.now()}`,
      conversationId,
      role: "assistant",
      content: "", // Empty — will be filled token by token
      citations: null,
      routeTaken: null,
      createdAt: new Date().toISOString(),
    };

    // Add both messages to state immediately so the UI updates
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    // ── Step 3: Start streaming ──
    let streamedContent = ""; // Accumulates the full answer text

    await chatSSE(question, conversationId, {
      // Called for each token — append it to the assistant message
      onToken: (token) => {
        streamedContent += token;
        setMessages((prev) => {
          // Find the last assistant message and update its content
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx]?.role === "assistant") {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: streamedContent,
            };
          }
          return updated;
        });
      },

      // Called once when the stream finishes — store citations and route
      onDone: (citations: Citation[], routeTaken: string) => {
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx]?.role === "assistant") {
            updated[lastIdx] = {
              ...updated[lastIdx],
              citations,     // Array of source citations from the AI
              routeTaken,    // "simple" or "multi_hop"
            };
          }
          return updated;
        });
        setIsStreaming(false);
      },

      // Called if the stream or fetch fails
      onError: (err) => {
        // Show the fallback message the backend already sent, or our own error
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx]?.role === "assistant" && !updated[lastIdx].content) {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content:
                "Sorry, something went wrong. Please try again.",
            };
          }
          return updated;
        });
        setError(err.message);
        setIsStreaming(false);
      },
    });
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // ── Error state (conversation not found, etc.) ──
  if (error && messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-400">{error}</p>
        <p className="text-xs text-zinc-600">
          This conversation may have been deleted.
        </p>
      </div>
    );
  }

  // ── Main chat layout ──
  // Messages take up all available space (scrollable), input pinned to bottom
  return (
    <div className="flex h-full flex-col">
      {/* Message list — scrollable */}
      <ChatMessages messages={messages} />

      {/* Input bar — pinned to bottom */}
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}