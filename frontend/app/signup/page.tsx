"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signUp, signupSchema, type SignupFormValues } from "@/lib/auth";
import AuthFrame from "@/components/AuthFrame";
import Button from "@/app/ui/Button";
import Input from "@/app/ui/Input";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  });

  async function onSubmit(values: SignupFormValues) {
    setError(null);
    setLoading(true);

    // better-auth React client — sends POST /api/auth/sign-up/email -> Creates the user account + auto-logs them in (returns a session)
    const { error } = await signUp.email(values);
    setLoading(false);

    if (error) {
      setError(error.message ?? "Sign-up failed");
      return;
    }

    // Success: navigate to chat and refresh to pick up the session cookie
    router.push("/chat");
    router.refresh();
  }

  return (
    <AuthFrame>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <p className="text-sm font-medium text-zinc-300">DevDocs Copilot</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight text-white">Create account</h1>
        <p className="mt-1 mb-6 text-sm text-zinc-400">Start asking questions from your docs.</p>

        <Input
          label="Name"
          type="text"
          placeholder="Your name"
          autoComplete="name"
          error={errors.name?.message}
          {...register("name")}
        />
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <Input
          label="Password"
          type={showPassword ? "text" : "password"}
          placeholder="••••••••"
          autoComplete="new-password"
          error={errors.password?.message}
          endAdornment={
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="text-xs font-medium text-zinc-400 hover:text-zinc-100"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          }
          {...register("password")}
        />

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <Button type="submit" loading={loading} className="w-full">
          {loading ? "Creating…" : "Sign up"}
        </Button>

        <p className="mt-4 text-center text-sm text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="text-fuchsia-400 hover:text-fuchsia-300 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}
