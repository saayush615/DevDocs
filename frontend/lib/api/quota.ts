import type { Quota } from "@/lib/types";
import { apiFetch } from "./client";

export function getQuota(): Promise<Quota> {
  return apiFetch<Quota>("/api/quota");
}
