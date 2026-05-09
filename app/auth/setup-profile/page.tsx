"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const CHARACTERS = [
  { id: "pig", label: "Babi", emoji: "🐷" },
  { id: "dino", label: "Dino", emoji: "🦕" },
  { id: "bear", label: "Beruang", emoji: "🐻" },
  { id: "panda", label: "Panda", emoji: "🐼" },
];

const PIG_COLOR_OPTIONS = [
  { id: "pink", label: "Pink", hex: "#ffc8d8" },
  { id: "blue", label: "Biru", hex: "#a8d4ff" },
  { id: "purple", label: "Ungu", hex: "#d0a8ff" },
  { id: "orange", label: "Oranye", hex: "#ffd0a0" },
  { id: "green", label: "Hijau", hex: "#a8f0c0" },
  { id: "yellow", label: "Kuning", hex: "#fff0a0" },
  { id: "red", label: "Merah", hex: "#ffb0a8" },
  { id: "teal", label: "Teal", hex: "#a0e8e0" },
];

export default function SetupProfilePage() {
  const [username, setUsername] = useState("");
  const [character, setCharacter] = useState("pig");
  const [pigColor, setPigColor] = useState("pink");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const selectedChar = CHARACTERS.find((c) => c.id === character)!;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const cleanUsername = username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    if (!cleanUsername || cleanUsername.length < 2) {
      setError("Username minimal 2 karakter (huruf kecil, angka, underscore)");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        username: cleanUsername,
        character,
        pigColor,
      }),
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
        id: data.profile.username,
        username: data.profile.username,
        pigColor: data.profile.pig_color,
        character: data.profile.character,
        is_admin: data.profile.is_admin,
      }),
    );
    router.push("/lobby");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-pink-400 via-fuchsia-400 to-rose-400 px-4 py-8">
      <div className="bg-white/20 backdrop-blur-md rounded-3xl p-8 shadow-2xl w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-6xl mb-2 animate-bounce inline-block">
            {selectedChar.emoji}
          </div>
          <h1 className="text-3xl font-extrabold text-white drop-shadow">
            Setup Profil
          </h1>
          <p className="text-white/80 mt-1">Pilih username & karakter</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Username (tampil di game)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            maxLength={32}
            className="rounded-xl px-4 py-3 text-gray-800 bg-white/90 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-400 w-full"
          />

          <div>
            <p className="text-white font-semibold mb-2 text-sm">
              Pilih Karakter
            </p>
            <div className="grid grid-cols-4 gap-2">
              {CHARACTERS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCharacter(c.id)}
                  className={`rounded-xl py-2 text-2xl transition-all ${
                    character === c.id
                      ? "bg-white shadow-lg scale-110"
                      : "bg-white/30 hover:bg-white/50"
                  }`}
                  title={c.label}
                >
                  {c.emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-white font-semibold mb-2 text-sm">
              Warna Karakter
            </p>
            <div className="grid grid-cols-4 gap-2">
              {PIG_COLOR_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPigColor(c.id)}
                  style={{ backgroundColor: c.hex }}
                  className={`rounded-xl h-9 transition-all border-2 ${
                    pigColor === c.id
                      ? "border-white scale-110 shadow-lg"
                      : "border-transparent"
                  }`}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-red-100 bg-red-500/40 rounded-xl px-4 py-2 text-sm text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-pink-500 hover:bg-pink-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
          >
            {loading ? "Menyimpan..." : "Mulai Main!"}
          </button>
        </form>
      </div>
    </div>
  );
}
