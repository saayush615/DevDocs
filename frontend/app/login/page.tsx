"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "@/lib/auth-client";
import { loginSchema, LoginFormValues } from "@/lib/auth-schema";

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
    const { error } = await signIn.email(values);
    setLoading(false);
    if (error) {
      setError(error.message ?? "Sign-in failed");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="w-full max-w-sm rounded-lg bg-white p-8 shadow"
      >
        <h1 className="mb-6 text-xl font-semibold text-zinc-900">Log in</h1>
        <label className="mb-1 block text-sm font-medium text-zinc-900">Email</label>
        <input
          type="email"
          {...register("email")}
          className="mb-1 w-full rounded border px-3 py-2 text-zinc-600"
        />
        {errors.email && <p className="mb-3 text-sm text-red-600">{errors.email.message}</p>}
        <label className="mb-1 block text-sm font-medium text-zinc-900">Password</label>
        <input
          type="password"
          {...register("password")}
          className="mb-1 w-full rounded border px-3 py-2 text-zinc-600"
        />
        {errors.password && <p className="mb-3 text-sm text-red-600">{errors.password.message}</p>}
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-zinc-900 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>
        <p className="mt-4 text-sm text-zinc-500">
          No account?{" "}
          <a href="/signup" className="text-zinc-900 underline">
            Sign up
          </a>
        </p>
      </form>
    </div>
  );
}
