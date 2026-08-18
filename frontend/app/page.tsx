"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    }
  }, [isPending, session, router]);

  if (isPending || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">
          Welcome, {session.user.name ?? session.user.email}
        </h1>
        <button
          onClick={async () => {
            await signOut();
            router.push("/login");
          }}
          className="mt-4 rounded bg-zinc-900 px-4 py-2 text-white"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
