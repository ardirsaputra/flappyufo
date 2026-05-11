// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Standalone Socket.IO server â€” deploy this on Railway / Render / Fly.io
// when using Vercel for the Next.js frontend.
//
// Setup:
//   1. npm install (uses root package.json â€” socket.io is already listed)
//   2. Set env vars: ALLOWED_ORIGINS, PORT (optional)
//   3. node socket-server.js
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
"use strict";

const { createServer } = require("http");
const { Server } = require("socket.io");
const { Pool } = require("pg");

const PORT = parseInt(process.env.PORT || "3001", 10);
const COLYSEUS_PORT = parseInt(
  process.env.COLYSEUS_PORT || String(PORT + 1),
  10,
);
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : ["*"];

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

const httpServer = createServer((req, res) => {
  // Health-check endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin:
      allowedOrigins.length === 1 && allowedOrigins[0] === "*"
        ? "*"
        : allowedOrigins,
    methods: ["GET", "POST"],
    credentials: false,
  },
  allowEIO3: true,
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const lobbyPlayers = new Map();
const lobbyChatMessages = [];

// Purge lobby chat every 5 minutes
setInterval(
  () => {
    const sevenDaysAgo = Date.now() - SEVEN_DAYS_MS;
    const freshLobby = lobbyChatMessages.filter((m) => m.ts > sevenDaysAgo);
    lobbyChatMessages.length = 0;
    freshLobby.forEach((m) => lobbyChatMessages.push(m));
    dbPurgeOldChat();
  },
  5 * 60 * 1000,
);

function broadcastLobby() {
  io.emit("lobby_players", Array.from(lobbyPlayers.values()));
}

// â”€â”€ Socket handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
io.on("connection", (socket) => {
  let currentUser = null;

  // LOBBY
  socket.on("lobby_join", ({ username, pigColor }) => {
    currentUser = username;
    lobbyPlayers.set(socket.id, {
      id: socket.id,
      username,
      pigColor: pigColor || "pink",
    });
    broadcastLobby();
    // Send 7-day lobby chat history (from DB if available, else in-memory)
    dbLoadLobbyChatHistory().then((dbHistory) => {
      const history =
        dbHistory.length > 0 ? dbHistory : lobbyChatMessages.slice(-100);
      if (history.length > 0) socket.emit("lobby_chat_history", history);
    });
  });

  socket.on("lobby_leave", () => {
    lobbyPlayers.delete(socket.id);
    broadcastLobby();
  });

  // Lobby global chat
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

  socket.on("invite_player", ({ toId, roomId, speed }) => {
    const from = lobbyPlayers.get(socket.id);
    if (!from) return;
    io.to(toId).emit("invite_received", {
      fromId: socket.id,
      fromUsername: from.username,
      roomId,
      speed: speed ?? 3,
    });
  });

  socket.on("invite_accept", ({ roomId, fromId, speed }) => {
    socket.emit("invite_go", { roomId, speed: speed ?? 3 });
    if (fromId) io.to(fromId).emit("invite_go", { roomId, speed: speed ?? 3 });
  });

  socket.on("disconnect", () => {
    lobbyPlayers.delete(socket.id);
    broadcastLobby();
  });
});

// â”€â”€ Colyseus game server (game rooms only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const { createColyseusServer } = require("./colyseus-server");
const { createServer: createColyseusHttp } = require("http");
const colyseusHttp = createColyseusHttp();
createColyseusServer(colyseusHttp);
colyseusHttp.listen(COLYSEUS_PORT, () => {
  console.log(`Colyseus game server running on port ${COLYSEUS_PORT}`);
});
room.host = nextHost.id;

httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
