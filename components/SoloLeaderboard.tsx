"use client";

import { useEffect, useState } from "react";

interface LeaderboardEntry {
  username: string;
  best_score: number;
  games_played: number;
}

interface SoloLeaderboardProps {
  gameKey: "flappy_solo" | "baby_solo" | "egg_solo";
  title: string;
  limit?: number;
}

export default function SoloLeaderboard({
  gameKey,
  title,
  limit = 5,
}: SoloLeaderboardProps) {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const r = await fetch(
          `/api/leaderboard?game=${encodeURIComponent(gameKey)}&limit=${limit}`,
        );
        const d = await r.json();
        if (active) {
          setData(d.leaderboard || []);
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    }

    load();
    const iv = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [gameKey, limit]);

  return (
    <div className="w-full max-w-205 bg-black/30 border border-white/15 rounded-2xl p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-white font-extrabold text-base">🏆 {title}</h2>
        <a
          href={`/leaderboard?game=${encodeURIComponent(gameKey)}`}
          className="text-xs text-yellow-200/90 hover:text-yellow-100 underline"
        >
          Lihat semua
        </a>
      </div>

      {loading ? (
        <p className="text-sm text-white/70 animate-pulse">
          Memuat peringkat...
        </p>
      ) : data.length === 0 ? (
        <p className="text-sm text-white/70">Belum ada skor untuk mode ini.</p>
      ) : (
        <div className="space-y-2">
          {data.map((entry, i) => (
            <div
              key={`${entry.username}-${i}`}
              className="flex items-center justify-between gap-3 bg-white/10 border border-white/10 rounded-xl px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-yellow-200 font-bold w-6 text-center">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <span className="text-white font-semibold truncate">
                  {entry.username}
                </span>
              </div>
              <div className="text-right shrink-0">
                <div className="text-yellow-200 font-extrabold leading-none">
                  {entry.best_score}
                </div>
                <div className="text-[11px] text-white/60 leading-none mt-1">
                  {entry.games_played} game
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
