import { apiFetch } from "./client";

export function transcribeAudio(blob: Blob): Promise<{ text: string }> {
  const form = new FormData();
  const mime = blob.type.split(";")[0]?.trim().toLowerCase() || "audio/webm";
  const ext = mime.includes("wav")
    ? "wav"
    : mime.includes("mpeg")
      ? "mp3"
      : mime.includes("ogg")
        ? "ogg"
        : mime.includes("mp4")
          ? "mp4"
          : "webm";
  form.append("audio", blob, `speech.${ext}`);
  return apiFetch<{ text: string }>("/api/voice/transcribe", {
    method: "POST",
    body: form,
  });
}
