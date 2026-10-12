export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

export interface Citation {
  document_id: string;
  chunk_index: number;
  snippet: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  routeTaken: string | null; // "simple" or "multi_hop"
  createdAt: string;
}
