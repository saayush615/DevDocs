"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { listConversations } from "@/lib/api";
import type { Conversation } from "@/lib/types";

interface ConversationsContextValue {
  conversations: Conversation[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const ConversationsContext = createContext<ConversationsContextValue | null>(null);

export function ConversationsProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await listConversations();
      setConversations(data);
    } catch {
      // Silently fail — sidebar will show empty list, user can retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  return (
    <ConversationsContext.Provider value={{ conversations, loading, refresh }}>
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations(): ConversationsContextValue {
  const ctx = useContext(ConversationsContext);
  if (!ctx) {
    throw new Error("useConversations must be used within ConversationsProvider");
  }
  return ctx;
}
