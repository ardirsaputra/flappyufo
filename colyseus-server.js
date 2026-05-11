// ─────────────────────────────────────────────────────────────────────────────
// Colyseus game server — FlappyRoom, BattleRoom, EggRoom
//
// Standalone:  node colyseus-server.js
// Embedded:    require("./colyseus-server") from server.js / socket-server.js
// ─────────────────────────────────────────────────────────────────────────────
"use strict";

const { Room, Server } = require("@colyseus/core");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const { Schema, MapSchema, defineTypes } = require("@colyseus/schema");
const { createServer } = require("http");

// ── Battle constants ─────────────────────────────────────────────────────────
const BATTLE_SPAWN_X = [120, 680, 200, 600];
const TURN_SECS = 45;

// ── Egg constants ─────────────────────────────────────────────────────────────
const EGG_SPAWN_X = [100, 250, 400, 550, 700];
const EGG_MAX_PLAYERS = 5;

// ════════════════════════════════════════════════════════════════════════════
//  SCHEMAS
// ════════════════════════════════════════════════════════════════════════════

// ── FlappyPlayer ─────────────────────────────────────────────────────────────
class FlappyPlayer extends Schema {}
defineTypes(FlappyPlayer, {
  id: "string",
  username: "string",
  y: "number",
  score: "number",
  alive: "boolean",
  powered: "boolean",
  bigMode: "boolean",
  pigColor: "string",
  character: "string",
  slot: "number",
});

class FlappyState extends Schema {}
defineTypes(FlappyState, {
  host: "string",
  started: "boolean",
  gameOver: "boolean",
  seed: "number",
  speed: "number",
  gameMode: "string",
  players: { map: FlappyPlayer },
});

// ── BattlePlayer ─────────────────────────────────────────────────────────────
class BattlePowerUps extends Schema {}
defineTypes(BattlePowerUps, {
  big: "boolean",
  double: "boolean",
  explosive: "boolean",
});

class BattlePlayer extends Schema {}
defineTypes(BattlePlayer, {
  id: "string",
  username: "string",
  character: "string",
  x: "number",
  hp: "number",
  maxHp: "number",
  alive: "boolean",
  slot: "number",
  pigColor: "string",
  powerUps: BattlePowerUps,
});

class BattleState extends Schema {}
defineTypes(BattleState, {
  host: "string",
  started: "boolean",
  gameOver: "boolean",
  currentTurnId: "string",
  awaitingDouble: "boolean",
  players: { map: BattlePlayer },
});

// ── EggPlayer ─────────────────────────────────────────────────────────────────
class EggPlayer extends Schema {}
defineTypes(EggPlayer, {
  id: "string",
  username: "string",
  x: "number",
  worldY: "number",
  vy: "number",
  eggState: "string", // "resting" | "jumping" | "dead"
  platformLevel: "number",
  highestLevel: "number",
  alive: "boolean",
  pigColor: "string",
  character: "string",
  slot: "number",
});

class EggState extends Schema {}
defineTypes(EggState, {
  host: "string",
  started: "boolean",
  gameOver: "boolean",
  startTime: "number",
  players: { map: EggPlayer },
});

// ════════════════════════════════════════════════════════════════════════════
//  FlappyRoom
// ════════════════════════════════════════════════════════════════════════════
class FlappyRoom extends Room {
  maxClients = 10;

