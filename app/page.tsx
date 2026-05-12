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
  const [leaderboard, setLeaderboard] = useState<{ username: string; best_score: number }[]>([]);
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
      body: JSON.stringify({ action: tab, username, password, character, pigColor }),
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
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-950 px-4 py-8 relative overflow-hidden font-sans">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-pink-600/20 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[70vw] h-[70vw] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />
      <div className="absolute top-[20%] left-[30%] w-[50vw] h-[50vw] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none mix-blend-screen" />
      
      <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 shadow-2xl w-full max-w-sm relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3 animate-bounce inline-block drop-shadow-2xl">
            {selectedChar.emoji}
          </div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-linear-to-r from-pink-400 to-yellow-300 drop-shadow-lg">
            Flappy Piggies
          </h1>
          <p className="text-white/60 text-xs mt-1.5 font-bold uppercase tracking-widest">
            Mulai Petualanganmu
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 bg-white/5 p-1.5 rounded-2xl mb-6 border border-white/10">
          <button
            onClick={() => { setTab("login"); setError(""); }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${
              tab === "login" ? "bg-pink-500 text-white shadow-lg scale-[1.02]" : "text-white/50 hover:text-white/80"
            }`}
          >
            Masuk
          </button>
          <button
            onClick={() => { setTab("register"); setError(""); }}
            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${
              tab === "register" ? "bg-pink-500 text-white shadow-lg scale-[1.02]" : "text-white/50 hover:text-white/80"
            }`}
          >
            Daftar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Username */}
          <input
            type="text"
            placeholder="Username..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            className="px-4 py-3.5 rounded-xl text-sm font-bold outline-none bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-pink-500 focus:bg-white/10 transition-all"
          />

          {/* Password */}
          <input
            type="password"
            placeholder="Password (min. 4 karakter)..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={64}
            className="px-4 py-3.5 rounded-xl text-sm font-bold outline-none bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-pink-500 focus:bg-white/10 transition-all"
          />

          {/* Confirm password (register only) */}
          {tab === "register" && (
            <input
              type="password"
              placeholder="Konfirmasi password..."
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              maxLength={64}
              className="px-4 py-3.5 rounded-xl text-sm font-bold outline-none bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-pink-500 focus:bg-white/10 transition-all"
            />
          )}

          {/* Character picker (register only) */}
          {tab === "register" && (
            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
              <p className="text-white/80 font-bold mb-3 text-[11px] uppercase tracking-wider">
                🎮 Pilih Karakter:{" "}
                <span className="text-pink-300 ml-1">{selectedChar.emoji} {selectedChar.label}</span>
              </p>
              <div className="grid grid-cols-4 gap-2">
                {CHARACTERS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCharacter(c.id)}
                    className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-2xl transition-all duration-300 active:scale-90 ${
                      character === c.id
                        ? "bg-white/20 ring-1 ring-white/50 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                        : "bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span>{c.emoji}</span>
                    <span className="text-white/90 text-[10px] font-bold mt-1.5 uppercase">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color picker (register only) */}
          {tab === "register" && (
            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
              <p className="text-white/80 font-bold mb-3 text-[11px] uppercase tracking-wider">
                🎨 Warna Kulit:{" "}
                <span className="text-pink-300 ml-1">{selectedColor.label}</span>
              </p>
              <div className="grid grid-cols-5 gap-3">
                {PIG_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPigColor(c.id)}
                    className="h-8 rounded-full transition-all duration-300 active:scale-90"
                    style={{
                      backgroundColor: c.hex,
                      border: `2px solid ${pigColor === c.id ? "#fff" : "transparent"}`,
                      boxShadow: pigColor === c.id ? `0 0 12px ${c.hex}` : "none",
                      transform: pigColor === c.id ? "scale(1.15)" : "scale(1)",
                    }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-200 text-sm font-semibold text-center bg-red-500/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="py-3.5 mt-2 bg-linear-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 active:scale-95 text-white text-sm font-black uppercase tracking-widest rounded-xl shadow-[0_0_20px_rgba(236,72,153,0.3)] transition-all disabled:opacity-50"
          >
            {loading ? "Loading..." : tab === "login" ? "Masuk ke Game 🚀" : "Daftar & Main! 🎮"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <a href="/leaderboard" className="text-white/70 hover:text-white text-sm underline">
            🏆 Lihat Leaderboard
          </a>
        </div>
      </div>

      {/* Mini leaderboard */}
      {leaderboard.length > 0 && (
        <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-6 shadow-2xl w-full max-w-sm relative z-10">
          <h2 className="text-white font-black text-sm mb-4 text-center tracking-widest uppercase">🏆 Top Pemain</h2>
          <div className="flex flex-col gap-2">
            {leaderboard.map((entry, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 hover:bg-white/10 transition-colors rounded-xl px-4 py-2.5 border border-white/5">
                <span className="text-white font-bold text-sm">
                  <span className="mr-3 text-lg">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `\u200A\u200A\u200A\u200A\u200A${i + 1}`}</span>
                  {entry.username}
                </span>
                <span className="text-yellow-300 font-black">{entry.best_score}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 text-center">
            <a href="/leaderboard" className="text-white/50 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-colors">
              Lihat Papan Peringkat Penuh →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
