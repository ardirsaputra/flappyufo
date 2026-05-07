// ─────────────────────────────────────────────────────────────────────────────
// Custom server — Next.js + Socket.IO dalam satu proses.
// Gantikan `next dev` / `next start` dengan `node server.js`.
//
// Dev:  node server.js
// Prod: set NODE_ENV=production && node server.js
// ─────────────────────────────────────────────────────────────────────────────
"use strict";

const { createServer } = require("http");
const { Server } = require("socket.io");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

// ── State ──────────────────────────────────────────────────────────────────
const rooms = new Map();
const lobbyPlayers = new Map();
const chatMessages = new Map();
const lobbyChatMessages = [];

// Purge messages older than 1 hour every 5 minutes
setInterval(
  () => {
    const oneHourAgo = Date.now() - 3_600_000;
    for (const [roomId, msgs] of chatMessages.entries()) {
      const fresh = msgs.filter((m) => m.ts > oneHourAgo);
      if (fresh.length === 0) chatMessages.delete(roomId);
      else chatMessages.set(roomId, fresh);
    }
    const freshLobby = lobbyChatMessages.filter((m) => m.ts > oneHourAgo);
    lobbyChatMessages.length = 0;
    freshLobby.forEach((m) => lobbyChatMessages.push(m));
  },
  5 * 60 * 1000,
);

// ── Bootstrap ─────────────────────────────────────────────────────────────
// httpServer must be created BEFORE next() so Turbopack can attach its HMR
// WebSocket handler to the same server (Next.js 16 requirement).
const httpServer = createServer();
const app = next({ dev, port, httpServer });
const handle = app.getRequestHandler();

httpServer.on("request", (req, res) => {
  handle(req, res);
});

// ── Socket.IO ──────────────────────────────────────────────────────────────
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

