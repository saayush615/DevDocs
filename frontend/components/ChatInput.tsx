"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Spinner from "@/app/ui/Spinner";
import { ApiError } from "@/lib/api";
import { transcribeAudio } from "@/lib/api/voice";

interface ChatInputProps {
  onSend: (message: string) => void; // call this to send the message
  disabled: boolean; // When true, input is disabled and shows a streaming indicator
}

const MAX_RECORDING_MS = 60_000;

interface SpeechResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

interface SpeechResultEvent {
  results: ArrayLike<SpeechResult>;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function speechRecognitionCtor(): (new () => BrowserSpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const host = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

function recordingMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  return "";
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const shouldSendRef = useRef(false);
  const listeningRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const busy = disabled || transcribing;

  function resizeTextarea() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = 96;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }

  function showTranscript(text: string) {
    if (!textareaRef.current) return;
    textareaRef.current.value = text;
    resizeTextarea();
  }

  function clearComposer() {
    if (!textareaRef.current) return;
    textareaRef.current.value = "";
    textareaRef.current.style.height = "auto";
  }

  function submit(text: string) {
    const value = text.trim();
    if (!value || disabled) return;
    setVoiceError(null);
    onSend(value);
    clearComposer();
  }

  function clearTimer() {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function markIdle() {
    listeningRef.current = false;
    setListening(false);
  }

  function finishWebSpeech(send: boolean) {
    shouldSendRef.current = send;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      if (send) recognition?.stop();
      else recognition?.abort();
    } catch {
      markIdle();
    }
    if (!recognition) markIdle();
  }

  function finishRecorder(send: boolean) {
    shouldSendRef.current = send;
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    releaseStream();
    markIdle();
  }

  function cancelVoice() {
    if (recognitionRef.current) finishWebSpeech(false);
    else finishRecorder(false);
    setVoiceError(null);
  }

  // Auto-resize textarea to fit content (This creates the auto-growing effect)
  useEffect(() => {
    resizeTextarea();
  });

  useEffect(() => {
    if (!disabled || !listeningRef.current || shouldSendRef.current) return;
    if (recognitionRef.current) finishWebSpeech(false);
    else finishRecorder(false);
    // Stop a live mic when streaming starts, without cancelling a transcript
    // that is already on its way to onSend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  useEffect(() => {
    return () => {
      shouldSendRef.current = false;
      clearTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        /* already stopped */
      }
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      releaseStream();
    };
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && listeningRef.current) {
      e.preventDefault();
      cancelVoice();
      return;
    }
    // Enter (without Shift) = send message
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevent newline
      if (listeningRef.current) {
        if (recognitionRef.current) finishWebSpeech(false);
        else finishRecorder(false);
      }
      const value = textareaRef.current?.value.trim();
      if (!value || busy) return; // Don't send empty messages or while streaming
      submit(value);
    }
    // Shift+Enter = newline (default behavior, no action needed)
  }

  function startWebSpeech(Ctor: new () => BrowserSpeechRecognition) {
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    finalTranscriptRef.current = "";
    shouldSendRef.current = true;

    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const piece = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += piece;
        else interim += piece;
      }
      finalTranscriptRef.current = finalText;
      showTranscript(`${finalText}${interim}`);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      shouldSendRef.current = false;
      if (event.error === "not-allowed") setVoiceError("Microphone permission denied");
      else if (event.error === "no-speech") setVoiceError("No speech detected");
      else setVoiceError("Could not transcribe speech");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      markIdle();
      if (!shouldSendRef.current) return;
      const text = (textareaRef.current?.value || finalTranscriptRef.current).trim();
      if (!text) {
        setVoiceError("No speech detected");
        return;
      }
      showTranscript(text);
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    setListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      markIdle();
      setVoiceError("Could not start the microphone");
    }
  }

  async function startRecorder() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Speech input is not supported in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = recordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        releaseStream();
        recorderRef.current = null;
        markIdle();
        clearTimer();
        if (!shouldSendRef.current) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) {
          setVoiceError("No speech detected");
          return;
        }
        setTranscribing(true);
        void transcribeAudio(blob)
          .then(({ text }) => {
            const value = text.trim();
            if (!value) {
              setVoiceError("No speech detected");
              return;
            }
            showTranscript(value);
          })
          .catch((err: unknown) => {
            const message = err instanceof ApiError ? err.message : "Could not transcribe speech";
            setVoiceError(message);
          })
          .finally(() => setTranscribing(false));
      };
      recorderRef.current = recorder;
      shouldSendRef.current = true;
      listeningRef.current = true;
      setListening(true);
      recorder.start();
      timerRef.current = window.setTimeout(() => {
        if (recorderRef.current?.state === "recording") finishRecorder(true);
      }, MAX_RECORDING_MS);
    } catch {
      releaseStream();
      markIdle();
      setVoiceError("Microphone permission denied");
    }
  }

  function toggleMic() {
    if (busy) return;
    if (listeningRef.current) {
      if (recognitionRef.current) finishWebSpeech(true);
      else finishRecorder(true);
      return;
    }
    setVoiceError(null);
    const Ctor = speechRecognitionCtor();
    if (Ctor) startWebSpeech(Ctor);
    else void startRecorder();
  }

  const placeholder = busy
    ? disabled
      ? "Waiting for response…"
      : "Transcribing…"
    : listening
      ? "Listening…"
      : "Ask a question…";

  return (
    <div className="border-t border-white/10 bg-[#09090b] p-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-3 rounded-xl border border-white/10 bg-zinc-900 px-4 py-3">
          <textarea
            ref={textareaRef}
            placeholder={placeholder}
            disabled={busy}
            onKeyDown={handleKeyDown}
            rows={1}
            className="max-h-24 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none disabled:opacity-50"
          />

          <button
            type="button"
            onClick={toggleMic}
            disabled={busy}
            title={listening ? "Pause microphone" : "Speak a question"}
            aria-pressed={listening}
            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
              listening
                ? "bg-red-500 text-zinc-950 hover:bg-red-400"
                : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
            }`}
          >
            {listening ? (
              <span className="absolute inset-0 animate-ping rounded-lg bg-red-500/40" />
            ) : null}
            {transcribing ? (
              <Spinner size="sm" />
            ) : listening ? (
              <svg className="relative h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-14 0M12 18v3"
                />
              </svg>
            )}
          </button>

          {disabled ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Spinner size="sm" />
              <span>Streaming…</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (listeningRef.current) {
                  if (recognitionRef.current) finishWebSpeech(false);
                  else finishRecorder(false);
                }
                const value = textareaRef.current?.value.trim();
                if (!value || transcribing) return;
                submit(value);
              }}
              disabled={transcribing}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
              title="Send message (Enter)"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14M12 5l7 7-7 7"
                />
              </svg>
            </button>
          )}
        </div>
        {voiceError ? <p className="mt-2 text-xs text-red-400">{voiceError}</p> : null}
      </div>
    </div>
  );
}
