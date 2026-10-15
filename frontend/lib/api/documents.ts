import type { Document } from "@/lib/types";
import { apiFetch } from "./client";

export function listDocuments(): Promise<Document[]> {
  return apiFetch<Document[]>("/api/document/");
}

export function uploadDocument(file: File): Promise<Document> {
  const form = new FormData();
  form.append("file", file); // Must match multer: upload.single("file")
  return apiFetch<Document>("/api/document/upload", {
    method: "POST",
    body: form,
  });
}
