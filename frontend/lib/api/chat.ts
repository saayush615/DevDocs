import type { Citation, SSEDoneEvent, SSETokenEvent } from "@/lib/types";
import { ApiError, BASE, extractMessage } from "./client";

export interface ChatStreamCallbacks {
  onToken: (token: string) => void;
  onDone: (citations: Citation[], routeTaken: string) => void;
  onError: (error: Error) => void;
}

/**
 * POST /api/chat — stream the AI response via SSE.
 *
 * Token lines:  data: {"token":"Hello"}
 * Done line:    data: {"done":true,"citations":[...],"route_taken":"simple"}
 *
 * fetch + ReadableStream (not EventSource): we need POST + a JSON body.
 */
export async function chatSSE(
  question: string,
  conversationId: string,
  callbacks: ChatStreamCallbacks
): Promise<void> {
  const { onToken, onDone, onError } = callbacks;

  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, conversationId }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError(res.status, extractMessage(text) ?? `Chat request failed (${res.status})`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const payload = JSON.parse(trimmed.slice(6)) as SSETokenEvent | SSEDoneEvent;

          if ("token" in payload && payload.token) {
            onToken(payload.token);
          }

          if ("done" in payload && payload.done) {
            onDone(payload.citations ?? [], payload.route_taken ?? "simple");
          }
        } catch {
          // Malformed JSON — skip this line
        }
      }
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
