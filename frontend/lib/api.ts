import type {
  ApiResponse,
  Conversation,
  Document,
  Message,
  Citation,
  SSEDoneEvent,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

// -- Core Fetch Helper(adds the base URL, sends cookies, parses the JSON envelope)
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`API error ${res.status}: ${text}`);
  }

  const json: ApiResponse<T> = await res.json();
  if (!json.success) {
    throw new Error(json.message ?? "Request failed");
  }
  return json.data;
}

// -- Document Endpoints

// GET /api/document/
export function listDocuments(): Promise<Document[]> {
  return apiFetch<Document[]>("/api/document/");
}

// POST /api/document/upload 
export async function uploadDocument(file: File): Promise<Document> {
  const form = new FormData();
  form.append("file", file); // Must match the field name in multer: upload.single('file')

  const res = await fetch(`${BASE}/api/document/upload`, {
    method: "POST",
    credentials: "include",
    // Do NOT set Content-Type — browser adds it automatically with boundary
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Upload failed");
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }

  const json: ApiResponse<Document> = await res.json();
  if (!json.success) throw new Error(json.message ?? "Upload failed");
  return json.data;
}

// -- Conversation Endpoints

// POST /api/conversation/ 
export function createConversation(title?: string): Promise<Conversation> {
  return apiFetch<Conversation>("/api/conversation/", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

// GET /api/conversation/
export function listConversations(): Promise<Conversation[]> {
  return apiFetch<Conversation[]>("/api/conversation/");
}

// GET /api/conversation/:id
export function getConversation(
  id: string
): Promise<Conversation & { messages: Message[] }> {
  return apiFetch<Conversation & { messages: Message[] }>(
    `/api/conversation/${id}`
  );
}

// DELETE /api/conversation/:id
export function deleteConversation(id: string): Promise<null> {
  return apiFetch<null>(`/api/conversation/${id}`, { method: "DELETE" });
}

// -- Chat (SSE Streaming)

/** The callbacks our SSE parser will invoke */
export interface ChatStreamCallbacks {
  onToken: (token: string) => void;       // Called for each streamed token
  onDone: (citations: Citation[], routeTaken: string) => void; // Called once at end
  onError: (error: Error) => void;         // Called on any failure
}

/**
 * POST /api/chat — Send a question and stream the AI response via SSE.
 *
 * SSE PROTOCOL (from backend/src/controllers/chat.controller.ts):
 *   - Content-Type: text/event-stream
 *   - Token lines:  data: {"token":"Hello"}
 *   - Done line:    data: {"done":true,"citations":[...],"route_taken":"simple"}
 *
 * We use fetch() + ReadableStream instead of EventSource because:
 *   1. EventSource only supports GET — we need POST with a JSON body
 *   2. We need fine control over the stream for cancellation
 */
export async function chatSSE(
  question: string,
  conversationId: string,
  callbacks: ChatStreamCallbacks
): Promise<void> {
  const { onToken, onDone, onError } = callbacks;

  try {
    // Send the chat request — the response body is a readable byte stream
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, conversationId }),
    });

    if (!res.ok) {
      throw new Error(`Chat request failed (${res.status})`);
    }

    // Get a reader to consume the SSE stream incrementally
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = ""; // Holds partial lines between chunks

    while (true) {
      const { done, value } = await reader.read();
      if (done) break; // Stream fully consumed

      // Decode binary chunk to text and append to our buffer
      buffer += decoder.decode(value, { stream: true });

      // Split on newlines to get individual SSE lines
      // The last element may be incomplete (no trailing \n yet), so we keep it in buffer
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      // Process each complete line
      for (const line of lines) {
        const trimmed = line.trim();

        // SSE data lines start with "data: " — skip empty lines
        if (!trimmed.startsWith("data: ")) continue;

        try {
          // Parse the JSON payload after the "data: " prefix
          const payload = JSON.parse(trimmed.slice(6));

          // Token event — append this token to the assistant's answer
          if (payload.token) {
            onToken(payload.token);
          }

          // Done event — stream finished, extract metadata
          if (payload.done) {
            onDone(
              payload.citations ?? [],          // Array of source citations
              payload.route_taken ?? "simple"   // Which agent route was used
            );
          }
        } catch {
          // Malformed JSON — skip this line, don't crash
        }
      }
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}