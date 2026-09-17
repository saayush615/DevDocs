"use client";

import { useState, useRef } from "react";
import { uploadDocument } from "@/lib/api";
import Spinner from "@/app/ui/Spinner";

interface DocumentUploaderProps {
  onUpload: () => void;
}

export default function DocumentUploader({ onUpload }: DocumentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Validate and upload a file ────────────────────────────────────
  async function handleFile(file: File) {
    setError(null);
    setSuccess(null);

    // Client-side validation: check file extension
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "md" && ext !== "txt") {
      setError("Only .md and .txt files are allowed");
      return;
    }

    // Client-side validation: check file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      setError("File must be smaller than 2MB");
      return;
    }

    setUploading(true);
    try {
      await uploadDocument(file);
      setSuccess(`"${file.name}" uploaded and processing`);
      onUpload(); // Trigger list refresh in parent
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // ── Drag-and-drop handlers ────────────────────────────────────────
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  // ── Click-to-browse handler ───────────────────────────────────────
  function handleClick() {
    fileInputRef.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset the input so the same file can be re-selected
    e.target.value = "";
  }

  return (
    <div className="space-y-3">
      {/* ── Drop Zone ── */}
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors
          ${isDragging
            ? "border-emerald-400 bg-emerald-400/5"
            : "border-white/10 bg-zinc-900/50 hover:border-white/20 hover:bg-zinc-900"
          }
          ${uploading ? "pointer-events-none opacity-50" : ""}
        `}
      >
        {uploading ? (
          <Spinner size="lg" />
        ) : (
          <>
            {/* Upload icon */}
            <svg
              className="mb-3 h-8 w-8 text-zinc-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm text-zinc-400">
              Drop a file here or{" "}
              <span className="text-emerald-400">browse</span>
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              .md or .txt, up to 2MB
            </p>
          </>
        )}
      </div>

      {/* Hidden file input — triggered by clicking the drop zone */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.txt"
        onChange={handleChange}
        className="hidden"
      />

      {/* ── Status Messages ── */}
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          {success}
        </p>
      )}
    </div>
  );
}