"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const CHARACTERS = [
  { id: "pig", label: "Babi", emoji: "🐷" },
  { id: "dino", label: "Dino", emoji: "🦕" },
  { id: "bear", label: "Beruang", emoji: "🐻" },
  { id: "panda", label: "Panda", emoji: "🐼" },
];

const PIG_COLOR_OPTIONS = [
  { id: "pink", label: "Pink", hex: "#ffc8d8", accent: "#e8829a" },
  { id: "blue", label: "Biru", hex: "#a8d4ff", accent: "#4a82e8" },
  { id: "purple", label: "Ungu", hex: "#d0a8ff", accent: "#9050e8" },
  { id: "orange", label: "Oranye", hex: "#ffd0a0", accent: "#e88030" },
  { id: "green", label: "Hijau", hex: "#a8f0c0", accent: "#30c870" },
  { id: "yellow", label: "Kuning", hex: "#fff0a0", accent: "#d8c030" },
  { id: "red", label: "Merah", hex: "#ffb0a8", accent: "#e83020" },
  { id: "teal", label: "Teal", hex: "#a0e8e0", accent: "#30a8a0" },
  { id: "white", label: "Putih", hex: "#f4f4f4", accent: "#b0b0b0" },
  { id: "brown", label: "Coklat", hex: "#d4b090", accent: "#906040" },
];

export default function AuthPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pigColor, setPigColor] = useState("pink");
  const [character, setCharacter] = useState("pig");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<
    { username: string; best_score: number }[]
  >([]);
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("fp_user")) {
      router.push("/lobby");
    }
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setLeaderboard((d.leaderboard ?? []).slice(0, 5)))
      .catch(() => {});
  }, [router]);

  const selectedColor = PIG_COLOR_OPTIONS.find((c) => c.id === pigColor)!;
  const selectedChar = CHARACTERS.find((c) => c.id === character)!;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (tab === "register") {
      if (password !== confirmPassword) {
        setError("Password tidak cocok");
        return;
      }
    }

    setLoading(true);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: tab, username, password }),
    });
    const data = await res.json();
    setLoading(false);

    if (data.error) {
      setError(data.error);
      return;
    }

    localStorage.setItem(
      "fp_user",
      JSON.stringify({
        ...data.user,
        pigColor: data.user.pig_color || pigColor,
        character: data.user.character || character,
      }),
    );
    router.push("/lobby");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-linear-to-br from-[#8f6c2f] via-[#C4955A] to-[#8B5E3C] px-4 py-6">
      <div className="bg-white/15 backdrop-blur-md rounded-2xl p-5 shadow-2xl w-full max-w-xs border border-white/10">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="text-5xl mb-1 animate-bounce inline-block">
            {selectedChar.emoji}
          </div>
          <h1 className="text-xl font-extrabold text-white drop-shadow">
            Flappy Piggies
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-black/20 rounded-xl p-0.5 mb-4">
          <button
            onClick={() => {
              setTab("login");
              setError("");
            }}
            className={`flex-1 py-1.5 rounded-lg font-bold text-sm transition ${
              tab === "login"
                ? "bg-white text-pink-600 shadow"
                : "text-white/60 hover:text-white"
            }`}
          >
            Masuk
          </button>
          <button
            onClick={() => {
              setTab("register");
              setError("");
            }}
            className={`flex-1 py-1.5 rounded-lg font-bold text-sm transition ${
              tab === "register"
                ? "bg-white text-pink-600 shadow"
                : "text-white/60 hover:text-white"
            }`}
          >
            Daftar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          {/* Username */}
          <input
            type="text"
            placeholder="Username..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            className="px-3 py-2.5 rounded-xl text-sm font-semibold outline-none bg-white/85 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-pink-300"
          />

          {/* Password */}
          <input
            type="password"
            placeholder="Password (min. 4 karakter)..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={64}
            className="px-3 py-2.5 rounded-xl text-sm font-semibold outline-none bg-white/85 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-pink-300"
          />

          {/* Confirm password (register only) */}
          {tab === "register" && (
            <input
              type="password"
              placeholder="Konfirmasi password..."
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              maxLength={64}
              className="px-3 py-2.5 rounded-xl text-sm font-semibold outline-none bg-white/85 text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-pink-300"
            />
          )}

          {/* Character picker (register only) */}
          {tab === "register" && (
            <div>
              <p className="text-white/80 font-semibold mb-1.5 text-xs">
                🎮 Karakter:{" "}
                <span className="text-yellow-200">
                  {selectedChar.emoji} {selectedChar.label}
                </span>
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {CHARACTERS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCharacter(c.id)}
                    className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-xl transition active:scale-90 ${
                      character === c.id
                        ? "bg-white/40 ring-2 ring-white"
                        : "bg-white/10 hover:bg-white/20"
                    }`}
                  >
                    <span>{c.emoji}</span>
                    <span className="text-white text-[10px] font-bold mt-0.5">
                      {c.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color picker (register only) */}
          {tab === "register" && (
            <div>
              <p className="text-white/80 font-semibold mb-1.5 text-xs">
                🎨 Warna:{" "}
                <span className="text-yellow-200">{selectedColor.label}</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PIG_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPigColor(c.id)}
                    className="w-7 h-7 rounded-full transition-transform active:scale-90"
                    style={{
                      backgroundColor: c.hex,
                      border: `3px solid ${pigColor === c.id ? c.accent : "transparent"}`,
                      outline: pigColor === c.id ? "2px solid white" : "none",
                      outlineOffset: "1px",
                    }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-200 text-xs font-semibold text-center bg-red-500/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="py-2.5 bg-pink-500 hover:bg-pink-400 active:scale-95 text-white text-sm font-bold rounded-xl shadow-lg transition disabled:opacity-60 mt-0.5"
          >
            {loading
              ? "Loading..."
              : tab === "login"
                ? "Masuk 🚀"
                : "Daftar & Main! 🎮"}
          </button>
        </form>

        <div className="mt-3 flex items-center justify-center gap-3 text-xs">
          <a
            href="/leaderboard"
            className="text-white/50 hover:text-white transition"
          >
            🏆 Leaderboard
          </a>
          <span className="text-white/20">·</span>
          <a
            href="/discussion"
            className="text-white/50 hover:text-white transition"
          >
            💬 Diskusi
          </a>
        </div>
      </div>

      {/* Mini leaderboard */}
      {leaderboard.length > 0 && (
        <div className="bg-white/15 backdrop-blur-md rounded-2xl p-4 shadow-xl w-full max-w-xs border border-white/10">
          <h2 className="text-white font-bold text-sm mb-2 text-center">
            🏆 Top Pemain
          </h2>
          <div className="flex flex-col gap-1">
            {leaderboard.map((entry, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-1.5"
              >
                <span className="text-white text-xs font-semibold">
                  {i === 0
                    ? "🥇"
                    : i === 1
                      ? "🥈"
                      : i === 2
                        ? "🥉"
                        : `#${i + 1}`}{" "}
                  {entry.username}
                </span>
                <span className="text-yellow-200 text-xs font-bold">
                  {entry.best_score}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-center">
            <a
              href="/leaderboard"
              className="text-white/40 hover:text-white text-xs"
            >
              Lihat semua →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
