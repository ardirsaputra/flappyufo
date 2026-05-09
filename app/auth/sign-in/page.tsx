"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await authClient.signIn.email({
      email,
      password,
    });
    if (authError) {
      setError(authError.message || "Login gagal. Coba lagi.");
      setLoading(false);
      return;
    }

    // Fetch profile data for the rest of the app
    const res = await fetch("/api/profile");
    if (res.status === 404) {
      // Neon Auth account exists but no game profile yet
      router.push("/auth/setup-profile");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem(
        "fp_user",
        JSON.stringify({
          id: data.profile.username, // use username as id fallback
          username: data.profile.username,
          pigColor: data.profile.pig_color,
          character: data.profile.character,
          is_admin: data.profile.is_admin,
        }),
      );
    }

    setLoading(false);
    router.push("/lobby");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-pink-400 via-fuchsia-400 to-rose-400 px-4">
      <div className="bg-white/20 backdrop-blur-md rounded-3xl p-8 shadow-2xl w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-6xl mb-2 animate-bounce inline-block">🐷</div>
          <h1 className="text-3xl font-extrabold text-white drop-shadow">
            Ahhhh BABIIII
          </h1>
          <p className="text-white/80 mt-1">Masuk ke akunmu</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-xl px-4 py-3 text-gray-800 bg-white/90 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-400 w-full"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-xl px-4 py-3 text-gray-800 bg-white/90 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-400 w-full"
          />

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
            {loading ? "Masuk..." : "Masuk"}
          </button>
        </form>

        <p className="text-center text-white/80 mt-5 text-sm">
          Belum punya akun?{" "}
          <Link href="/auth/sign-up" className="text-white font-bold underline">
            Daftar
          </Link>
        </p>
      </div>
    </div>
  );
}
