import type { ApiResponse } from "@/lib/types";

export const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Backend errors are `{ error }`, success envelopes are `{ message }`.
export function extractMessage(text: string): string | null {
  try {
    const json = JSON.parse(text);
    if (typeof json?.error === "string") return json.error;
    if (typeof json?.message === "string") return json.message;
  } catch {
    /* body wasn't JSON — fall through */
  }
  return null;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new ApiError(res.status, extractMessage(text) ?? `API error ${res.status}`);
  }

  const json: ApiResponse<T> = await res.json();
  if (!json.success) {
    throw new Error(json.message ?? "Request failed");
  }
  return json.data;
}
