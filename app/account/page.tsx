"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const CHAR_EMOJI: Record<string, string> = {
  pig: "🐷", dino: "🦕", bear: "🐻", panda: "🐼",
};

interface User {
  id: number;
  username: string;
  pigColor?: string;
  character?: string;
}

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<"password" | "delete">("password");

  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const [deletePwd, setDeletePwd] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("fp_user");
    if (!stored) { router.push("/"); return; }
    setUser(JSON.parse(stored));
  }, [router]);

  function clearMsg() { setMsg(null); }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    clearMsg();
    if (newPwd !== confirmPwd) { setMsg({ ok: false, text: "Password baru tidak cocok" }); return; }
    if (newPwd.trim().length < 4) { setMsg({ ok: false, text: "Password baru minimal 4 karakter" }); return; }
    setLoading(true);
    const res = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "change_password", userId: user?.id, oldPassword: oldPwd, newPassword: newPwd.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.error) { setMsg({ ok: false, text: data.error }); return; }
    setMsg({ ok: true, text: "Password berhasil diubah!" });
    setOldPwd(""); setNewPwd(""); setConfirmPwd("");
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    clearMsg();
    if (deleteConfirm !== user?.username) {
      setMsg({ ok: false, text: `Ketik username "${user?.username}" dengan tepat` });
      return;
    }
    setLoading(true);
    const res = await fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_account", userId: user?.id, password: deletePwd }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.error) { setMsg({ ok: false, text: data.error }); return; }
    localStorage.removeItem("fp_user");
    router.push("/");
  }

  if (!user) return null;

  const charEmoji = CHAR_EMOJI[user.character || "pig"] ?? "🐷";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-pink-400 via-fuchsia-400 to-rose-400 px-4 py-8">
      <div className="bg-white/20 backdrop-blur-md rounded-3xl p-7 shadow-2xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center gap-2 mb-5">
          <a href="/lobby" className="text-white/70 hover:text-white text-sm underline shrink-0">
            ← Lobby
          </a>
          <h1 className="text-white font-extrabold text-lg flex-1 text-center">⚙️ Kelola Akun</h1>
        </div>

        {/* Profile summary */}
        <div className="flex items-center gap-3 bg-white/10 rounded-2xl p-4 mb-5">
          <span className="text-4xl">{charEmoji}</span>
          <div>
            <p className="text-white font-bold text-base leading-none">{user.username}</p>
            <p className="text-white/50 text-xs mt-1">ID #{user.id}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-black/20 rounded-2xl p-1 mb-5">
          <button
            onClick={() => { setTab("password"); clearMsg(); }}
            className={`flex-1 py-2 rounded-xl font-bold text-sm transition ${tab === "password" ? "bg-white text-pink-600 shadow" : "text-white/70 hover:text-white"}`}
          >
            🔑 Ubah Password
          </button>
          <button
            onClick={() => { setTab("delete"); clearMsg(); }}
            className={`flex-1 py-2 rounded-xl font-bold text-sm transition ${tab === "delete" ? "bg-red-500 text-white shadow" : "text-white/70 hover:text-white"}`}
          >
            🗑️ Hapus Akun
          </button>
        </div>

        {/* Message */}
        {msg && (
          <div className={`rounded-xl px-4 py-2.5 mb-4 text-sm font-semibold text-center ${msg.ok ? "bg-green-500/30 text-green-100" : "bg-red-500/30 text-red-100"}`}>
            {msg.text}
          </div>
        )}

        {tab === "password" ? (
          <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
            <input
              type="password" placeholder="Password lama..." value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white/80 text-gray-700 font-semibold outline-none focus:ring-4 focus:ring-pink-300"
            />
            <input
              type="password" placeholder="Password baru (min. 4 karakter)..." value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white/80 text-gray-700 font-semibold outline-none focus:ring-4 focus:ring-pink-300"
            />
            <input
              type="password" placeholder="Konfirmasi password baru..." value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white/80 text-gray-700 font-semibold outline-none focus:ring-4 focus:ring-pink-300"
            />
            <button
              type="submit" disabled={loading}
              className="py-3 bg-pink-500 hover:bg-pink-400 text-white font-bold rounded-xl transition active:scale-95 disabled:opacity-60"
            >
              {loading ? "Menyimpan..." : "Simpan Password"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleDelete} className="flex flex-col gap-3">
            <div className="bg-red-500/20 rounded-xl p-3 text-red-100 text-sm leading-relaxed">
              ⚠️ Aksi ini <strong>tidak dapat dibatalkan</strong>. Semua data termasuk skor akan dihapus permanen.
            </div>
            <input
              type="password" placeholder="Password akun..." value={deletePwd}
              onChange={(e) => setDeletePwd(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white/80 text-gray-700 font-semibold outline-none focus:ring-4 focus:ring-red-300"
            />
            <input
              type="text"
              placeholder={`Ketik "${user.username}" untuk konfirmasi`}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="px-4 py-3 rounded-xl bg-white/80 text-gray-700 font-semibold outline-none focus:ring-4 focus:ring-red-300"
            />
            <button
              type="submit"
              disabled={loading || deleteConfirm !== user.username}
              className="py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl transition active:scale-95 disabled:opacity-50"
            >
              {loading ? "Menghapus..." : "Hapus Akun Permanen"}
            </button>
          </form>
        )}

        {/* Footer links */}
        <div className="mt-6 pt-4 border-t border-white/20 flex justify-center gap-4 text-xs">
          <a href="/terms" className="text-white/60 hover:text-white underline">Kebijakan Penggunaan</a>
          <a href="/privacy" className="text-white/60 hover:text-white underline">Kebijakan Privasi</a>
        </div>
      </div>
    </div>
  );
}