  onCreate(options) {
    const state = new FlappyState();
    state.speed = options.speed || 3;
    state.gameMode = options.gameMode || "flappy";
    state.players = new MapSchema();
    this.setState(state);

    this.password = options.password || null;
    this.chatMessages = [];
    this.rematchVotes = new Set();
    this.resetTimeout = null;
    this.setMetadata({
      roomCode: options.roomCode || this.roomId,
      host: "",
      gameMode: options.gameMode || "flappy",
      speed: options.speed || 3,
      hasPassword: !!options.password,
      started: false,
    });
    // ── Message handlers ──────────────────────────────────────────────────
    this.onMessage("room_ready", (client) => {
      if (client.sessionId !== this.state.host) return;
      if (this.state.started) return;
      if (this.state.players.size < 2) return;

      this.state.started = true;
      this.state.gameOver = false;
      this.state.seed = Math.floor(Math.random() * 4294967296);
      this.rematchVotes.clear();
      this.setMetadata({ ...this.metadata, started: true });
      this.state.players.forEach((p) => {
        p.alive = true;
        p.score = 0;
        p.y = 300;
        p.powered = false;
        p.bigMode = false;
      });

      this.broadcast("game_start", {
        countdown: 3,
        seed: this.state.seed,
        speed: this.state.speed,
      });
    });

    this.onMessage("update_speed", (client, { speed }) => {
      if (client.sessionId !== this.state.host) return;
      if (this.state.started) return;
      this.state.speed = speed;
    });

    this.onMessage("player_update", (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (data.y !== undefined) player.y = data.y;
      if (data.score !== undefined) player.score = data.score;
      if (data.powered !== undefined) player.powered = data.powered;
      if (data.bigMode !== undefined) player.bigMode = data.bigMode;
    });

    this.onMessage("player_died", (client, { score }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.alive = false;
      player.score = score;

      this.broadcast("player_died", { id: client.sessionId, score });

      const alive = [];
      this.state.players.forEach((p) => {
        if (p.alive) alive.push(p);
      });

      if (alive.length === 1) {
        const dead = [];
        this.state.players.forEach((p) => {
          if (!p.alive) dead.push(p.score);
        });
        const c = this.clients.find((c2) => c2.sessionId === alive[0].id);
        c?.send("last_survivor", {
          targetScore: dead.length ? Math.max(...dead) : 0,
        });
      }

      if (alive.length === 0) {
        const all = [];
        this.state.players.forEach((p) => all.push(p));
        const winner = all.sort((a, b) => b.score - a.score)[0];
        this.state.gameOver = true;
        this.rematchVotes.clear();
        this.broadcast("game_over_result", {
          winnerId: winner.id,
          winnerName: winner.username,
          scores: all.map((p) => ({
            id: p.id,
            username: p.username,
            score: p.score,
          })),
        });
        this.resetTimeout = setTimeout(() => this._doReset(), 60_000);
      }
    });

    this.onMessage("vote_rematch", (client) => {
      if (!this.state.gameOver) return;
      this.rematchVotes.add(client.sessionId);
      const votes = this.rematchVotes.size;
      const total = this.state.players.size;
      this.broadcast("rematch_votes", { votes, total });
      if (votes >= total && total >= 2) {
        if (this.resetTimeout) {
          clearTimeout(this.resetTimeout);
          this.resetTimeout = null;
        }
        this._doRematch();
      }
    });

    this.onMessage("request_room_reset", (client) => {
      if (client.sessionId !== this.state.host) return;
      if (this.state.started && !this.state.gameOver) return;
      this._doReset();
    });

    this.onMessage("chat_send", (client, { text }) => {
      const player = this.state.players.get(client.sessionId);
      const trimmed = String(text || "")
        .trim()
        .slice(0, 200);
      if (!trimmed) return;
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        username: player?.username || "?",
        pigColor: player?.pigColor || "pink",
        text: trimmed,
        ts: Date.now(),
      };
      this.chatMessages.push(msg);
      if (this.chatMessages.length > 100) this.chatMessages.shift();
      this.broadcast("chat_message", msg);
    });
  }

  onAuth(client, options) {
    if (this.password && options.password !== this.password) {
      throw new Error("Password room salah");
    }
    return true;
  }

  onJoin(client, options) {
    if (this.state.players.size === 0) {
      this.state.host = client.sessionId;
      this.setMetadata({ ...this.metadata, host: options.username || "?" });
    }

    const player = new FlappyPlayer();
    player.id = client.sessionId;
    player.username = options.username || "Player";
    player.y = 300;
    player.score = 0;
    player.alive = true;
    player.powered = false;
    player.bigMode = false;
    player.pigColor = options.pigColor || "pink";
    player.character = options.character || "pig";
    player.slot = this.state.players.size;
    this.state.players.set(client.sessionId, player);

    // Chat history
    const cutoff = Date.now() - 3_600_000;
    const history = this.chatMessages.filter((m) => m.ts > cutoff);
    if (history.length > 0) client.send("chat_history", history);

    // Late joiner gets the game_start if already running
    if (this.state.started) {
      client.send("game_start", {
        countdown: 0,
        seed: this.state.seed,
        speed: this.state.speed,
      });
    }
  }

  onLeave(client) {
    this.rematchVotes.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.broadcast("player_left", { id: client.sessionId });

    // Reassign host
    if (this.state.host === client.sessionId && this.state.players.size > 0) {
      const next = this.clients.find((c) =>
        this.state.players.has(c.sessionId),
      );
      if (next) this.state.host = next.sessionId;
    }

    // Update rematch vote count in case we're in gameover phase
    if (this.state.gameOver && this.state.players.size > 0) {
      this.broadcast("rematch_votes", {
        votes: this.rematchVotes.size,
        total: this.state.players.size,
      });
    }

    // Trigger gameover if only 1 alive during active game
    if (this.state.started && !this.state.gameOver) {
      const alive = [];
      this.state.players.forEach((p) => {
        if (p.alive) alive.push(p);
      });
      if (alive.length === 1) {
        const dead = [];
        this.state.players.forEach((p) => {
          if (!p.alive) dead.push(p.score);
        });
        const c = this.clients.find((c2) => c2.sessionId === alive[0].id);
        c?.send("last_survivor", {
          targetScore: dead.length ? Math.max(...dead) : 0,
        });
      }
      if (alive.length === 0 && this.state.players.size > 0) {
        const all = [];
        this.state.players.forEach((p) => all.push(p));
        const winner = all.sort((a, b) => b.score - a.score)[0];
        this.state.gameOver = true;
        this.broadcast("game_over_result", {
          winnerId: winner.id,
          winnerName: winner.username,
          scores: all.map((p) => ({
            id: p.id,
            username: p.username,
            score: p.score,
          })),
        });
        this.resetTimeout = setTimeout(() => this._doReset(), 60_000);
      }
    }
  }

  _doReset() {
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout);
      this.resetTimeout = null;
    }
    this.state.gameOver = false;
    this.state.started = false;
    this.rematchVotes.clear();
    this.setMetadata({ ...this.metadata, started: false });
    this.state.players.forEach((p) => {
      p.alive = true;
      p.score = 0;
      p.y = 300;
      p.powered = false;
      p.bigMode = false;
    });
    this.broadcast("room_reset", {
      host: this.state.host,
      speed: this.state.speed,
    });
  }

  _doRematch() {
    this.state.gameOver = false;
    this.state.started = true;
    this.state.seed = Math.floor(Math.random() * 4294967296);
    this.rematchVotes.clear();
    this.state.players.forEach((p) => {
      p.alive = true;
      p.score = 0;
      p.y = 300;
      p.powered = false;
      p.bigMode = false;
    });
    this.broadcast("game_start", {
      countdown: 3,
      seed: this.state.seed,
      speed: this.state.speed,
    });
  }

  onDispose() {
    if (this.resetTimeout) clearTimeout(this.resetTimeout);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  BattleRoom
// ════════════════════════════════════════════════════════════════════════════
function getNextBattleTurn(state) {
  const ids = [];
  state.players.forEach((p, id) => {
    if (p.alive) ids.push(id);
  });
  if (ids.length === 0) return "";
  const cur = ids.indexOf(state.currentTurnId);
  return ids[(cur + 1) % ids.length];
}

class BattleRoom extends Room {
  maxClients = 4;

  onCreate(options) {
    const state = new BattleState();
    state.players = new MapSchema();
    this.setState(state);

    this.doubleThrowActive = false;
    this.rematchVotes = new Set();
    this.resetTimeout = null;
    this.setMetadata({
      roomCode: options.roomCode || this.roomId,
      host: "",
      gameMode: "battle",
      speed: 0,
      hasPassword: false,
      started: false,
    });
    this.onMessage("battle_start", (client) => {
      if (client.sessionId !== this.state.host) return;
      if (this.state.started) return;
      if (this.state.players.size < 2) return;

      this.state.started = true;
      this.state.gameOver = false;
      this.state.awaitingDouble = false;
      this.doubleThrowActive = false;
      this.setMetadata({ ...this.metadata, started: true });
      // First alive player gets the turn
      let firstId = "";
      this.state.players.forEach((_, id) => {
        if (!firstId) firstId = id;
      });
      this.state.currentTurnId = firstId;

      this.broadcast("battle_game_start", {
        players: this._playersArray(),
        currentTurnId: this.state.currentTurnId,
      });
    });

    this.onMessage("battle_pick_slot", (client, { slot }) => {
      if (this.state.started) return;
      const me = this.state.players.get(client.sessionId);
      if (!me) return;
      const slotNum = parseInt(slot, 10);
      if (isNaN(slotNum) || slotNum < 0 || slotNum > 3) return;
      let taken = false;
      this.state.players.forEach((p, id) => {
        if (p.slot === slotNum && id !== client.sessionId) taken = true;
      });
      if (taken) return;
      me.slot = slotNum;
      me.x = BATTLE_SPAWN_X[slotNum] ?? 400;
      me.character = slotNum % 2 === 0 ? "cat" : "dog";
      this.broadcast("battle_room_state", {
        players: this._playersArray(),
        host: this.state.host,
        started: this.state.started,
      });
    });

    this.onMessage("battle_move", (client, { x }) => {
      if (!this.state.started) return;
      if (client.sessionId !== this.state.currentTurnId) return;
      const p = this.state.players.get(client.sessionId);
      if (!p || !p.alive) return;
      const minX = p.character === "dog" ? 415 : 50;
      const maxX = p.character === "cat" ? 385 : 750;
      p.x = Math.max(minX, Math.min(maxX, x));
      this.broadcast(
        "battle_player_moved",
        { id: client.sessionId, x: p.x },
        { except: client },
      );
    });

    this.onMessage(
      "battle_throw",
      (client, { angle, power, powerUp, startX }) => {
        if (!this.state.started) return;
        if (client.sessionId !== this.state.currentTurnId) return;
        const p = this.state.players.get(client.sessionId);
        if (!p || !p.alive) return;
        if (powerUp && p.powerUps[powerUp]) p.powerUps[powerUp] = false;
        if (powerUp === "double" && !this.doubleThrowActive)
          this.doubleThrowActive = true;
        this.broadcast("battle_projectile", {
          throwerId: client.sessionId,
          angle,
          power,
          powerUp: powerUp || null,
          startX,
        });
      },
    );

    this.onMessage("battle_throw_result", (client, { hits }) => {
      if (!this.state.started) return;
      if (client.sessionId !== this.state.currentTurnId) return;

      const safeHits = Array.isArray(hits) ? hits : [];
      safeHits.forEach(({ targetId, damage }) => {
        const t = this.state.players.get(targetId);
        if (t && t.alive) {
          t.hp = Math.max(0, t.hp - Math.round(damage));
          if (t.hp <= 0) {
            t.hp = 0;
            t.alive = false;
          }
        }
      });

      const alive = [];
      this.state.players.forEach((p) => {
        if (p.alive) alive.push(p);
      });

      // Double throw intermediate
      if (this.doubleThrowActive) {
        this.doubleThrowActive = false;
        this.state.awaitingDouble = true;
        this.broadcast("battle_state_update", {
          players: this._playersArray(),
          currentTurnId: this.state.currentTurnId,
          hits: safeHits,
          awaitingDouble: true,
        });
        return;
      }
      this.state.awaitingDouble = false;

      if (alive.length <= 1) {
        this.state.gameOver = true;
        this.state.started = false;
        const winner = alive[0] ?? this._highestHpPlayer();
        this.broadcast("battle_game_over", {
          winnerId: winner?.id ?? null,
          winnerName: winner?.username ?? "?",
          players: this._playersArray(),
        });
        this.resetTimeout = setTimeout(() => this._resetBattle(), 60_000);
        return;
      }

      this.state.currentTurnId = getNextBattleTurn(this.state);
      this.broadcast("battle_state_update", {
        players: this._playersArray(),
        currentTurnId: this.state.currentTurnId,
        hits: safeHits,
        awaitingDouble: false,
      });
    });

    this.onMessage("battle_vote_rematch", (client) => {
      if (!this.state.gameOver) return;
      this.rematchVotes.add(client.sessionId);
      const votes = this.rematchVotes.size;
      const total = this.state.players.size;
      this.broadcast("battle_rematch_votes", { votes, total });
      if (votes >= total && total >= 2) this._resetBattle();
    });
  }

  onJoin(client, options) {
    if (this.state.players.size === 0) {
      this.state.host = client.sessionId;
      this.setMetadata({ ...this.metadata, host: options.username || "?" });
    }

    // Rejoin: player already in map (reconnect)
    if (this.state.players.has(client.sessionId)) {
      this.broadcast(
        "battle_room_state",
        {
          players: this._playersArray(),
          host: this.state.host,
          started: this.state.started,
        },
        { except: client },
      );
      client.send("battle_room_state", {
        players: this._playersArray(),
        host: this.state.host,
        started: this.state.started,
      });
      return;
    }

    const slot = this.state.players.size;
    const charType = slot % 2 === 0 ? "cat" : "dog";
    const p = new BattlePlayer();
    const pu = new BattlePowerUps();
    pu.big = true;
    pu.double = true;
    pu.explosive = true;

    p.id = client.sessionId;
    p.username = options.username || "Player";
    p.character = charType;
    p.x = BATTLE_SPAWN_X[slot] ?? 400;
    p.hp = 100;
    p.maxHp = 100;
    p.alive = true;
    p.slot = slot;
    p.pigColor = options.pigColor || "pink";
    p.powerUps = pu;

    this.state.players.set(client.sessionId, p);

    this.broadcast("battle_room_state", {
      players: this._playersArray(),
      host: this.state.host,
      started: this.state.started,
    });
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    this.broadcast("battle_player_left", { id: client.sessionId });

    if (this.state.players.size === 0) return;

    if (this.state.host === client.sessionId) {
      this.state.host = this.clients[0]?.sessionId || "";
    }

    // If disconnected player had the turn, skip to next
    if (
      this.state.started &&
      !this.state.gameOver &&
      this.state.currentTurnId === client.sessionId
    ) {
      const alive = [];
      this.state.players.forEach((p) => {
        if (p.alive) alive.push(p);
      });
      if (alive.length <= 1) {
        this.state.gameOver = true;
        this.state.started = false;
        const winner = alive[0] ?? null;
        this.broadcast("battle_game_over", {
          winnerId: winner?.id ?? null,
          winnerName: winner?.username ?? "?",
          players: this._playersArray(),
        });
        this.resetTimeout = setTimeout(() => this._resetBattle(), 60_000);
      } else {
        this.state.currentTurnId = getNextBattleTurn(this.state);
        this.broadcast("battle_state_update", {
          players: this._playersArray(),
          currentTurnId: this.state.currentTurnId,
          hits: [],
          awaitingDouble: false,
        });
      }
    }

    this.broadcast("battle_room_state", {
      players: this._playersArray(),
      host: this.state.host,
      started: this.state.started,
    });
  }

  _playersArray() {
    const arr = [];
    this.state.players.forEach((p, id) => {
      arr.push({
        id: id,
        username: p.username,
        character: p.character,
        x: p.x,
        hp: p.hp,
        maxHp: p.maxHp,
        alive: p.alive,
        slot: p.slot,
        pigColor: p.pigColor,
        powerUps: {
          big: p.powerUps.big,
          double: p.powerUps.double,
          explosive: p.powerUps.explosive,
        },
      });
    });
    return arr;
  }

  _highestHpPlayer() {
    let best = null;
    this.state.players.forEach((p) => {
      if (!best || p.hp > best.hp) best = p;
    });
    return best;
  }

  _resetBattle() {
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout);
      this.resetTimeout = null;
    }
    this.state.gameOver = false;
    this.state.started = false;
    this.state.currentTurnId = "";
    this.state.awaitingDouble = false;
    this.doubleThrowActive = false;
    this.rematchVotes.clear();
    this.setMetadata({ ...this.metadata, started: false });
    this.state.players.forEach((p) => {
      p.alive = true;
      p.hp = 100;
      p.maxHp = 100;
      p.powerUps.big = true;
      p.powerUps.double = true;
      p.powerUps.explosive = true;
    });
    this.broadcast("battle_room_state", {
      players: this._playersArray(),
      host: this.state.host,
      started: false,
    });
  }

  onDispose() {
    if (this.resetTimeout) clearTimeout(this.resetTimeout);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  EggRoom (Lempar Telur)
// ════════════════════════════════════════════════════════════════════════════
class EggRoom extends Room {
  maxClients = EGG_MAX_PLAYERS;

  onCreate(options) {
    const state = new EggState();
    state.players = new MapSchema();
    state.startTime = 0;
    this.setState(state);
    this.rematchVotes = new Set();
    this.resetTimeout = null;

    this.setMetadata({
      roomCode: options.roomCode || this.roomId,
      host: "",
      gameMode: "egg",
      speed: 0,
      hasPassword: false,
      started: false,
    });

    this.onMessage("egg_start", (client) => {
      if (client.sessionId !== this.state.host) return;
      if (this.state.started) return;
      if (this.state.players.size < 2) return;
      this.state.started = true;
      this.state.gameOver = false;
      this.state.startTime = Date.now();
      this.setMetadata({ ...this.metadata, started: true });
      this.broadcast("egg_game_start", {
        players: this._playersArray(),
        startTime: this.state.startTime,
      });
    });

    this.onMessage("egg_jump", (client, { fromLevel }) => {
      this.broadcast(
        "egg_player_jumped",
        { id: client.sessionId, fromLevel },
        { except: client },
      );
    });

    this.onMessage("egg_land", (client, { level }) => {
      if (!this.state.started) return;
      const p = this.state.players.get(client.sessionId);
      if (!p || !p.alive) return;
      const lv = Number(level) || 0;
      p.platformLevel = lv;
      if (lv > p.highestLevel) p.highestLevel = lv;
      this.broadcast(
        "egg_player_landed",
        { id: client.sessionId, level: lv },
        { except: client },
      );
    });

    this.onMessage("egg_sync", (client, { worldY, vy, state: eggSt }) => {
      const p = this.state.players.get(client.sessionId);
      if (p) {
        p.worldY = worldY ?? p.worldY;
        p.vy = vy ?? p.vy;
        p.eggState = eggSt ?? p.eggState;
      }
      this.broadcast(
        "egg_player_sync",
        {
          id: client.sessionId,
          worldY,
          vy,
          state: eggSt,
        },
        { except: client },
      );
    });

    this.onMessage("egg_died", (client) => {
      if (!this.state.started) return;
      const p = this.state.players.get(client.sessionId);
      if (!p || !p.alive) return;
      p.alive = false;
      p.eggState = "dead";
      this.broadcast("egg_player_died", {
        id: client.sessionId,
        players: this._playersArray(),
      });
      this._checkGameOver();
    });

    this.onMessage("egg_rematch", (client) => {
      if (!this.state.gameOver) return;
      this.rematchVotes.add(client.sessionId);
      this.broadcast("egg_rematch_update", {
        votes: this.rematchVotes.size,
        total: this.state.players.size,
      });
      if (this.rematchVotes.size >= this.state.players.size) this._resetEgg();
    });
  }

  onJoin(client, options) {
    if (this.state.players.size === 0) {
      this.state.host = client.sessionId;
      this.setMetadata({ ...this.metadata, host: options.username || "?" });
    }

    const slot = this.state.players.size;
    const p = new EggPlayer();
    p.id = client.sessionId;
    p.username = options.username || "Player";
    p.x = EGG_SPAWN_X[slot] ?? 400;
    p.worldY = 0;
    p.vy = 0;
    p.eggState = "resting";
    p.platformLevel = 0;
    p.highestLevel = 0;
    p.alive = true;
    p.pigColor = options.pigColor || "pink";
    p.character = options.character || "pig";
    p.slot = slot;
    this.state.players.set(client.sessionId, p);

    this.broadcast("egg_room_state", {
      players: this._playersArray(),
      host: this.state.host,
      started: this.state.started,
    });
  }

  onLeave(client) {
    const p = this.state.players.get(client.sessionId);

    // If game running, mark as dead
    if (p && this.state.started && !this.state.gameOver && p.alive) {
      p.alive = false;
      p.eggState = "dead";
      this.broadcast("egg_player_died", {
        id: client.sessionId,
        players: this._playersArray(),
      });
      this._checkGameOver();
    }

    this.state.players.delete(client.sessionId);
    this.broadcast("egg_player_left", { id: client.sessionId });

    if (this.state.players.size === 0) return;
    if (this.state.host === client.sessionId) {
      this.state.host = this.clients[0]?.sessionId || "";
    }
    this.broadcast("egg_room_state", {
      players: this._playersArray(),
      host: this.state.host,
      started: this.state.started,
    });
  }

  _checkGameOver() {
    const alive = [];
    this.state.players.forEach((p) => {
      if (p.alive) alive.push(p);
    });
    if (alive.length > 0) return;

    let winner = null;
    let maxLv = -1;
    this.state.players.forEach((p) => {
      if (p.highestLevel > maxLv) {
        maxLv = p.highestLevel;
        winner = p;
      }
    });
    this.state.gameOver = true;
    this.state.started = false;
    this.broadcast("egg_game_over", {
      winnerId: winner?.id ?? null,
      winnerName: winner?.username ?? "?",
      players: this._playersArray(),
    });
    this.resetTimeout = setTimeout(() => this._resetEgg(), 60_000);
  }

  _playersArray() {
    const arr = [];
    this.state.players.forEach((p, id) => {
      arr.push({
        id: id,
        username: p.username,
        x: p.x,
        worldY: p.worldY,
        vy: p.vy,
        state: p.eggState,
        platformLevel: p.platformLevel,
        highestLevel: p.highestLevel,
        alive: p.alive,
        pigColor: p.pigColor,
        character: p.character,
        slot: p.slot,
      });
    });
    return arr;
  }

  _resetEgg() {
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout);
      this.resetTimeout = null;
    }
    this.state.started = false;
    this.state.gameOver = false;
    this.state.startTime = 0;
    this.rematchVotes.clear();
    this.setMetadata({ ...this.metadata, started: false });
    this.state.players.forEach((p, _id) => {
      const slot = p.slot;
      p.alive = true;
      p.eggState = "resting";
      p.platformLevel = 0;
      p.highestLevel = 0;
      p.x = EGG_SPAWN_X[slot] ?? 400;
      p.worldY = 0;
      p.vy = 0;
    });
    this.broadcast("egg_room_state", {
      players: this._playersArray(),
      host: this.state.host,
      started: false,
    });
  }

  onDispose() {
    if (this.resetTimeout) clearTimeout(this.resetTimeout);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  Server factory — can be called with an existing httpServer (embedded)
//  or without (standalone, creates its own)
// ════════════════════════════════════════════════════════════════════════════
function createColyseusServer(existingHttpServer) {
  const httpServer = existingHttpServer || createServer();

  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
  });

  gameServer.define("flappy_room", FlappyRoom).filterBy(["roomCode"]);
  gameServer.define("battle_room", BattleRoom).filterBy(["roomCode"]);
  gameServer.define("egg_room", EggRoom).filterBy(["roomCode"]);

  return { gameServer, httpServer };
}

// ── Standalone entry point ───────────────────────────────────────────────────
if (require.main === module) {
  const port = parseInt(
    process.env.COLYSEUS_PORT || process.env.PORT || "3001",
    10,
  );
  const { httpServer } = createColyseusServer();
  httpServer.listen(port, () => {
    console.log(`> Colyseus ready on ws://localhost:${port}`);
  });
}

module.exports = { createColyseusServer, FlappyRoom, BattleRoom, EggRoom };
