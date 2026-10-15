import type { Conversation, Message } from "@/lib/types";
import { apiFetch } from "./client";

export function createConversation(title?: string): Promise<Conversation> {
  return apiFetch<Conversation>("/api/conversation/", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function listConversations(): Promise<Conversation[]> {
  return apiFetch<Conversation[]>("/api/conversation/");
}

export function getConversation(id: string): Promise<Conversation & { messages: Message[] }> {
  return apiFetch<Conversation & { messages: Message[] }>(`/api/conversation/${id}`);
}

export function updateConversation(id: string, title: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/conversation/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function deleteConversation(id: string): Promise<null> {
  return apiFetch<null>(`/api/conversation/${id}`, { method: "DELETE" });
}
