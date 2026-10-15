export type DocumentStatus = "pending" | "chunking" | "embedded" | "failed";

export interface Document {
  id: string;
  userId: string;
  title: string;
  sourceType: string;
  status: DocumentStatus;
  chunkCount: number;
  createdAt: string; // ISO date string from JSON serialization
}
