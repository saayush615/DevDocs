export type DocumentStatus = "pending" | "chunking" | "embedded" | "failed";

// -- Document
export interface Document {
    id: string;
    userId: string;
    title: string;
    sourceType: string;
    status: DocumentStatus;
    chunkCount: number;
    createdAt: string; // ISO date string from JSON serialization
}

// -- Conversation
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

// -- Message
export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  routeTaken: string | null;   // "simple" or "multi_hop"
  createdAt: string;
}

// --Citation
export interface Citation {
  document_id: string;   // Which document this came from
  chunk_index: number;   // Which chunk within that document
  snippet: string;       // The actual text of the chunk
}

// -- Api Response Envalope
// Every backend endpoint wraps its response in { success, message, data }.
// This generic type lets us unwrap it with type safety.
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// ─── SSE Events ───────────────────────────────────────────────────────
// The chat endpoint streams Server-Sent Events (SSE).
// Each event is a line like: data: {"token":"Hello"} or data: {"done":true,...}

// Token event — one per generated word/token
export interface SSETokenEvent {
  token: string;
}

// Done event — sent once at the end, carries metadata
export interface SSEDoneEvent {
  done: true;
  citations: Citation[];
  route_taken: string;
}