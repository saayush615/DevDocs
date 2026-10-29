import { z } from "zod";

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
}

export const conversationTitleSchema = z.object({
  title: z.string().trim().min(1).max(100),
});

export type ConversationTitleValues = z.infer<typeof conversationTitleSchema>;

export interface Citation {
  document_id: string;
  chunk_index: number;
  snippet: string;
  page?: number | null;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  routeTaken: string | null; // "simple" | "multi_hop" | "blocked" | "off_topic"
  createdAt: string;
}
