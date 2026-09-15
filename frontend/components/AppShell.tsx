"use client";
// The main layout wrapper for all authenticated pages (chat, documents).

import { useState } from "react";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#09090b]">
      {/* ── Mobile Backdrop ──────────────────────────────────────────── */}
      {/* Semi-transparent overlay behind the sidebar on mobile.
          Clicking it closes the sidebar. Only visible when sidebar is open. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      {/* On desktop (md+): always visible, fixed position within the flex layout.
          On mobile: absolute overlay, slides in from left when sidebarOpen is true. */}
      <div
        className={`
          fixed inset-y-0 left-0 z-40 transition-transform duration-200
          md:static md:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <Sidebar />
      </div>

      {/* ── Main Area (Header + Content) ─────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* ── Header Bar ── */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 px-4">
          {/* Hamburger button — only visible on mobile */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded p-1 text-zinc-400 hover:text-zinc-100 md:hidden"
            aria-label="Open sidebar"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          {/* App title — desktop shows full title, mobile shows shorter */}
          <h1 className="text-sm font-medium text-zinc-300">DevDocs Copilot</h1>
        </header>

        {/* ── Page Content ── */}
        {/* flex-1 + overflow-y-auto = content scrolls independently of sidebar */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}