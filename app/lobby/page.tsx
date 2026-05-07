"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import type { Socket } from "socket.io-client";

const PIG_COLOR_HEX: Record<string, string> = {
  pink: "#ffc8d8",
  blue: "#a8d4ff",
  purple: "#d0a8ff",
  orange: "#ffd0a0",
  green: "#a8f0c0",
  yellow: "#fff0a0",
  red: "#ffb0a8",
  teal: "#a0e8e0",
  white: "#f4f4f4",
  brown: "#d4b090",
};

const PIG_COLOR_ACCENT: Record<string, string> = {
  pink: "#e8829a",
  blue: "#4a82e8",
  purple: "#9050e8",
  orange: "#e88030",
  green: "#30c870",
  yellow: "#d8c030",
  red: "#e83020",
  teal: "#30a8a0",
  white: "#b0b0b0",
  brown: "#906040",
};

interface User {
  id: number;
  username: string;
  pigColor?: string;
}

interface OnlinePlayer {
  id: string;
  username: string;
  pigColor?: string;
}

interface InviteNotif {
  fromId: string;
  fromUsername: string;
  roomId: string;
  speed?: number;
}

interface LobbyMsg {
  id: string;
  username: string;
  pigColor: string;
  text: string;
  ts: number;
}

export default function LobbyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [pigColor, setPigColorState] = useState("pink");
  const [speed, setSpeed] = useState(3);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  const [invite, setInvite] = useState<InviteNotif | null>(null);
  const [inviteSent, setInviteSent] = useState<Record<string, boolean>>({});

  // Room creation flow
  const [myRoom, setMyRoom] = useState<string | null>(null);
  const [joinId, setJoinId] = useState("");

  // Invite accepted → navigate
  const [pendingRoom, setPendingRoom] = useState<{
    roomId: string;
    speed: number;
  } | null>(null);

  // Lobby chat
  const [lobbyChat, setLobbyChat] = useState<LobbyMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const showChatRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const socketRef = useRef<Socket | null>(null);
  const userRef = useRef<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    showChatRef.current = showChat;
    if (showChat) {
      setUnreadChat(0);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [showChat, lobbyChat]);

  function sendChat() {
    const text = chatInput.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit("lobby_chat_send", { text });
    setChatInput("");
  }

  function changePigColor(newColor: string) {
    setPigColorState(newColor);
    const stored = localStorage.getItem("fp_user");
    if (stored) {
      const u = JSON.parse(stored);
      u.pigColor = newColor;
      localStorage.setItem("fp_user", JSON.stringify(u));
      setUser((prev) => (prev ? { ...prev, pigColor: newColor } : prev));
    }
    const u = userRef.current;
    socketRef.current?.emit("lobby_join", {
      username: u?.username,
      pigColor: newColor,
    });
  }

  // Navigate when invite_go is received (inside React context)
  useEffect(() => {
    if (pendingRoom) {
      socketRef.current?.emit("lobby_leave");
      router.push(
        `/game?mode=multi&room=${pendingRoom.roomId}&speed=${pendingRoom.speed}`,
      );
    }
  }, [pendingRoom, router]);

  useEffect(() => {
    const stored = localStorage.getItem("fp_user");
    if (!stored) {
      router.push("/");
      return;
    }
    const u: User = JSON.parse(stored);
    setUser(u);
    userRef.current = u;
    setPigColorState(u.pigColor || "pink");

    let cancelled = false;
    const externalUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "";
    const socketPath = externalUrl ? "/socket.io" : "/api/socketio";
    const wakeup = externalUrl
      ? Promise.resolve()
      : fetch("/api/socketio").then(() => {});
    wakeup.finally(async () => {
      if (cancelled) return;
      const { io } = await import("socket.io-client");
      const socket = io(externalUrl || undefined, {
        path: socketPath,
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 10,
      });
      socketRef.current = socket;

      function doLobbyJoin() {
        socket.emit("lobby_join", {
          username: u.username,
          pigColor: u.pigColor || "pink",
        });
      }

      socket.on("connect", () => doLobbyJoin());
      // Rejoin lobby after reconnect so the player list stays accurate
      socket.on("reconnect", () => doLobbyJoin());

      socket.on("lobby_players", (players: OnlinePlayer[]) => {
        setOnlinePlayers(players.filter((p) => p.id !== socket.id));
      });
      socket.on("invite_received", (data: InviteNotif) => setInvite(data));
      socket.on(
        "invite_go",
        ({ roomId: rid, speed: spd }: { roomId: string; speed?: number }) => {
          setPendingRoom({ roomId: rid, speed: spd ?? 3 });
        },
      );

      // Lobby chat
      socket.on("lobby_chat_message", (msg: LobbyMsg) => {
        setLobbyChat((prev) => [...prev, msg].slice(-100));
        setUnreadChat((n) => (showChatRef.current ? 0 : n + 1));
      });
      socket.on("lobby_chat_history", (msgs: LobbyMsg[]) => {
        setLobbyChat(msgs.slice(-100));
      });
    });

    return () => {
      cancelled = true;
      socketRef.current?.emit("lobby_leave");
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [router]);

  function playSolo() {
    socketRef.current?.emit("lobby_leave");
    router.push(`/game?mode=solo&speed=${speed}`);
  }

  function playBaby() {
    socketRef.current?.emit("lobby_leave");
    router.push(`/game?mode=baby&speed=${speed}`);
  }

  function createRoom() {
    const id = uuidv4().substring(0, 8).toUpperCase();
    setMyRoom(id);
  }

  function enterRoom() {
    if (!myRoom) return;
    socketRef.current?.emit("lobby_leave");
    router.push(`/game?mode=multi&room=${myRoom}&speed=${speed}`);
  }

  function cancelRoom() {
    setMyRoom(null);
  }

  function joinRoom() {
    if (!joinId.trim()) return;
    socketRef.current?.emit("lobby_leave");
    router.push(`/game?mode=multi&room=${joinId.trim().toUpperCase()}`);
  }

  function invitePlayer(toId: string, _toUsername: string) {
    void _toUsername;
    if (!myRoom) return;
    socketRef.current?.emit("invite_player", { toId, roomId: myRoom, speed });
    setInviteSent((prev) => ({ ...prev, [toId]: true }));
    setTimeout(
      () => setInviteSent((prev) => ({ ...prev, [toId]: false })),
      4000,
    );
  }

  function acceptInvite() {
    if (!invite) return;
    socketRef.current?.emit("invite_accept", {
      roomId: invite.roomId,
      fromId: invite.fromId,
      speed: invite.speed ?? 3,
    });
    setInvite(null);
  }

  function declineInvite() {
    setInvite(null);
  }

  function logout() {
    socketRef.current?.emit("lobby_leave");
    socketRef.current?.disconnect();
    localStorage.removeItem("fp_user");
    router.push("/");
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-pink-400 via-fuchsia-400 to-rose-400 p-4">
      {/* Incoming invite toast */}
      {invite && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white rounded-2xl shadow-2xl p-5 flex flex-col items-center gap-3 w-[90vw] max-w-sm border-2 border-pink-400">
          <div className="text-3xl">🎮</div>
          <p className="font-bold text-gray-800 text-center">
            <span className="text-pink-600">{invite.fromUsername}</span>{" "}
            mengajakmu bermain!
          </p>
          <p className="text-xs text-gray-500 font-mono">
            Room:{" "}
            <span className="font-bold text-gray-700">{invite.roomId}</span>
            {invite.speed && (
              <span className="ml-2 text-yellow-600">
                ⚡ Kecepatan: {invite.speed}
              </span>
            )}
          </p>
          <div className="flex gap-3">
            <button
              onClick={acceptInvite}
              className="px-5 py-2 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl transition active:scale-95"
            >
              ✅ Terima
            </button>
            <button
              onClick={declineInvite}
              className="px-5 py-2 bg-gray-300 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition active:scale-95"
            >
              ❌ Tolak
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 w-full max-w-md">
        {/* Profile card */}
        <div className="bg-white/20 backdrop-blur-md rounded-3xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-12 h-12 rounded-full border-4 border-white/60 flex items-center justify-center text-2xl"
              style={{ backgroundColor: PIG_COLOR_HEX[pigColor] }}
            >
              🐷
            </div>
            <div>
              <p className="text-white font-extrabold text-lg leading-none">
                {user.username}
              </p>
              <p className="text-white/60 text-xs mt-0.5">Online</p>
            </div>
            <button
              onClick={logout}
              className="ml-auto text-white/50 hover:text-white text-xs underline"
            >
              Keluar
            </button>
          </div>

          {/* Color picker */}
          <div className="mb-4">
            <p className="text-white/70 text-xs mb-2">🎨 Warna babi:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PIG_COLOR_HEX).map(([id, hex]) => (
                <button
                  key={id}
                  onClick={() => changePigColor(id)}
                  className="w-7 h-7 rounded-full transition-transform active:scale-90"
                  style={{
                    backgroundColor: hex,
                    border: `3px solid ${pigColor === id ? PIG_COLOR_ACCENT[id] : "transparent"}`,
                    outline: pigColor === id ? "2px solid white" : "none",
                    outlineOffset: "1px",
                  }}
                  title={id}
                />
              ))}
            </div>
          </div>

          {/* Speed slider */}
          <div className="mb-4">
            <p className="text-white/70 text-xs mb-1">
              ⚡ Kecepatan awal:{" "}
              <span className="text-yellow-200 font-bold">{speed}</span>
            </p>
            <input
              type="range"
              min="1"
              max="8"
              step="0.5"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full accent-pink-400"
            />
            <div className="flex justify-between text-white/40 text-xs mt-0.5">
              <span>Pelan</span>
              <span>Cepat</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            <button
              onClick={playSolo}
              className="py-3 bg-linear-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white text-base font-bold rounded-2xl shadow-lg transition active:scale-95"
            >
              🎮 Main Solo
            </button>
            <button
              onClick={playBaby}
              className="py-3 bg-linear-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white text-base font-bold rounded-2xl shadow-lg transition active:scale-95"
            >
              👶 Baby Dino Mode
            </button>

            {!myRoom ? (
              <button
                onClick={createRoom}
                className="py-3 bg-linear-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white text-base font-bold rounded-2xl shadow-lg transition active:scale-95"
              >
                🏠 Buat Room Multiplayer
              </button>
            ) : (
              <div className="bg-white/10 rounded-2xl p-4 border border-white/30">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white font-bold text-sm">
                    🏠 Room kamu aktif
                  </p>
                  <button
                    onClick={cancelRoom}
                    className="text-white/50 hover:text-white text-xs underline"
                  >
                    Batalkan
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-mono bg-white/20 text-yellow-200 font-extrabold px-3 py-1.5 rounded-lg flex-1 text-center text-xl tracking-widest">
                    {myRoom}
                  </span>
                  <button
                    onClick={() =>
                      navigator.clipboard?.writeText(myRoom).catch(() => {})
                    }
                    className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg transition"
                  >
                    Salin
                  </button>
                </div>
                <p className="text-white/60 text-xs mb-3">
                  Undang pemain di bawah atau bagikan kode room.
                </p>
                <button
                  onClick={enterRoom}
                  className="w-full py-2.5 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl transition active:scale-95"
                >
                  ▶️ Masuk ke Room
                </button>
              </div>
            )}

            {/* Join by code */}
            <div className="bg-white/10 rounded-2xl p-3">
              <p className="text-white/80 text-xs font-semibold mb-2">
                🔗 Gabung dengan kode
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Kode room..."
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value.toUpperCase())}
                  maxLength={8}
                  className="flex-1 px-3 py-2 rounded-xl bg-white/80 text-gray-700 font-mono font-bold text-base tracking-widest outline-none focus:ring-2 focus:ring-pink-300"
                />
                <button
                  onClick={joinRoom}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl transition active:scale-95"
                >
                  Join
                </button>
              </div>
            </div>

            <a
              href="/leaderboard"
              className="text-center text-white/60 hover:text-white text-sm underline"
            >
              🏆 Leaderboard
            </a>
          </div>
        </div>

        {/* Online Players */}
        <div className="bg-white/20 backdrop-blur-md rounded-3xl p-5 shadow-2xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse inline-block" />
            <h2 className="text-white font-bold text-base">
              Pemain Online
              <span className="ml-2 bg-white/20 text-yellow-200 text-xs font-bold px-2 py-0.5 rounded-full">
                {onlinePlayers.length}
              </span>
            </h2>
          </div>

          {onlinePlayers.length === 0 ? (
            <p className="text-white/50 text-sm text-center py-4">
              Belum ada pemain lain di lobby...
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              {onlinePlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 transition"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-7 h-7 rounded-full border-2 border-white/60 text-center text-sm leading-6"
                      style={{
                        backgroundColor: PIG_COLOR_HEX[p.pigColor || "pink"],
                      }}
                    >
                      🐷
                    </span>
                    <span className="text-white font-semibold text-sm">
                      {p.username}
                    </span>
                  </div>
                  {myRoom ? (
                    <button
                      onClick={() => invitePlayer(p.id, p.username)}
                      disabled={inviteSent[p.id]}
                      className="px-3 py-1 bg-pink-500 hover:bg-pink-400 disabled:bg-pink-300 text-white text-xs font-bold rounded-lg transition active:scale-95"
                    >
                      {inviteSent[p.id] ? "Terkirim ✓" : "Undang"}
                    </button>
                  ) : (
                    <span className="text-white/30 text-xs">
                      Buat room dulu
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lobby Chat */}
        <div className="bg-white/20 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden">
          <button
            onClick={() =>
              setShowChat((v) => {
                if (!v) setUnreadChat(0);
                return !v;
              })
            }
            className="w-full flex items-center gap-2 px-5 py-4 text-left"
          >
            <span className="text-base font-bold text-white flex-1">
              💬 Chat Lobby
            </span>
            {unreadChat > 0 && !showChat && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadChat > 9 ? "9+" : unreadChat} baru
              </span>
            )}
            <span className="text-white/50 text-sm">
              {showChat ? "▲" : "▼"}
            </span>
          </button>

          {showChat && (
            <>
              {/* Messages */}
              <div className="px-4 pb-2 max-h-52 overflow-y-auto space-y-1.5">
                {lobbyChat.length === 0 ? (
                  <p className="text-white/40 text-xs text-center py-4">
                    Belum ada pesan. Sapa semua orang!
                  </p>
                ) : (
                  lobbyChat.map((msg) => (
                    <div
                      key={msg.id}
                      className="flex items-start gap-1.5 text-sm"
                    >
                      <span
                        className="mt-0.5 shrink-0 inline-block w-2.5 h-2.5 rounded-full border border-white/30"
                        style={{
                          backgroundColor:
                            PIG_COLOR_HEX[msg.pigColor] || "#ffc8d8",
                        }}
                      />
                      <span
                        className="font-bold shrink-0"
                        style={{
                          color:
                            msg.username === user.username ? "#ffd700" : "#fff",
                        }}
                      >
                        {msg.username}:
                      </span>
                      <span className="text-white/90 wrap-break-word min-w-0">
                        {msg.text}
                      </span>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              {/* Input */}
              <div className="flex gap-2 px-4 py-3 border-t border-white/20 bg-black/10">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                  placeholder="Ketik pesan..."
                  maxLength={200}
                  className="flex-1 bg-white/20 text-white placeholder-white/40 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-300 min-w-0"
                />
                <button
                  onClick={sendChat}
                  disabled={!chatInput.trim()}
                  className="px-4 py-2 bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition active:scale-95 shrink-0"
                >
                  Kirim
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
