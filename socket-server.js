// ─────────────────────────────────────────────────────────────────────────────
// Standalone Socket.IO server — deploy this on Railway / Render / Fly.io
// when using Vercel for the Next.js frontend.
//
// Setup:
//   1. npm install (uses root package.json — socket.io is already listed)
//   2. Set env vars: ALLOWED_ORIGINS, PORT (optional)
//   3. node socket-server.js
// ─────────────────────────────────────────────────────────────────────────────
"use strict";

const { createServer } = require("http");
const { Server } = require("socket.io");

const PORT = parseInt(process.env.PORT || "3001", 10);
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : ["*"];

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

// ── State ──────────────────────────────────────────────────────────────────
const rooms = new Map();
const lobbyPlayers = new Map();
const chatMessages = new Map();
const lobbyChatMessages = [];

// Purge chat messages older than 1 hour every 5 minutes
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

function broadcastLobby() {
  io.emit("lobby_players", Array.from(lobbyPlayers.values()));
}

// ── Socket handlers ────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  let currentRoom = null;
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
    // Send recent lobby chat history to the joining player
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

  // ROOM
  socket.on("join_room", ({ roomId, username, pigColor, speed, gameMode }) => {
    if (currentRoom === roomId) {
      const r = rooms.get(roomId);
      if (r) {
        socket.emit("room_state", {
          players: Array.from(r.players.values()),
          started: r.started,
          host: r.host,
          speed: r.speed,
          gameMode: r.gameMode || "flappy",
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
        gameMode: gameMode || "flappy",
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
      gameMode: room.gameMode || "flappy",
    });

    if (room.started) {
      const elapsed = Math.floor((Date.now() - room.startTime) / 1000);
      socket.emit("game_start", {
        countdown: Math.max(0, 3 - elapsed),
        seed: room.seed,
        speed: room.speed,
      });
    }

    // Chat history
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

httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
