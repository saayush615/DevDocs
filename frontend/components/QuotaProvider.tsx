"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getQuota } from "@/lib/api";
import type { Quota } from "@/lib/types";

interface QuotaContextValue {
  quota: Quota | null;
  failed: boolean;
  refresh: () => Promise<void>;
}

const QuotaContext = createContext<QuotaContextValue | null>(null);

export function QuotaProvider({ children }: { children: React.ReactNode }) {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getQuota();
      setQuota(data);
      setFailed(false);
    } catch {
      // Endpoint unavailable → consumers hide the meter quietly.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  return (
    <QuotaContext.Provider value={{ quota, failed, refresh }}>{children}</QuotaContext.Provider>
  );
}

export function useQuota(): QuotaContextValue {
  const ctx = useContext(QuotaContext);
  if (!ctx) {
    throw new Error("useQuota must be used within QuotaProvider");
  }
  return ctx;
}
