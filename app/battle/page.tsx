"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const BattleGame = dynamic(() => import("@/components/BattleGame"), { ssr: false });

interface User {
  id: number;
  username: string;
  pigColor?: string;
  character?: string;
}

function BattlePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const roomId = searchParams?.get("room") || "";

  useEffect(() => {
    const stored = localStorage.getItem("fp_user");
    if (!stored) { router.push("/"); return; }
    setUser(JSON.parse(stored));
  }, [router]);

  if (!roomId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-center">
          <p className="text-2xl font-bold mb-2">❌ Room tidak ditemukan</p>
          <a href="/lobby" className="text-pink-400 underline">← Kembali ke Lobby</a>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-2xl font-bold animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <BattleGame
      roomId={roomId}
      username={user.username}
      pigColor={user.pigColor || "pink"}
      character={user.character || "pig"}
    />
  );
}

export default function BattlePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <div className="text-white text-2xl font-bold animate-pulse">Loading...</div>
        </div>
      }
    >
      <BattlePageInner />
    </Suspense>
  );
}
