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

const CHARACTERS = [
  { id: "pig",   label: "Babi",     emoji: "🐷" },
  { id: "dino",  label: "Dino",     emoji: "🦕" },
  { id: "bear",  label: "Beruang",  emoji: "🐻" },
  { id: "panda", label: "Panda",    emoji: "🐼" },
];

interface User {
  id: number;
  username: string;
  pigColor?: string;
  character?: string;
}

interface OnlinePlayer {
  id: string;
  username: string;
  pigColor?: string;
  character?: string;
}

interface InviteNotif {
  fromId: string;
  fromUsername: string;
  roomId: string;
  speed?: number;
  gameMode?: "flappy" | "dino";
}

interface LobbyMsg {
  id: string;
  username: string;
  pigColor: string;
  text: string;
  ts: number;
}

interface RoomItem {
  id: string;
  host: string;
  playerCount: number;
  gameMode: string;
  speed: number;
  hasPassword: boolean;
  started: boolean;
}

export default function LobbyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [pigColor, setPigColorState] = useState("pink");
  const [character, setCharacterState] = useState("pig");
  const [speed, setSpeed] = useState(3);
  const [gameMode, setGameMode] = useState<"flappy" | "dino">("flappy");
  const [joinGameMode, setJoinGameMode] = useState<"flappy" | "dino">("flappy");
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  const [invite, setInvite] = useState<InviteNotif | null>(null);
  const [inviteSent, setInviteSent] = useState<Record<string, boolean>>({});
  const [pokeNotif, setPokeNotif] = useState<string | null>(null);
  const [pokeSent, setPokeSent] = useState<Record<string, boolean>>({});
  const [sessionKicked, setSessionKicked] = useState(false);

  // Room creation flow
  const [myRoom, setMyRoom] = useState<string | null>(null);
  const [joinId, setJoinId] = useState("");

  // Battle room
  const [battleRoom, setBattleRoom] = useState<string | null>(null);
  const [joinBattleId, setJoinBattleId] = useState("");

  // Room list
  const [roomList, setRoomList] = useState<RoomItem[]>([]);

  // Password for creating a room
  const [createPasswordEnabled, setCreatePasswordEnabled] = useState(false);
  const [createPassword, setCreatePassword] = useState("");

  // Password for joining by code
  const [joinPassword, setJoinPassword] = useState("");

  // Join from room list: null = no pending, otherwise the room clicked
  const [pendingJoinRoom, setPendingJoinRoom] = useState<RoomItem | null>(null);
  const [listJoinPassword, setListJoinPassword] = useState("");

  // Invite accepted → navigate
  const [pendingRoom, setPendingRoom] = useState<{
    roomId: string;
    speed: number;
    gameMode: string;
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
      character,
    });
  }

  function changeCharacter(newChar: string) {
    setCharacterState(newChar);
    const stored = localStorage.getItem("fp_user");
    if (stored) {
      const u = JSON.parse(stored);
      u.character = newChar;
      localStorage.setItem("fp_user", JSON.stringify(u));
      setUser((prev) => (prev ? { ...prev, character: newChar } : prev));
    }
    const u = userRef.current;
    socketRef.current?.emit("lobby_join", {
      username: u?.username,
      pigColor,
      character: newChar,
    });
  }

  // Navigate when invite_go is received (inside React context)
  useEffect(() => {
    if (pendingRoom) {
      socketRef.current?.emit("lobby_leave");
      const modeParam =
        pendingRoom.gameMode === "dino" ? "multi-dino" : "multi";
      router.push(
        `/game?mode=${modeParam}&room=${pendingRoom.roomId}&speed=${pendingRoom.speed}`,
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
    setCharacterState(u.character || "pig");

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
          character: u.character || "pig",
        });
      }

      socket.on("connect", () => doLobbyJoin());
      // Rejoin lobby after reconnect so the player list stays accurate
      socket.on("reconnect", () => doLobbyJoin());

      socket.on("lobby_players", (players: OnlinePlayer[]) => {
        setOnlinePlayers(players.filter((p) => p.id !== socket.id));
      });
      socket.on("invite_received", (data: InviteNotif) => setInvite(data));
      socket.on("poke_received", ({ fromUsername }: { fromUsername: string }) => {
        setPokeNotif(`👉 ${fromUsername} mencolek kamu!`);
        setTimeout(() => setPokeNotif(null), 4000);
      });
      socket.on("session_kicked", () => {
        setSessionKicked(true);
        socket.disconnect();
        setTimeout(() => {
          localStorage.removeItem("fp_user");
          window.location.href = "/";
        }, 3000);
      });
      socket.on(
        "invite_go",
        ({
          roomId: rid,
          speed: spd,
          gameMode: gm,
        }: {
          roomId: string;
          speed?: number;
          gameMode?: string;
        }) => {
          setPendingRoom({
            roomId: rid,
            speed: spd ?? 3,
            gameMode: gm || "flappy",
          });
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
      socket.on("room_list", (list: RoomItem[]) => {
        setRoomList(list);
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
    const modeParam = gameMode === "dino" ? "multi-dino" : "multi";
    const pw = createPasswordEnabled && createPassword
      ? `&pw=${encodeURIComponent(createPassword)}`
      : "";
    router.push(`/game?mode=${modeParam}&room=${myRoom}&speed=${speed}${pw}`);
  }

  function cancelRoom() {
    setMyRoom(null);
    setCreatePassword("");
    setCreatePasswordEnabled(false);
  }

  function joinRoom() {
    if (!joinId.trim()) return;
    socketRef.current?.emit("lobby_leave");
    const modeParam = joinGameMode === "dino" ? "multi-dino" : "multi";
    const pw = joinPassword ? `&pw=${encodeURIComponent(joinPassword)}` : "";
    router.push(`/game?mode=${modeParam}&room=${joinId.trim().toUpperCase()}${pw}`);
  }

  function joinFromList(room: RoomItem, pw?: string) {
    socketRef.current?.emit("lobby_leave");
    if (room.gameMode === "battle") {
      router.push(`/battle?room=${room.id}`);
      return;
    }
    const modeParam = room.gameMode === "dino" ? "multi-dino" : "multi";
    const pwParam = pw ? `&pw=${encodeURIComponent(pw)}` : "";
    router.push(`/game?mode=${modeParam}&room=${room.id}&speed=${room.speed}${pwParam}`);
  }

  function createBattleRoom() {
    const id = uuidv4().substring(0, 8).toUpperCase();
    setBattleRoom(id);
  }

  function enterBattleRoom() {
    if (!battleRoom) return;
    socketRef.current?.emit("lobby_leave");
    router.push(`/battle?room=${battleRoom}`);
  }

  function joinBattleRoom() {
    if (!joinBattleId.trim()) return;
    socketRef.current?.emit("lobby_leave");
    router.push(`/battle?room=${joinBattleId.trim().toUpperCase()}`);
  }

  function invitePlayer(toId: string, _toUsername: string) {
    void _toUsername;
    if (!myRoom) return;
    socketRef.current?.emit("invite_player", {
      toId,
      roomId: myRoom,
      speed,
      gameMode,
    });
    setInviteSent((prev) => ({ ...prev, [toId]: true }));
    setTimeout(
      () => setInviteSent((prev) => ({ ...prev, [toId]: false })),
      4000,
    );
  }

  function pokePlayer(toId: string) {
    socketRef.current?.emit("lobby_poke", { toId });
    setPokeSent((prev) => ({ ...prev, [toId]: true }));
    setTimeout(() => setPokeSent((prev) => ({ ...prev, [toId]: false })), 3000);
  }

  function acceptInvite() {
    if (!invite) return;
    socketRef.current?.emit("invite_accept", {
      roomId: invite.roomId,
      fromId: invite.fromId,
      speed: invite.speed ?? 3,
      gameMode: invite.gameMode || "flappy",
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

      {/* Session kicked overlay */}
      {sessionKicked && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-7 flex flex-col items-center gap-3 max-w-xs w-full text-center">
            <div className="text-4xl">⚠️</div>
            <p className="font-extrabold text-gray-800 text-lg">Sesi Diakhiri</p>
            <p className="text-gray-600 text-sm">
              Akunmu login dari perangkat lain. Kamu akan diarahkan ke halaman login...
            </p>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-pink-500 animate-[shrink_3s_linear_forwards] rounded-full" style={{ width: "100%" }} />
            </div>
          </div>
        </div>
      )}

      {/* Password modal: join room from list */}
      {pendingJoinRoom && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 flex flex-col gap-4 w-full max-w-xs">
            <div className="text-center">
              <div className="text-3xl mb-1">🔒</div>
              <p className="font-extrabold text-gray-800 text-base">Room Terkunci</p>
              <p className="text-gray-500 text-xs mt-1">
                Room{" "}
                <span className="font-mono font-bold text-gray-700">
                  {pendingJoinRoom.id}
                </span>{" "}
                dilindungi password.
              </p>
            </div>
            <input
              type="text"
              placeholder="Masukkan password..."
              value={listJoinPassword}
              onChange={(e) => setListJoinPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && listJoinPassword.trim()) {
                  joinFromList(pendingJoinRoom, listJoinPassword.trim());
                  setPendingJoinRoom(null);
                }
              }}
              autoFocus
              maxLength={20}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-pink-400 outline-none text-gray-700 text-sm"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setPendingJoinRoom(null)}
                className="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-sm transition active:scale-95"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  if (!listJoinPassword.trim()) return;
                  joinFromList(pendingJoinRoom, listJoinPassword.trim());
                  setPendingJoinRoom(null);
                }}
                disabled={!listJoinPassword.trim()}
                className="flex-1 py-2 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold text-sm transition active:scale-95"
              >
                Masuk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Poke notification toast */}
      {pokeNotif && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-yellow-400 text-gray-900 font-bold rounded-2xl shadow-2xl px-6 py-3 text-base animate-bounce">
          {pokeNotif}
        </div>
      )}

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
            <span className="ml-2">
              {invite.gameMode === "dino" ? "👶 Baby Dino" : "🐷 Flappy Pig"}
            </span>
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
              {CHARACTERS.find((c) => c.id === character)?.emoji ?? "🐷"}
            </div>
            <div>
              <p className="text-white font-extrabold text-lg leading-none">
                {user.username}
              </p>
              <p className="text-white/60 text-xs mt-0.5">Online</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <a
                href="/account"
                className="text-white/50 hover:text-white text-xs underline"
              >
                ⚙️ Akun
              </a>
              <button
                onClick={logout}
                className="text-white/50 hover:text-white text-xs underline"
              >
                Keluar
              </button>
            </div>
          </div>

          {/* Character picker */}
          <div className="mb-4">
            <p className="text-white/70 text-xs mb-2">🎮 Karakter:</p>
            <div className="grid grid-cols-4 gap-2">
              {CHARACTERS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => changeCharacter(c.id)}
                  className={`flex flex-col items-center justify-center py-2 rounded-xl text-xl transition active:scale-90 ${
                    character === c.id
                      ? "bg-white/40 ring-2 ring-white"
                      : "bg-white/10 hover:bg-white/20"
                  }`}
                >
                  <span>{c.emoji}</span>
                  <span className="text-white text-xs font-bold mt-0.5">{c.label}</span>
                </button>
              ))}
            </div>
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
          <div className="flex flex-col gap-3">
            <button
              onClick={playSolo}
              className="py-3 bg-linear-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white text-base font-bold rounded-2xl shadow-lg transition active:scale-95"
            >
              🎮 Main Solo Flappy Piggies
            </button>
            <button
              onClick={playBaby}
              className="py-3 bg-linear-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white text-base font-bold rounded-2xl shadow-lg transition active:scale-95"
            >
              👶 Main Solo Baby Dino
            </button>
          </div>
          <br />
          {/* Multiplayer game mode toggle */}
          <div className="mb-4">
            <p className="text-white/70 text-xs mb-2">🎮 Mode Multiplayer:</p>
            <div className="flex gap-2">
              <button
                onClick={() => setGameMode("flappy")}
                className={`flex-1 py-2 rounded-xl font-bold text-sm transition active:scale-95 ${
                  gameMode === "flappy"
                    ? "bg-pink-500 text-white shadow-lg"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                🐷 Flappy Pig
              </button>
              <button
                onClick={() => setGameMode("dino")}
                className={`flex-1 py-2 rounded-xl font-bold text-sm transition active:scale-95 ${
                  gameMode === "dino"
                    ? "bg-purple-500 text-white shadow-lg"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                👶 Baby Dino
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            {!myRoom ? (
              <button
                onClick={createRoom}
                className="py-3 bg-linear-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white text-base font-bold rounded-2xl shadow-lg transition active:scale-95"
              >
                🏠 Buat Room Multiplayer (
                {gameMode === "dino" ? "👶 Dino" : "🐷 Flappy"})
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

                {/* Password option */}
                <div className="mb-3">
                  <label className="flex items-center gap-2 text-white/70 text-xs cursor-pointer select-none mb-1">
                    <input
                      type="checkbox"
                      checked={createPasswordEnabled}
                      onChange={(e) => setCreatePasswordEnabled(e.target.checked)}
                      className="accent-green-400"
                    />
                    🔒 Lindungi dengan password
                  </label>
                  {createPasswordEnabled && (
                    <input
                      type="text"
                      placeholder="Tulis password room..."
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      maxLength={20}
                      className="w-full px-3 py-1.5 rounded-xl bg-white/80 text-gray-700 text-sm outline-none focus:ring-2 focus:ring-green-300"
                    />
                  )}
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
              <div className="flex gap-1.5 mb-2">
                <button
                  onClick={() => setJoinGameMode("flappy")}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition active:scale-95 ${
                    joinGameMode === "flappy"
                      ? "bg-pink-500 text-white"
                      : "bg-white/10 text-white/50 hover:bg-white/20"
                  }`}
                >
                  🐷 Flappy
                </button>
                <button
                  onClick={() => setJoinGameMode("dino")}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition active:scale-95 ${
                    joinGameMode === "dino"
                      ? "bg-purple-500 text-white"
                      : "bg-white/10 text-white/50 hover:bg-white/20"
                  }`}
                >
                  👶 Dino
                </button>
              </div>
              <div className="flex gap-2 mb-2">
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
              <input
                type="text"
                placeholder="Password room (jika ada)..."
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                maxLength={20}
                className="w-full px-3 py-1.5 rounded-xl bg-white/70 text-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>

            <a
              href="/leaderboard"
              className="text-center text-white/60 hover:text-white text-sm underline"
            >
              🏆 Leaderboard
            </a>
          </div>
        </div>

        {/* Available Rooms */}
        <div className="bg-white/20 backdrop-blur-md rounded-3xl p-5 shadow-2xl">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-white font-bold text-base flex-1">🏠 Room Tersedia</h2>
            <span className="bg-white/20 text-yellow-200 text-xs font-bold px-2 py-0.5 rounded-full">
              {roomList.filter((r) => !r.started && r.gameMode !== "battle").length}
            </span>
          </div>
          {roomList.filter((r) => !r.started && r.gameMode !== "battle").length === 0 ? (
            <p className="text-white/50 text-sm text-center py-3">
              Belum ada room yang menunggu pemain...
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
              {roomList
                .filter((r) => !r.started && r.gameMode !== "battle")
                .map((room) => (
                  <div
                    key={room.id}
                    className="flex items-center justify-between bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2.5 transition"
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-yellow-200 font-extrabold text-sm tracking-wider">
                          {room.id}
                        </span>
                        {room.hasPassword && (
                          <span className="text-xs bg-orange-400/80 text-white px-1.5 py-0.5 rounded-full font-bold">
                            🔒
                          </span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${room.gameMode === "battle" ? "bg-red-500/80 text-white font-bold" : "bg-white/20 text-white/70"}`}>
                          {room.gameMode === "battle" ? "⚔️ Battle" : room.gameMode === "dino" ? "👶 Dino" : "🐷 Flappy"}
                        </span>
                        {room.gameMode !== "battle" && (
                          <span className="text-xs bg-white/20 text-white/70 px-1.5 py-0.5 rounded-full">
                            ⚡ {room.speed}
                          </span>
                        )}
                      </div>
                      <p className="text-white/60 text-xs mt-0.5">
                        Host: <span className="text-white/80 font-semibold">{room.host}</span>
                        {" · "}
                        <span>{room.playerCount} pemain</span>
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (room.hasPassword) {
                          setPendingJoinRoom(room);
                          setListJoinPassword("");
                        } else {
                          joinFromList(room);
                        }
                      }}
                      className="ml-2 shrink-0 px-3 py-1.5 bg-green-500 hover:bg-green-400 text-white text-xs font-bold rounded-lg transition active:scale-95"
                    >
                      Masuk
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Battle Mode */}
        <div className="bg-white/20 backdrop-blur-md rounded-3xl p-5 shadow-2xl">
          <h2 className="text-white font-extrabold text-base mb-3 flex items-center gap-2">
            ⚔️ Cat vs Dog Battle
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">NEW</span>
          </h2>
          <p className="text-white/60 text-xs mb-4">
            Turn-based battle 2–4 pemain: lempar bambu, pakai power-up, habiskan HP lawan!
          </p>
          <div className="flex flex-col gap-3">
            {!battleRoom ? (
              <button
                onClick={createBattleRoom}
                className="py-3 bg-linear-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white font-bold rounded-2xl shadow-lg transition active:scale-95"
              >
                ⚔️ Buat Battle Room
              </button>
            ) : (
              <div className="bg-white/10 rounded-2xl p-4 border border-white/30">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-white font-bold text-sm">⚔️ Battle Room aktif</p>
                  <button
                    onClick={() => setBattleRoom(null)}
                    className="text-white/50 hover:text-white text-xs underline"
                  >
                    Batalkan
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-mono bg-white/20 text-yellow-200 font-extrabold px-3 py-1.5 rounded-lg flex-1 text-center text-xl tracking-widest">
                    {battleRoom}
                  </span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(battleRoom).catch(() => {})}
                    className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg transition"
                  >
                    Salin
                  </button>
                </div>
                <button
                  onClick={enterBattleRoom}
                  className="w-full py-2.5 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl transition active:scale-95"
                >
                  ▶️ Masuk ke Battle Room
                </button>
              </div>
            )}

            <div className="bg-white/10 rounded-2xl p-3">
              <p className="text-white/80 text-xs font-semibold mb-2">🔗 Gabung battle dengan kode</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Kode battle room..."
                  value={joinBattleId}
                  onChange={(e) => setJoinBattleId(e.target.value.toUpperCase())}
                  maxLength={8}
                  className="flex-1 px-3 py-2 rounded-xl bg-white/80 text-gray-700 font-mono font-bold text-base tracking-widest outline-none focus:ring-2 focus:ring-red-300"
                />
                <button
                  onClick={joinBattleRoom}
                  className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl transition active:scale-95"
                >
                  Join
                </button>
              </div>
            </div>

            {roomList.filter(r => r.gameMode === "battle" && !r.started).length > 0 && (
              <div className="bg-white/10 rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-white/80 text-xs font-semibold flex-1">⚔️ Room Battle Tersedia</p>
                  <span className="bg-red-500/80 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {roomList.filter(r => r.gameMode === "battle" && !r.started).length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                  {roomList.filter(r => r.gameMode === "battle" && !r.started).map(room => (
                    <div key={room.id} className="flex items-center justify-between bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 transition">
                      <div className="flex flex-col min-w-0">
                        <span className="font-mono text-yellow-200 font-extrabold text-sm tracking-wider">{room.id}</span>
                        <p className="text-white/60 text-xs mt-0.5">
                          Host: <span className="text-white/80 font-semibold">{room.host}</span>
                          {" · "}
                          <span>{room.playerCount}/4 pemain</span>
                        </p>
                      </div>
                      <button
                        onClick={() => joinFromList(room)}
                        className="ml-2 shrink-0 px-3 py-1.5 bg-red-500 hover:bg-red-400 text-white text-xs font-bold rounded-lg transition active:scale-95"
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => pokePlayer(p.id)}
                      disabled={pokeSent[p.id]}
                      className="px-2 py-1 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-200 text-gray-800 text-xs font-bold rounded-lg transition active:scale-95"
                      title="Colek pemain ini"
                    >
                      {pokeSent[p.id] ? "✓" : "👉 Colek"}
                    </button>
                    {myRoom && (
                      <button
                        onClick={() => invitePlayer(p.id, p.username)}
                        disabled={inviteSent[p.id]}
                        className="px-2 py-1 bg-pink-500 hover:bg-pink-400 disabled:bg-pink-300 text-white text-xs font-bold rounded-lg transition active:scale-95"
                      >
                        {inviteSent[p.id] ? "✓" : "Undang"}
                      </button>
                    )}
                  </div>
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

        {/* Footer */}
        <div className="flex justify-center gap-4 text-xs text-white/50 pb-2">
          <a href="/terms" className="hover:text-white underline">Kebijakan Penggunaan</a>
          <a href="/privacy" className="hover:text-white underline">Kebijakan Privasi</a>
          <a href="/account" className="hover:text-white underline">⚙️ Akun</a>
        </div>
      </div>
    </div>
  );
}
