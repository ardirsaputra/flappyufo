// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Custom server â€” Next.js + Socket.IO dalam satu proses.
// Gantikan `next dev` / `next start` dengan `node server.js`.
//
// Dev:  node server.js
// Prod: set NODE_ENV=production && node server.js
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
"use strict";

const { createServer } = require("http");
const { Server } = require("socket.io");
const next = require("next");
const { Pool } = require("pg");

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

// â”€â”€ DB pool for persistent lobby chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const dbPool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 30000,
    })
  : null;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function dbSaveLobbyChat(msg) {
  if (!dbPool) return;
  try {
    await dbPool.query(
      `INSERT INTO lobby_chat_messages (msg_id, username, pig_color, text, ts)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (msg_id) DO NOTHING`,
      [msg.id, msg.username, msg.pigColor || "pink", msg.text, msg.ts],
    );
  } catch {
    /* non-fatal */
  }
}

async function dbLoadLobbyChatHistory() {
  if (!dbPool) return [];
  try {
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    const res = await dbPool.query(
      `SELECT msg_id AS id, username, pig_color AS "pigColor", text, ts
       FROM lobby_chat_messages WHERE ts > $1 ORDER BY ts ASC LIMIT 100`,
      [cutoff],
    );
    return res.rows;
  } catch {
    return [];
  }
}

async function dbPurgeOldChat() {
  if (!dbPool) return;
  try {
    await dbPool.query(`DELETE FROM lobby_chat_messages WHERE ts < $1`, [
      Date.now() - SEVEN_DAYS_MS,
    ]);
  } catch {
    /* non-fatal */
  }
}

// â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const lobbyPlayers = new Map();
const lobbyChatMessages = [];
// username (lowercase) â†’ socket.id â€” enforces single-device login
const activeUsers = new Map();

// Colyseus port for room listing (runs in same process)
const colyseusPort = parseInt(
  process.env.COLYSEUS_PORT || String(port + 1),
  10,
);

// Purge in-memory lobby cache + DB every 5 minutes
setInterval(
  () => {
    // Purge in-memory lobby cache (DB is the source of truth for 7-day history)
    const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS;
    const freshLobby = lobbyChatMessages.filter((m) => m.ts > sevenDaysAgo);
    lobbyChatMessages.length = 0;
    freshLobby.forEach((m) => lobbyChatMessages.push(m));
    // Purge DB
    dbPurgeOldChat();
  },
  5 * 60 * 1000,
);

// â”€â”€ Bootstrap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// httpServer must be created BEFORE next() so Turbopack can attach its HMR
// WebSocket handler to the same server (Next.js 16 requirement).
const httpServer = createServer();
const app = next({ dev, port, httpServer });
const handle = app.getRequestHandler();

httpServer.on("request", (req, res) => {
  handle(req, res);
});

// â”€â”€ Socket.IO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const io = new Server(httpServer, {
  path: "/api/socketio",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: false,
  },
  allowEIO3: true,
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

function broadcastLobby() {
  io.emit("lobby_players", Array.from(lobbyPlayers.values()));
}

