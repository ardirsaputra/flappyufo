"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: number;
  username: string;
  character: string;
  pig_color: string;
  is_admin: boolean;
  last_device_id: string | null;
  last_ip: string | null;
  created_at: string;
}

interface BlockedDevice {
  id: number;
  device_id: string | null;
  ip: string | null;
  reason: string | null;
  blocked_by: string | null;
  created_at: string;
}

interface AdminUser {
  id: number;
  username: string;
  is_admin?: boolean;
}

const CHAR_EMOJI: Record<string, string> = {
  pig: "🐷", dino: "🦕", bear: "🐻", panda: "🐼",
};

export default function AdminPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [tab, setTab] = useState<"users" | "blocked">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [blocked, setBlocked] = useState<BlockedDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("fp_user");
    if (!stored) { router.push("/"); return; }
    const u = JSON.parse(stored) as AdminUser;
    if (!u.is_admin) { router.push("/lobby"); return; }
    setAdmin(u);
  }, [router]);

  const fetchUsers = useCallback(async () => {
    if (!admin) return;
    setLoading(true);
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list_users", adminId: admin.id }),
    });
    const d = await r.json();
    setLoading(false);
    if (d.users) setUsers(d.users);
  }, [admin]);

  const fetchBlocked = useCallback(async () => {
    if (!admin) return;
    setLoading(true);
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list_blocked", adminId: admin.id }),
    });
    const d = await r.json();
    setLoading(false);
    if (d.blocked) setBlocked(d.blocked);
  }, [admin]);

  useEffect(() => {
    if (!admin) return;
    if (tab === "users") fetchUsers();
    else fetchBlocked();
  }, [admin, tab, fetchUsers, fetchBlocked]);

  async function deleteUser(u: User) {
    if (!admin) return;
    setLoading(true);
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_user", adminId: admin.id, targetId: u.id }),
    });
    const d = await r.json();
    setLoading(false);
    setConfirmDelete(null);
    if (d.error) { setMsg({ ok: false, text: d.error }); return; }
    setMsg({ ok: true, text: `Akun "${u.username}" dihapus.` });
    fetchUsers();
  }

  async function blockDevice(u: User) {
    if (!admin) return;
    if (!u.last_device_id) {
      setMsg({ ok: false, text: "Pengguna ini belum memiliki device ID." });
      return;
    }
    setLoading(true);
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "block_device",
        adminId: admin.id,
        deviceId: u.last_device_id,
        ip: u.last_ip,
        targetUsername: u.username,
      }),
    });
    const d = await r.json();
    setLoading(false);
    if (d.error) { setMsg({ ok: false, text: d.error }); return; }
    setMsg({ ok: true, text: `Perangkat "${u.username}" diblokir.` });
  }

  async function unblock(id: number) {
    if (!admin) return;
    setLoading(true);
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unblock_device", adminId: admin.id, blockId: id }),
    });
    const d = await r.json();
    setLoading(false);
    if (d.error) { setMsg({ ok: false, text: d.error }); return; }
    setMsg({ ok: true, text: "Blokir dihapus." });
    fetchBlocked();
  }

  if (!admin) return null;

  return (
    <div className="min-h-screen bg-linear-to-br from-pink-400 via-fuchsia-400 to-rose-400 px-4 py-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <a href="/lobby" className="text-white/70 hover:text-white text-sm underline">← Lobby</a>
          <h1 className="text-white font-extrabold text-2xl flex-1 text-center">🛡️ Admin Panel</h1>
          <span className="text-white/50 text-xs">{admin.username}</span>
        </div>

        {/* Message */}
        {msg && (
          <div
            className={`rounded-2xl px-4 py-3 mb-4 text-sm font-semibold text-center cursor-pointer ${msg.ok ? "bg-green-500/30 text-green-100" : "bg-red-500/30 text-red-100"}`}
            onClick={() => setMsg(null)}
          >
            {msg.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-black/20 rounded-2xl p-1 mb-5">
          <button
            onClick={() => setTab("users")}
            className={`flex-1 py-2 rounded-xl font-bold text-sm transition ${tab === "users" ? "bg-white text-pink-600 shadow" : "text-white/70 hover:text-white"}`}
          >
            👥 Pengguna
          </button>
          <button
            onClick={() => setTab("blocked")}
            className={`flex-1 py-2 rounded-xl font-bold text-sm transition ${tab === "blocked" ? "bg-red-500 text-white shadow" : "text-white/70 hover:text-white"}`}
          >
            🚫 Perangkat Diblokir
          </button>
        </div>

        {loading && (
          <div className="text-center text-white/60 text-sm py-4 animate-pulse">Memuat...</div>
        )}

        {/* Users tab */}
        {tab === "users" && !loading && (
          <div className="flex flex-col gap-2">
            {users.length === 0 && (
              <p className="text-white/50 text-center text-sm py-6">Tidak ada pengguna.</p>
            )}
            {users.map((u) => (
              <div key={u.id} className="bg-white/20 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl shrink-0">{CHAR_EMOJI[u.character] ?? "🐷"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-bold text-sm">{u.username}</span>
                    {u.is_admin && (
                      <span className="bg-yellow-400 text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full">ADMIN</span>
                    )}
                  </div>
                  <p className="text-white/50 text-xs">
                    ID #{u.id} · {new Date(u.created_at).toLocaleDateString("id-ID")}
                  </p>
                  {u.last_device_id && (
                    <p className="text-white/40 text-xs font-mono truncate">
                      📱 {u.last_device_id.slice(0, 16)}…
                    </p>
                  )}
                </div>
                {!u.is_admin && (
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => blockDevice(u)}
                      disabled={!u.last_device_id || loading}
                      className="px-3 py-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition active:scale-95"
                      title={u.last_device_id ? "Blokir perangkat" : "Belum ada device ID"}
                    >
                      🚫 Blokir
                    </button>
                    <button
                      onClick={() => setConfirmDelete(u)}
                      disabled={loading}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition active:scale-95"
                    >
                      🗑️ Hapus
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Blocked devices tab */}
        {tab === "blocked" && !loading && (
          <div className="flex flex-col gap-2">
            {blocked.length === 0 && (
              <p className="text-white/50 text-center text-sm py-6">Belum ada perangkat yang diblokir.</p>
            )}
            {blocked.map((b) => (
              <div key={b.id} className="bg-white/20 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl shrink-0">🚫</span>
                <div className="flex-1 min-w-0">
                  {b.device_id && (
                    <p className="text-white font-mono text-xs truncate">📱 {b.device_id}</p>
                  )}
                  {b.ip && (
                    <p className="text-white/70 text-xs">🌐 {b.ip}</p>
                  )}
                  <p className="text-white/50 text-xs">
                    {b.reason || "Tidak ada alasan"} · oleh {b.blocked_by || "admin"}
                  </p>
                  <p className="text-white/40 text-xs">
                    {new Date(b.created_at).toLocaleDateString("id-ID")}
                  </p>
                </div>
                <button
                  onClick={() => unblock(b.id)}
                  disabled={loading}
                  className="px-3 py-1.5 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition active:scale-95 shrink-0"
                >
                  ✅ Buka Blokir
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-xs w-full flex flex-col items-center gap-4 text-center">
            <div className="text-4xl">⚠️</div>
            <p className="font-extrabold text-gray-800">Hapus Akun?</p>
            <p className="text-gray-600 text-sm">
              Akun <strong>{confirmDelete.username}</strong> dan semua datanya akan dihapus permanen.
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl transition"
              >
                Batal
              </button>
              <button
                onClick={() => deleteUser(confirmDelete)}
                className="flex-1 py-2 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl transition"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