// ── Socket handlers ────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  let currentRoom = null;
  let currentUser = null;

  // ── LOBBY ──────────────────────────────────────────────────────────────
  socket.on("lobby_join", ({ username, pigColor }) => {
    currentUser = username;
    lobbyPlayers.set(socket.id, {
      id: socket.id,
      username,
      pigColor: pigColor || "pink",
    });
    broadcastLobby();
    const oneHourAgo = Date.now() - 3_600_000;
    const history = lobbyChatMessages
      .filter((m) => m.ts > oneHourAgo)
      .slice(-50);
    if (history.length > 0) socket.emit("lobby_chat_history", history);
  });

  socket.on("lobby_leave", () => {
    lobbyPlayers.delete(socket.id);
    broadcastLobby();
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

  // ── ROOM ───────────────────────────────────────────────────────────────
  socket.on("join_room", ({ roomId, username, pigColor, speed }) => {
    if (currentRoom === roomId) {
      const r = rooms.get(roomId);
      if (r) {
        socket.emit("room_state", {
          players: Array.from(r.players.values()),
          started: r.started,
          host: r.host,
          speed: r.speed,
        });
        if (r.started) {
          const elapsed = Math.floor((Date.now() - r.startTime) / 1000);
          socket.emit("game_start", {
            countdown: Math.max(0, 3 - elapsed),
            seed: r.seed,
            speed: r.speed,
          });
        }
      }
      return;
    }

    currentRoom = roomId;
    currentUser = username;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        id: roomId,
        players: new Map(),
        host: socket.id,
        started: false,
        startTime: 0,
        seed: 0,
        speed: speed || 3,
      });
    }

    const room = rooms.get(roomId);
    if (room.players.has(socket.id)) return;
    if (room.players.size >= 10) return;

    room.players.set(socket.id, {
      id: socket.id,
      username,
      y: 300,
      score: 0,
      alive: true,
      powered: false,
      bigMode: false,
      pigColor: pigColor || "pink",
      slot: room.players.size,
    });

    socket.join(roomId);
    lobbyPlayers.delete(socket.id);
    broadcastLobby();

    io.to(roomId).emit("room_state", {
      players: Array.from(room.players.values()),
      started: room.started,
      host: room.host,
      speed: room.speed,
    });

    if (room.started) {
      const elapsed = Math.floor((Date.now() - room.startTime) / 1000);
      socket.emit("game_start", {
        countdown: Math.max(0, 3 - elapsed),
        seed: room.seed,
        speed: room.speed,
      });
    }

    const oneHourAgo = Date.now() - 3_600_000;
    const history = (chatMessages.get(roomId) || []).filter(
      (m) => m.ts > oneHourAgo,
    );
    if (history.length > 0) socket.emit("chat_history", history);
  });

  socket.on("chat_send", ({ text }) => {
    if (!currentRoom || !currentUser) return;
    const trimmed = String(text).trim().slice(0, 200);
    if (!trimmed) return;
    const player = rooms.get(currentRoom)?.players.get(socket.id);
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      username: currentUser,
      pigColor: player?.pigColor || "pink",
      text: trimmed,
      ts: Date.now(),
    };
    if (!chatMessages.has(currentRoom)) chatMessages.set(currentRoom, []);
    chatMessages.get(currentRoom).push(msg);
    io.to(currentRoom).emit("chat_message", msg);
  });

  socket.on("room_ready", () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.started || socket.id !== room.host) return;
    if (room.players.size < 2) return;
    room.started = true;
    room.startTime = Date.now();
    room.seed = Math.floor(Math.random() * 4294967296);
    io.to(currentRoom).emit("game_start", {
      countdown: 3,
      seed: room.seed,
      speed: room.speed,
    });
  });

  socket.on("update_speed", ({ speed }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.started || socket.id !== room.host) return;
    room.speed = speed;
    io.to(currentRoom).emit("room_state", {
      players: Array.from(room.players.values()),
      started: room.started,
      host: room.host,
      speed: room.speed,
    });
  });

  socket.on("player_update", (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (player) {
      Object.assign(player, data);
      socket
        .to(currentRoom)
        .emit("opponent_update", { id: socket.id, ...data });
    }
  });

  socket.on("player_died", ({ score }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (player) {
      player.alive = false;
      player.score = score;
    }

    io.to(currentRoom).emit("player_died", { id: socket.id, score });

    const alive = Array.from(room.players.values()).filter((p) => p.alive);
    if (alive.length === 1) {
      const deadScores = Array.from(room.players.values())
        .filter((p) => !p.alive)
        .map((p) => p.score);
      io.to(alive[0].id).emit("last_survivor", {
        targetScore: deadScores.length ? Math.max(...deadScores) : 0,
      });
    }
    if (alive.length === 0) {
      const allPlayers = Array.from(room.players.values());
      const winner = allPlayers.sort((a, b) => b.score - a.score)[0];
      io.to(currentRoom).emit("game_over_result", {
        winnerId: winner.id,
        winnerName: winner.username,
        scores: allPlayers.map((p) => ({
          id: p.id,
          username: p.username,
          score: p.score,
        })),
      });
      setTimeout(() => {
        if (!rooms.has(currentRoom)) return;
        const r = rooms.get(currentRoom);
        r.started = false;
        r.players.forEach((p) => {
          p.alive = true;
          p.score = 0;
          p.y = 300;
          p.powered = false;
          p.bigMode = false;
        });
        io.to(currentRoom).emit("room_reset", {
          players: Array.from(r.players.values()),
          host: r.host,
          speed: r.speed,
        });
      }, 30000);
    }
  });

  socket.on("request_room_reset", () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || socket.id !== room.host) return;
    room.started = false;
    room.players.forEach((p) => {
      p.alive = true;
      p.score = 0;
      p.y = 300;
      p.powered = false;
      p.bigMode = false;
    });
    io.to(currentRoom).emit("room_reset", {
      players: Array.from(room.players.values()),
      host: room.host,
      speed: room.speed,
    });
  });

  socket.on("disconnect", () => {
    lobbyPlayers.delete(socket.id);
    broadcastLobby();

    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.players.delete(socket.id);
    io.to(currentRoom).emit("player_left", { id: socket.id });

    if (room.players.size === 0) {
      rooms.delete(currentRoom);
      return;
    }

    if (room.host === socket.id) {
      const nextHost = Array.from(room.players.values())[0];
      room.host = nextHost.id;
      room.players.forEach((p, pid) => {
        p.slot = Array.from(room.players.keys()).indexOf(pid);
      });
      io.to(currentRoom).emit("room_state", {
        players: Array.from(room.players.values()),
        started: room.started,
        host: room.host,
        speed: room.speed,
      });
    }
  });
});

// ── Start ──────────────────────────────────────────────────────────────────
app.prepare().then(() => {
  httpServer.listen(port, () => {
    const env = dev ? "development" : "production";
    console.log(`> Ready on http://localhost:${port} [${env}]`);
  });
});