async function getRoomList() {
  try {
    const base = `http://localhost:${colyseusPort}`;
    const [flappy, battle, egg] = await Promise.all([
      fetch(`${base}/matchmake/flappy_room`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetch(`${base}/matchmake/battle_room`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetch(`${base}/matchmake/egg_room`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ]);
    return [
      ...flappy
        .filter((r) => r.clients > 0)
        .map((r) => ({
          id: r.metadata?.roomCode || r.roomId,
          host: r.metadata?.host || "?",
          playerCount: r.clients,
          gameMode: r.metadata?.gameMode || "flappy",
          speed: r.metadata?.speed || 3,
          hasPassword: r.metadata?.hasPassword || false,
          started: r.metadata?.started || false,
        })),
      ...battle
        .filter((r) => r.clients > 0)
        .map((r) => ({
          id: r.metadata?.roomCode || r.roomId,
          host: r.metadata?.host || "?",
          playerCount: r.clients,
          gameMode: "battle",
          speed: 0,
          hasPassword: false,
          started: r.metadata?.started || false,
        })),
      ...egg
        .filter((r) => r.clients > 0)
        .map((r) => ({
          id: r.metadata?.roomCode || r.roomId,
          host: r.metadata?.host || "?",
          playerCount: r.clients,
          gameMode: "egg",
          speed: 0,
          hasPassword: false,
          started: r.metadata?.started || false,
        })),
    ];
  } catch {
    return [];
  }
}

async function broadcastRooms() {
  io.emit("room_list", await getRoomList());
}

// â”€â”€ Socket handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
io.on("connection", (socket) => {
  let currentRoom = null;
  let currentUser = null;
  let currentBattleRoom = null;
  let currentEggRoom = null;

  // â”€â”€ LOBBY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  socket.on("lobby_join", ({ username, pigColor, character }) => {
    // Single-device enforcement: kick existing session for this username,
    // but only if the previous socket is NOT currently in a game or battle room.
    if (username) {
      const key = String(username).toLowerCase();
      const prevId = activeUsers.get(key);
      if (prevId && prevId !== socket.id) {
        const prevSocket = io.sockets.sockets.get(prevId);
        if (prevSocket) {
          prevSocket.emit("session_kicked", {
            reason: "Login dari perangkat lain terdeteksi.",
          });
          prevSocket.disconnect(true);
        }
      }
      activeUsers.set(key, socket.id);
    }

    currentUser = username;
    lobbyPlayers.set(socket.id, {
      id: socket.id,
      username,
      pigColor: pigColor || "pink",
      character: character || "pig",
    });
    socket.join("lobby");
    broadcastLobby();
    socket.emit("room_list", getRoomList());
    // Load 7-day chat history from DB (fallback to in-memory)
    dbLoadLobbyChatHistory().then((dbHistory) => {
      const history =
        dbHistory.length > 0 ? dbHistory : lobbyChatMessages.slice(-100);
      if (history.length > 0) socket.emit("lobby_chat_history", history);
    });
  });

  socket.on("lobby_leave", () => {
    lobbyPlayers.delete(socket.id);
    socket.leave("lobby");
    broadcastLobby();
  });

  socket.on("request_room_list", () => {
    getRoomList()
      .then((list) => socket.emit("room_list", list))
      .catch(() => socket.emit("room_list", []));
  });

  socket.on("lobby_chat_send", ({ text }) => {
    if (!currentUser) return;
    const trimmed = String(text).trim().slice(0, 200);
    if (!trimmed) return;
    const player = lobbyPlayers.get(socket.id);
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      username: currentUser,
      pigColor: player?.pigColor || "pink",
      text: trimmed,
      ts: Date.now(),
    };
    lobbyChatMessages.push(msg);
    if (lobbyChatMessages.length > 200)
      lobbyChatMessages.splice(0, lobbyChatMessages.length - 200);
    // Persist to DB for 7-day retention
    dbSaveLobbyChat(msg);
    io.emit("lobby_chat_message", msg);
  });

  socket.on("lobby_poke", ({ toId }) => {
    const from = lobbyPlayers.get(socket.id);
    if (!from) return;
    io.to(toId).emit("poke_received", {
      fromId: socket.id,
      fromUsername: from.username,
    });
  });

  socket.on("invite_player", ({ toId, roomId, speed, gameMode }) => {
    const from = lobbyPlayers.get(socket.id);
    if (!from) return;
    io.to(toId).emit("invite_received", {
      fromId: socket.id,
      fromUsername: from.username,
      roomId,
      speed: speed ?? 3,
      gameMode: gameMode || "flappy",
    });
  });

  socket.on("invite_accept", ({ roomId, fromId, speed, gameMode }) => {
    socket.emit("invite_go", {
      roomId,
      speed: speed ?? 3,
      gameMode: gameMode || "flappy",
    });
    if (fromId)
      io.to(fromId).emit("invite_go", {
        roomId,
        speed: speed ?? 3,
        gameMode: gameMode || "flappy",
      });
  });

  socket.on("disconnect", () => {
    lobbyPlayers.delete(socket.id);
    // Remove from activeUsers only if this socket is still the registered one
    if (currentUser) {
      const key = String(currentUser).toLowerCase();
      if (activeUsers.get(key) === socket.id) activeUsers.delete(key);
    }
    broadcastLobby();
  });
});
// â”€â”€ Periodic room list sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Pushes a fresh room list to every connected socket every 4 s so the lobby
// never shows stale data even if a client missed the event-driven broadcast.
setInterval(async () => {
  io.emit("room_list", await getRoomList());
}, 4000);

// â”€â”€ Start â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.prepare().then(() => {
  httpServer.listen(port, () => {
    const env = dev ? "development" : "production";
    console.log(`> Ready on http://localhost:${port} [${env}]`);

    // ── Colyseus game server (game rooms only) ──────────────────────────────
    const { createColyseusServer } = require("./colyseus-server");
    const { createServer: createColyseusHttp } = require("http");
    const colyseusHttp = createColyseusHttp();
    createColyseusServer(colyseusHttp);
    colyseusHttp.listen(colyseusPort, () => {
      console.log(`> Colyseus ready on ws://localhost:${colyseusPort}`);
    });
  });
});
