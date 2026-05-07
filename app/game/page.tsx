"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Suspense } from "react";

const Game = dynamic(() => import("@/components/Game"), { ssr: false });

interface User {
  id: number;
  username: string;
  pigColor?: string;
  character?: string;
}

function GamePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const mode = searchParams?.get("mode") || "solo";
  const roomId = searchParams?.get("room") || "solo-room";
  const initialSpeed = parseFloat(searchParams?.get("speed") || "3");

  useEffect(() => {
    const stored = localStorage.getItem("fp_user");
    if (!stored) {
      router.push("/");
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  if (!user)
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-pink-400 to-rose-400">
        <div className="text-white text-2xl font-bold animate-pulse">
          Loading...
        </div>
      </div>
    );

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-linear-to-br from-pink-400 via-fuchsia-400 to-rose-400 pt-2 pb-4 px-2">
      <div className="mb-2 flex items-center gap-3 w-full max-w-[800px]">
        <a
          href="/lobby"
          className="text-white/70 hover:text-white text-sm underline shrink-0"
        >
          ← Lobby
        </a>
        <span className="text-white font-bold text-base flex-1 text-center truncate">🐷 Ahhhh BABIIII</span>
        {mode === "multi" && (
          <span className="bg-white/20 text-yellow-200 text-xs font-mono font-bold px-2 py-1 rounded-full shrink-0 max-w-[100px] truncate">
            {roomId}
          </span>
        )}
        <a
          href="/leaderboard"
          className="text-white/70 hover:text-white text-sm underline shrink-0"
        >
          🏆
        </a>
      </div>
      <Game
        username={user.username}
        userId={user.id}
        roomId={roomId}
        solo={mode === "solo" || mode === "baby"}
        dinoMode={mode === "baby" || mode === "multi-dino"}
        pigColor={user.pigColor || "pink"}
        character={user.character || "pig"}
        initialSpeed={initialSpeed}
      />
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-pink-400 to-rose-400">
          <div className="text-white text-2xl font-bold animate-pulse">
            Loading...
          </div>
        </div>
      }
    >
      <GamePageInner />
    </Suspense>
  );
}
