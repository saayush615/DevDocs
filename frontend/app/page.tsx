"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  // Wait until session check completes before redirecting
  useEffect(() => {
    if (isPending) return;
    if (session) {
      router.push("/chat");
    } else {
      router.push("/login");
    }
  }, [isPending, session, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
    </div>
  );
}
