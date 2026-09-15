"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "@/lib/auth-client";
import { loginSchema, type LoginFormValues } from "@/lib/auth-schema";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(values: LoginFormValues) {
    setError(null);
    setLoading(true);

    // better-auth React client — sends POST /api/auth/sign-in/email -> Returns { data, error } — data is the session if successful
    const { error } = await signIn.email(values);
    setLoading(false);

    if (error) {
      setError(error.message ?? "Sign-in failed");
      return;
    }

    // Success: navigate to chat and refresh to pick up the new session cookie
    router.push("/chat");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b] px-4">
      {/* ── Login Card ── */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="w-full max-w-sm rounded-xl border border-white/10 bg-zinc-900 p-8 shadow-2xl"
      >
        <h1 className="mb-6 text-xl font-semibold text-zinc-100">Log in</h1>

        {/* ── Email Field ── */}
        <label className="mb-1 block text-sm font-medium text-zinc-300">
          Email
        </label>
        <input
          type="email"
          {...register("email")}
          placeholder="you@example.com"
          className="mb-1 w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50"
        />
        {errors.email && (
          <p className="mb-3 text-sm text-red-400">{errors.email.message}</p>
        )}

        {/* ── Password Field ── */}
        <label className="mb-1 block text-sm font-medium text-zinc-300">
          Password
        </label>
        <input
          type="password"
          {...register("password")}
          placeholder="••••••••"
          className="mb-1 w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50"
        />
        {errors.password && (
          <p className="mb-3 text-sm text-red-400">{errors.password.message}</p>
        )}

        {/* ── Server Error ── */}
        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        {/* ── Submit Button ── */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>

        {/* ── Link to Signup ── */}
        <p className="mt-4 text-center text-sm text-zinc-500">
          No account?{" "}
          <a href="/signup" className="text-emerald-400 hover:underline">
            Sign up
          </a>
        </p>
      </form>
    </div>
  );
}
