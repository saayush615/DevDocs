import type { Citation } from "./conversation";

// Every backend endpoint wraps its response in { success, message, data }.
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

// Chat SSE lines: data: {"token":"Hello"} or data: {"done":true,...}
export interface SSETokenEvent {
  token: string;
}

export interface SSEDoneEvent {
  done: true;
  citations: Citation[];
  route_taken: string;
}
