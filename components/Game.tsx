"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Client as ColyseusClient, Room as ColyseusRoom } from "colyseus.js";

interface PlayerState {
  id: string;
  username: string;
  y: number;
  score: number;
  alive: boolean;
  powered: boolean;
  bigMode: boolean;
  pigColor?: string;
  character?: string;
  slot?: number;
}

interface GameProps {
  username: string;
  userId: number;
  roomId: string;
  solo: boolean;
  dinoMode?: boolean;
  pigColor?: string;
  character?: string;
  initialSpeed?: number;
  password?: string;
}

const CONFIG = {
  gapSize: 230,
  baseSpeed: 3,
  width: 800,
  height: 600,
};

const PIG_COLOR_MAP: Record<
  string,
  { body: [string, string]; stroke: string }
> = {
  pink: { body: ["#ffc8d8", "#ffb3c1"], stroke: "#e8829a" },
  blue: { body: ["#c0d8ff", "#a8c8ff"], stroke: "#4a82e8" },
  purple: { body: ["#dcc0ff", "#cca8ff"], stroke: "#9050e8" },
  orange: { body: ["#ffe0b0", "#ffd090"], stroke: "#e88030" },
  green: { body: ["#b8f0c8", "#a0e8b0"], stroke: "#30c870" },
  yellow: { body: ["#fff4b0", "#ffee90"], stroke: "#d8c030" },
  red: { body: ["#ffc0b8", "#ffb0a0"], stroke: "#e83020" },
  teal: { body: ["#b0eee8", "#98e8e0"], stroke: "#30a8a0" },
  white: { body: ["#f8f8f8", "#e8e8e8"], stroke: "#b0b0b0" },
  brown: { body: ["#ddc0a0", "#cdb090"], stroke: "#906040" },
};

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

// Seeded pseudo-random number generator (Mulberry32)
// Same seed → identical sequence → identical pipes for all players
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function Game({
  username,
  userId,
  roomId,
  solo,
  dinoMode = false,
  pigColor = "pink",
  character = "pig",
  initialSpeed,
  password = "",
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef({
    started: false,
    over: false,
    score: 0,
    birdY: 200,
    birdVelocity: 0,
    birdSize: dinoMode ? { w: 30, h: 30 } : { w: 54, h: 46 },
    dinoMode: dinoMode,
    dinoGroundY: 20, // birdY when pig stands on ground (pig bottom = H - 20 = groundTop)
    dinoNextGap: 450, // pixels from right edge before spawning next cactus
    dinoVelocity: 0,
    dinoIsJumping: false,
    cacti: [] as { x: number; height: number; passed: boolean }[], // for dino mode
    isPowered: false,
    bigMode: false,
    bigTimer: null as ReturnType<typeof setTimeout> | null,
    powerTimer: null as ReturnType<typeof setTimeout> | null,
    pipes: [] as {
      x: number;
      topH: number;
      bottomH: number;
      passed: boolean;
      crushed: boolean;
    }[],
    coins: [] as {
      x: number;
      y: number;
      collected: boolean;
      animT: number;
      value: number;
      radius: number;
    }[],
    mushrooms: [] as { x: number; y: number; collected: boolean }[],
    poisons: [] as { x: number; y: number; r: number; contactTime: number }[],
    pipeSpeed: CONFIG.baseSpeed,
    pipesWiggling: false,
    pipesPassedCount: 0,
    gameSeed: 0,
    initialSpeed: 3,
    lastTickMs: 0,
    rng: null as (() => number) | null,
    frame: 0,
    flapAngle: 0,
    gameLoop: null as ReturnType<typeof setInterval> | null,
    countdownIv: null as ReturnType<typeof setInterval> | null,
    countdownDrawIv: null as ReturnType<typeof setInterval> | null,
    animLoop: null as ReturnType<typeof setInterval> | null,
    countdownVal: 0,
    countdownActive: false,
    opponents: new Map<string, PlayerState>(),
    winnerName: "",
    myWon: false,
    showResult: false,
    resultScores: [] as { username: string; score: number }[],
    deathParticles: [] as {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      color: string;
    }[],
    winParticles: [] as {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      color: string;
      size: number;
    }[],
  });
  const socketRef = useRef<ColyseusRoom | null>(null);
  const [socketId, setSocketId] = useState("");
  const [uiScore, setUiScore] = useState(0);
  const [gamePhase, setGamePhase] = useState<
    "waiting" | "countdown" | "playing" | "dead" | "result"
  >("waiting");
  const [countdown, setCountdown] = useState(3);
  const [targetScore, setTargetScore] = useState<number | null>(null);
  const [opponentName, setOpponentName] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [roomPlayers, setRoomPlayers] = useState<PlayerState[]>([]);
  const [roomSpeed, setRoomSpeed] = useState(initialSpeed || 3);
  const [resultData, setResultData] = useState<{
    winner: string;
    myWon: boolean;
    scores: { username: string; score: number }[];
  } | null>(null);
  const [rematchVotes, setRematchVotes] = useState<{
    votes: number;
    total: number;
  } | null>(null);
  const [hasVotedRematch, setHasVotedRematch] = useState(false);

  // Canvas responsive scaling
  const [canvasScale, setCanvasScale] = useState(1);
  useEffect(() => {
    function updateScale() {
      const maxW = window.innerWidth - 16;
      const maxH = window.innerHeight - 160;
      const s = Math.min(1, maxW / CONFIG.width, maxH / CONFIG.height);
      setCanvasScale(Math.max(0.3, s));
    }
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  // Chat
  interface ChatMsg {
    id: string;
    username: string;
    pigColor: string;
    text: string;
    ts: number;
  }
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(false);
  const showChatRef = useRef(false); // ref for stale-closure-safe access in socket handlers
  const [unreadChat, setUnreadChat] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    showChatRef.current = showChat;
    if (showChat) {
      setUnreadChat(0);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, showChat]);
  function sendChat() {
    const text = chatInput.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.send("chat_send", { text });
    setChatInput("");
  }

  // Audio
  const audioCtxRef = useRef<AudioContext | null>(null);
  function getAudio() {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
    return audioCtxRef.current;
  }
  function playOink() {
    try {
      const ctx = getAudio();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(170, ctx.currentTime + 0.15);
      osc.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.32);
      g.gain.setValueAtTime(0.35, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      /* ignore */
    }
  }
  function playPowerUp() {
    try {
      const ctx = getAudio();
      [400, 520, 660, 800].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g);
        g.connect(ctx.destination);
        osc.type = "square";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.09;
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t);
        osc.stop(t + 0.18);
      });
    } catch {
      /* ignore */
    }
  }
  function playCrush() {
    try {
      const ctx = getAudio();
      const buf = ctx.createBuffer(
        1,
        Math.floor(ctx.sampleRate * 0.18),
        ctx.sampleRate,
      );
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++)
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = buf;
      src.connect(g);
      g.connect(ctx.destination);
      g.gain.value = 0.3;
      src.start();
    } catch {
      /* ignore */
    }
  }
  function playWin() {
    try {
      const ctx = getAudio();
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g);
        g.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.15;
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    } catch {
      /* ignore */
    }
  }
  function playLose() {
    try {
      const ctx = getAudio();
      [400, 350, 300, 200].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g);
        g.connect(ctx.destination);
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.15;
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
      });
    } catch {
      /* ignore */
    }
  }

  // ── SPAWN helpers ─────────────────────────────────────
  function spawnCoins(pipeX: number, topH: number) {
    const g = gameRef.current;
    const gapCY = topH + CONFIG.gapSize / 2;
    const cy = CONFIG.height - gapCY - 14;
    const offsets = [-90, 55, 210].filter(
      () => (g.rng?.() ?? Math.random()) > 0.35,
    );
    if (!offsets.length) offsets.push(55);
    offsets.forEach((o) => {
      const isBig = (g.rng?.() ?? Math.random()) < 0.2;
      gameRef.current.coins.push({
        x: pipeX + o,
        y: cy,
        collected: false,
        animT: 0,
        value: isBig ? 3 : 1,
        radius: isBig ? 18 : 10,
      });
    });
  }
  function spawnMushroom(pipeX: number, topH: number) {
    const gapCY = topH + CONFIG.gapSize / 2;
    const cy = CONFIG.height - gapCY - 18;
    gameRef.current.mushrooms.push({ x: pipeX + 130, y: cy, collected: false });
  }

  function spawnPoison(pipeX: number, topH: number) {
    const g = gameRef.current;
    const gapCY = topH + CONFIG.gapSize / 2; // canvas-Y center of the gap
    const offsetY = ((g.rng?.() ?? Math.random()) - 0.5) * 80;
    gameRef.current.poisons.push({
      x: pipeX + 250,
      y: gapCY + offsetY, // gapCY is already a canvas-Y coord (from top)
      r: 40 + Math.floor((g.rng?.() ?? Math.random()) * 25),
      contactTime: 0,
    });
  }

  function makePipe(x: number) {
    const g = gameRef.current;
    const minH = 60,
      maxH = CONFIG.height - CONFIG.gapSize - minH;
    const topH = (g.rng?.() ?? Math.random()) * (maxH - minH) + minH;
    const bottomH = CONFIG.height - topH - CONFIG.gapSize;
    g.pipes.push({
      x,
      topH,
      bottomH,
      passed: false,
      crushed: false,
    });
    spawnCoins(x, topH);
    if ((g.rng?.() ?? Math.random()) < 0.3 && !g.isPowered)
      spawnMushroom(x, topH);
    if ((g.rng?.() ?? Math.random()) < 0.18) spawnPoison(x, topH);
  }

  function initPipes() {
    const g = gameRef.current;
    g.pipes = [];
    g.coins = [];
    g.mushrooms = [];
    for (let i = 0; i < 5; i++) makePipe(800 + i * 600);
  }

  // Activate mushroom — grants 5 seconds of immunity
  function activateMushroom() {
    const g = gameRef.current;
    g.bigMode = true;
    if (!g.dinoMode) g.birdSize = { w: 72, h: 62 }; // only grow in flappy mode
    playPowerUp();
    if (g.bigTimer) clearTimeout(g.bigTimer);
    g.bigTimer = setTimeout(() => {
      g.bigMode = false;
      if (!g.dinoMode) g.birdSize = { w: 54, h: 46 };
      g.bigTimer = null;
    }, 5000);
  }

  // Dino-mode item spawners
  function spawnDinoCoins(cactusX: number) {
    const count = 2 + Math.floor(Math.random() * 3);
    const baseX = cactusX - 260;
    for (let i = 0; i < count; i++) {
      const coinBirdY = 30 + Math.floor(Math.random() * 130);
      const isBig = Math.random() < 0.2;
      gameRef.current.coins.push({
        x: baseX + i * 55,
        y: CONFIG.height - coinBirdY - 14,
        collected: false,
        animT: 0,
        value: isBig ? 3 : 1,
        radius: isBig ? 18 : 10,
      });
    }
  }
  function spawnDinoMushroom(cactusX: number) {
    gameRef.current.mushrooms.push({
      x: cactusX - 280,
      y: CONFIG.height - 20 - 36,
      collected: false,
    });
  }

  function activatePower() {
    const g = gameRef.current;
    g.isPowered = true;
    if (g.powerTimer) clearTimeout(g.powerTimer);
    g.powerTimer = setTimeout(() => {
      g.isPowered = false;
    }, 7000);
  }

  // Spawn death particles
  function spawnDeathParticles(x: number, y: number) {
    const colors = ["#ff6347", "#ff4500", "#ffd700", "#ff69b4", "#ff1493"];
    for (let i = 0; i < 24; i++) {
      const angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.3;
      const speed = 3 + Math.random() * 5;
      gameRef.current.deathParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  function spawnWinParticles() {
    const colors = [
      "#ffd700",
      "#ff69b4",
      "#00ff88",
      "#00cfff",
      "#ffffff",
      "#ff9900",
    ];
    for (let i = 0; i < 60; i++) {
      gameRef.current.winParticles.push({
        x: Math.random() * CONFIG.width,
        y: Math.random() * CONFIG.height * 0.5,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 1,
        life: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 8,
      });
    }
  }

  // ── DRAW ──────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const g = gameRef.current;
    const { width: W, height: H } = CONFIG;

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#ffcbf2");
    bg.addColorStop(0.4, "#ffd6e0");
    bg.addColorStop(1, "#ffecd2");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Clouds
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const cf = (g.frame * 0.3) % (W + 150);
    [
      [W + 80 - cf, 60, 80, 40],
      [W + 200 - cf, 120, 100, 50],
      [W + 350 - cf, 180, 70, 35],
    ].forEach(([cx, cy, cw, ch]) => {
      const rx = ((cx - -150) % (W + 150)) - 150;
      ctx.beginPath();
      ctx.ellipse(rx, cy, cw / 2, ch / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(rx - 20, cy - 10, cw * 0.3, ch * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(rx + 25, cy - 8, cw * 0.35, ch * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    if (g.dinoMode) {
      // Ground
      ctx.fillStyle = "#deb887";
      ctx.fillRect(0, H - 20, W, 20);
      ctx.strokeStyle = "#8b4513";
      ctx.lineWidth = 2;
      ctx.strokeRect(0, H - 20, W, 20);

      // Cacti
      g.cacti.forEach((cactus) => {
        ctx.fillStyle = "#228b22";
        ctx.fillRect(cactus.x, H - cactus.height, 20, cactus.height);
        ctx.strokeStyle = "#006400";
        ctx.lineWidth = 2;
        ctx.strokeRect(cactus.x, H - cactus.height, 20, cactus.height);
        // Spikes
        ctx.fillStyle = "#32cd32";
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(cactus.x + i * 6, H - cactus.height - 5, 4, 5);
        }
      });

      // Skip pipes, coins, mushrooms for dino mode
    } else {
      // Pipes
      g.pipes.forEach((pipe) => {
        const px = pipe.x;
        if (pipe.crushed) {
          ctx.globalAlpha = 0.4;
          ctx.filter = "brightness(3) saturate(0)";
        }
        // Pipe color
        const pGrad = ctx.createLinearGradient(px, 0, px + 60, 0);
        pGrad.addColorStop(0, "#a0522d");
        pGrad.addColorStop(0.5, "#cd853f");
        pGrad.addColorStop(1, "#a0522d");
        ctx.fillStyle = pGrad;
        ctx.strokeStyle = "#7a3e1e";
        ctx.lineWidth = 3;

        // Top pipe
        ctx.fillRect(px, 0, 60, pipe.topH);
        ctx.strokeRect(px, 0, 60, pipe.topH);
        ctx.fillRect(px - 5, pipe.topH - 20, 70, 20);
        ctx.strokeRect(px - 5, pipe.topH - 20, 70, 20);

        // Bottom pipe
        const by = H - pipe.bottomH;
        ctx.fillRect(px, by, 60, pipe.bottomH);
        ctx.strokeRect(px, by, 60, pipe.bottomH);
        ctx.fillRect(px - 5, by, 70, 20);
        ctx.strokeRect(px - 5, by, 70, 20);

        ctx.globalAlpha = 1;
        ctx.filter = "none";
      });
    } // end else for pipes

    // Coins (both flappy and dino modes)
    g.coins.forEach((coin) => {
      if (coin.collected) return;
      coin.animT += 0.06;
      const scaleX = Math.abs(Math.cos(coin.animT));
      const r = coin.radius;
      ctx.save();
      ctx.translate(coin.x + r, coin.y + r);
      ctx.scale(scaleX, 1);
      if (r >= 18) {
        // Big coin — brighter gradient + star
        const cGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
        cGrad.addColorStop(0, "#fff176");
        cGrad.addColorStop(0.5, "#ffeb3b");
        cGrad.addColorStop(1, "#f57f17");
        ctx.fillStyle = cGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#e65100";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // Star overlay
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        for (let si = 0; si < 5; si++) {
          const outerA = (si * 4 * Math.PI) / 5 - Math.PI / 2;
          const innerA = outerA + Math.PI / 5;
          if (si === 0)
            ctx.moveTo(
              Math.cos(outerA) * r * 0.55,
              Math.sin(outerA) * r * 0.55,
            );
          else
            ctx.lineTo(
              Math.cos(outerA) * r * 0.55,
              Math.sin(outerA) * r * 0.55,
            );
          ctx.lineTo(Math.cos(innerA) * r * 0.25, Math.sin(innerA) * r * 0.25);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        // Small coin
        const cGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
        cGrad.addColorStop(0, "#ffe066");
        cGrad.addColorStop(0.6, "#ffd700");
        cGrad.addColorStop(1, "#b8860b");
        ctx.fillStyle = cGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#b8860b";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    });

    // Poison clouds (flappy mode only)
    if (!g.dinoMode) {
      g.poisons.forEach((poison) => {
        const pulse =
          0.55 + 0.45 * Math.abs(Math.sin(g.frame * 0.08 + poison.x * 0.01));
        ctx.save();
        ctx.globalAlpha = 0.72 * pulse;
        const pGrad = ctx.createRadialGradient(
          poison.x,
          poison.y,
          4,
          poison.x,
          poison.y,
          poison.r,
        );
        pGrad.addColorStop(0, "rgba(80,200,60,0.95)");
        pGrad.addColorStop(0.5, "rgba(50,160,30,0.6)");
        pGrad.addColorStop(1, "rgba(20,100,10,0)");
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(poison.x, poison.y, poison.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.font = `${Math.floor(poison.r * 0.72)}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("☠️", poison.x, poison.y);
        ctx.textBaseline = "alphabetic";
        ctx.restore();
      });
    }

    // Mushrooms (both flappy and dino modes)
    g.mushrooms.forEach((m) => {
      if (m.collected) return;
      const bob = Math.sin(g.frame * 0.08) * 6;
      ctx.save();
      ctx.translate(m.x, m.y + bob);
      ctx.fillStyle = "#e03030";
      ctx.beginPath();
      ctx.ellipse(18, 12, 18, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "white";
      [
        [8, 6, 3],
        [22, 4, 4],
        [16, 10, 3],
      ].forEach(([sx, sy, sr]) => {
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = "#ffecd2";
      ctx.strokeStyle = "#d4a574";
      ctx.lineWidth = 1.5;
      ctx.fillRect(7, 22, 22, 14);
      ctx.strokeRect(7, 22, 22, 14);
      ctx.restore();
    });

    // Opponents: ghost pigs at their actual Y positions (both flappy and dino modes)
    g.opponents.forEach((op) => {
      const opW = g.dinoMode ? 30 : op.bigMode ? 52 : 40;
      const opH = g.dinoMode ? 30 : op.bigMode ? 44 : 34;
      const opX = g.dinoMode ? 78 : 96;
      const opY = Math.max(0, Math.min(H - opH - 20, H - op.y - opH));
      ctx.globalAlpha = op.alive ? 0.5 : 0.2;
      drawCharacter(
        ctx,
        opX,
        opY,
        opW,
        opH,
        g.dinoMode ? false : op.powered,
        op.bigMode,
        g.frame,
        op.pigColor || "pink",
        op.character || "pig",
      );
      // Opponent username label
      ctx.globalAlpha = op.alive ? 0.7 : 0.3;
      ctx.fillStyle = op.alive ? "#fff" : "#ff9999";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText(
        op.alive ? op.username : `💀 ${op.username}`,
        opX + opW / 2,
        opY - 4,
      );
      ctx.globalAlpha = 1;
    });

    // Live scoreboard panel (top-right, multiplayer only)
    if (!solo) {
      const allPlayers: {
        username: string;
        score: number;
        alive: boolean;
        isMe: boolean;
        color: string;
      }[] = [
        {
          username,
          score: g.score,
          alive: !g.over,
          isMe: true,
          color: pigColor,
        },
        ...Array.from(g.opponents.values()).map((op) => ({
          username: op.username,
          score: op.score,
          alive: op.alive,
          isMe: false,
          color: op.pigColor || "pink",
        })),
      ].sort((a, b) => b.score - a.score);

      const maxRows = Math.min(allPlayers.length, 8);
      const sbW = 155,
        sbH = 20 + maxRows * 20;
      const sbX = W - sbW - 6,
        sbY = 6;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.roundRect(sbX, sbY, sbW, sbH, 8);
      ctx.fill();

      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText("🏆 Scoreboard", sbX + sbW / 2, sbY + 13);

      allPlayers.slice(0, 8).forEach((p, i) => {
        const py = sbY + 20 + i * 20;
        const colorHex = PIG_COLOR_HEX[p.color] || "#ffc8d8";
        ctx.fillStyle = colorHex;
        ctx.beginPath();
        ctx.arc(sbX + 12, py + 7, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = p.isMe ? "#ffd700" : p.alive ? "#ffffff" : "#ff9999";
        ctx.font = `${p.isMe ? "bold " : ""}10px Arial`;
        ctx.textAlign = "left";
        ctx.fillText(
          `${i + 1}. ${p.username.substring(0, 10)}`,
          sbX + 20,
          py + 10,
        );
        ctx.fillStyle = p.alive ? "#aaffaa" : "#ff9999";
        ctx.textAlign = "right";
        ctx.fillText(String(p.score), sbX + sbW - 6, py + 10);
      });
    }

    // Player pig
    const { w: bW, h: bH } = g.birdSize;
    const bx = 100;
    const by2 = H - g.birdY - bH;
    drawCharacter(
      ctx,
      bx,
      by2,
      bW,
      bH,
      g.isPowered,
      g.bigMode,
      g.frame,
      pigColor,
      character,
    );

    // Player label (grey when dead/spectating)
    ctx.fillStyle = g.over ? "rgba(255,100,100,0.8)" : "#fff";
    ctx.font = `bold 11px Arial`;
    ctx.textAlign = "center";
    ctx.fillText(g.over ? `💀 ${username}` : username, bx + bW / 2, by2 - 6);

    // Death particles
    g.deathParticles = g.deathParticles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.life -= 0.025;
      if (p.life <= 0) return false;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return true;
    });

    // Win particles
    g.winParticles = g.winParticles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.008;
      if (p.life <= 0) return false;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.globalAlpha = 1;
      return true;
    });

    // Ground (flappy mode only — dino mode draws its own ground earlier)
    if (!g.dinoMode) {
      ctx.fillStyle = "#8b4513";
      ctx.fillRect(0, H - 20, W, 20);
      ctx.fillStyle = "#654321";
      ctx.fillRect(0, H - 20, W, 4);
    }

    // Score HUD
    ctx.fillStyle = "white";
    ctx.font = "bold 36px Arial";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 8;
    ctx.fillText(`Score: ${g.score}`, W / 2, 55);
    ctx.shadowBlur = 0;

    // Power indicator
    if (g.dinoMode) {
      if (g.bigMode) {
        // Pulsing shield ring around pig
        const pulse = 0.45 + 0.45 * Math.abs(Math.sin(g.frame * 0.18));
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = "#ff69b4";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(
          100 + bW / 2,
          H - g.birdY - bH / 2,
          bW / 2 + 10,
          bH / 2 + 10,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Text
        ctx.fillStyle = "#ff69b4";
        ctx.font = "bold 15px Arial";
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(255,105,180,0.7)";
        ctx.shadowBlur = 8;
        ctx.fillText("🍄 IMUN KAKTUS!", W / 2, 85);
        ctx.shadowBlur = 0;
      }
    } else {
      if (g.bigMode) {
        ctx.fillStyle = "#ff69b4";
        ctx.font = "bold 16px Arial";
        ctx.textAlign = "center";
        ctx.fillText("🛡️ NYAWA EKSTRA! (tahan 1 pipa)", W / 2, 85);
      }
      if (g.isPowered) {
        ctx.fillStyle = "#ffd700";
        ctx.font = "bold 16px Arial";
        ctx.textAlign = "center";
        ctx.fillText("⚡ POWER UP!", W / 2, g.bigMode ? 105 : 85);
      }
    }

    // Solo countdown overlay (multiplayer uses HTML overlay instead)
    if (solo && g.countdownActive && g.countdownVal > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 140px Arial";
      ctx.textAlign = "center";
      ctx.shadowColor = "#ff6347";
      ctx.shadowBlur = 30;
      ctx.fillText(String(g.countdownVal), W / 2, H / 2 + 50);
      ctx.shadowBlur = 0;
    }

    g.frame++;
  }, [username, solo]);

  function drawPig(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    powered: boolean,
    bigMode: boolean,
    frame: number,
    colorId: string = "pink",
  ) {
    if (w < 40) {
      // Baby pig
      const palette = PIG_COLOR_MAP[colorId] || PIG_COLOR_MAP["pink"];
      const [bodyLight, bodyDark] = palette.body;
      const strokeColor = palette.stroke;

      ctx.save();
      if (powered) {
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 20;
      }
      if (bigMode) {
        ctx.shadowColor = "#ff69b4";
        ctx.shadowBlur = 22;
      }

      // Body - more round
      const bodyGrad = ctx.createRadialGradient(
        x + w * 0.4,
        y + h * 0.4,
        2,
        x + w / 2,
        y + h / 2,
        w * 0.7,
      );
      bodyGrad.addColorStop(0, bodyLight);
      bodyGrad.addColorStop(1, bodyDark);
      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Small ears
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.ellipse(x + w * 0.25, y + 3, 4, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + w * 0.55, y + 3, 4, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Small snout
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.ellipse(x + w - 5, y + h * 0.55, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(130,40,60,0.3)";
      ctx.beginPath();
      ctx.arc(x + w - 7, y + h * 0.58, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + w - 3, y + h * 0.58, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Eye
      ctx.fillStyle = "#2d2d2d";
      ctx.beginPath();
      ctx.arc(x + w * 0.62, y + h * 0.38, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(x + w * 0.64, y + h * 0.36, 1, 0, Math.PI * 2);
      ctx.fill();

      // Tail
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + 2, y + h * 0.6, 3, Math.PI * 0.5, Math.PI * 1.5);
      ctx.stroke();

      ctx.restore();
      return;
    }

    const palette = PIG_COLOR_MAP[colorId] || PIG_COLOR_MAP["pink"];
    const [bodyLight, bodyDark] = palette.body;
    const strokeColor = palette.stroke;

    ctx.save();
    if (powered) {
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 20;
    }
    if (bigMode) {
      ctx.shadowColor = "#ff69b4";
      ctx.shadowBlur = 15;
    }

    // Body
    const bodyGrad = ctx.createRadialGradient(
      x + w * 0.4,
      y + h * 0.4,
      2,
      x + w / 2,
      y + h / 2,
      w * 0.7,
    );
    bodyGrad.addColorStop(0, bodyLight);
    bodyGrad.addColorStop(1, bodyDark);
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Wing
    ctx.fillStyle = bodyLight;
    ctx.beginPath();
    ctx.ellipse(x + 4, y + h / 2 + 5, 10, 7, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Ear
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.ellipse(x + w * 0.25, y + 5, 7, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w * 0.55, y + 5, 7, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.ellipse(x + w - 8, y + h * 0.55, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(130,40,60,0.3)";
    ctx.beginPath();
    ctx.arc(x + w - 13, y + h * 0.58, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + w - 4, y + h * 0.58, 3, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = "#2d2d2d";
    ctx.beginPath();
    ctx.arc(x + w * 0.62, y + h * 0.38, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x + w * 0.63, y + h * 0.36, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Flap animation
    if (powered) {
      const flapY = Math.sin(frame * 0.3) * 4;
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y + h * 0.5);
      ctx.lineTo(x - 12, y + h * 0.3 + flapY);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBear(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    powered: boolean,
    bigMode: boolean,
    frame: number,
    colorId: string = "brown",
  ) {
    const palette = PIG_COLOR_MAP[colorId] || PIG_COLOR_MAP["brown"];
    const [bodyLight, bodyDark] = palette.body;
    const strokeColor = palette.stroke;
    ctx.save();
    if (powered) {
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 20;
    }
    if (bigMode) {
      ctx.shadowColor = "#ff69b4";
      ctx.shadowBlur = 15;
    }

    const bodyGrad = ctx.createRadialGradient(
      x + w * 0.4,
      y + h * 0.4,
      2,
      x + w / 2,
      y + h / 2,
      w * 0.7,
    );
    bodyGrad.addColorStop(0, bodyLight);
    bodyGrad.addColorStop(1, bodyDark);
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = w < 40 ? 1.5 : 2;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const earR = w < 40 ? 5 : 8;
    // Outer ears
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(x + w * 0.22, y + 2, earR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + w * 0.65, y + 2, earR, 0, Math.PI * 2);
    ctx.fill();
    // Inner ears
    ctx.fillStyle = bodyLight;
    ctx.beginPath();
    ctx.arc(x + w * 0.22, y + 2, earR * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + w * 0.65, y + 2, earR * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.fillStyle = bodyLight;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(
      x + w * 0.73,
      y + h * 0.58,
      w < 40 ? 5 : 9,
      w < 40 ? 4 : 7,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.ellipse(
      x + w * 0.75,
      y + h * 0.52,
      w < 40 ? 1.5 : 3,
      w < 40 ? 1 : 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Eye
    ctx.fillStyle = "#2d2d2d";
    ctx.beginPath();
    ctx.arc(x + w * 0.6, y + h * 0.38, w < 40 ? 2 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x + w * 0.61, y + h * 0.36, w < 40 ? 0.8 : 1.5, 0, Math.PI * 2);
    ctx.fill();

    if (powered) {
      const flapY = Math.sin(frame * 0.3) * 4;
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y + h * 0.5);
      ctx.lineTo(x - 12, y + h * 0.3 + flapY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPanda(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    powered: boolean,
    bigMode: boolean,
    frame: number,
    colorId: string = "white",
  ) {
    void colorId; // panda uses fixed white body; color ignored
    ctx.save();
    if (powered) {
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 20;
    }
    if (bigMode) {
      ctx.shadowColor = "#ff69b4";
      ctx.shadowBlur = 15;
    }

    // White body
    const bodyGrad = ctx.createRadialGradient(
      x + w * 0.4,
      y + h * 0.4,
      2,
      x + w / 2,
      y + h / 2,
      w * 0.7,
    );
    bodyGrad.addColorStop(0, "#f8f8f8");
    bodyGrad.addColorStop(1, "#d8d8d8");
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = "#999";
    ctx.lineWidth = w < 40 ? 1.5 : 2;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Black round ears
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(x + w * 0.2, y + 2, w < 40 ? 5 : 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + w * 0.65, y + 2, w < 40 ? 5 : 8, 0, Math.PI * 2);
    ctx.fill();

    // Black eye patch
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(
      x + w * 0.61,
      y + h * 0.37,
      w < 40 ? 4 : 7,
      w < 40 ? 3.5 : 6,
      0.3,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // White + black eye
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x + w * 0.63, y + h * 0.37, w < 40 ? 2 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(x + w * 0.64, y + h * 0.37, w < 40 ? 1 : 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x + w * 0.65, y + h * 0.35, w < 40 ? 0.5 : 0.9, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.fillStyle = "#f0f0f0";
    ctx.strokeStyle = "#bbb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(
      x + w * 0.73,
      y + h * 0.58,
      w < 40 ? 5 : 9,
      w < 40 ? 4 : 7,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.ellipse(
      x + w * 0.73,
      y + h * 0.53,
      w < 40 ? 1.5 : 2.5,
      w < 40 ? 1 : 1.5,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    if (powered) {
      const flapY = Math.sin(frame * 0.3) * 4;
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y + h * 0.5);
      ctx.lineTo(x - 12, y + h * 0.3 + flapY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDinoChar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    powered: boolean,
    bigMode: boolean,
    frame: number,
    colorId: string = "green",
  ) {
    const palette = PIG_COLOR_MAP[colorId] || PIG_COLOR_MAP["green"];
    const [bodyLight, bodyDark] = palette.body;
    const strokeColor = palette.stroke;
    ctx.save();
    if (powered) {
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 20;
    }
    if (bigMode) {
      ctx.shadowColor = "#ff69b4";
      ctx.shadowBlur = 15;
    }

    const bodyGrad = ctx.createRadialGradient(
      x + w * 0.4,
      y + h * 0.4,
      2,
      x + w / 2,
      y + h / 2,
      w * 0.7,
    );
    bodyGrad.addColorStop(0, bodyLight);
    bodyGrad.addColorStop(1, bodyDark);
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = w < 40 ? 1.5 : 2;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Dorsal spines
    const spineCount = w < 40 ? 2 : 3;
    ctx.fillStyle = strokeColor;
    for (let i = 0; i < spineCount; i++) {
      const sx = x + w * (0.2 + i * (0.55 / spineCount));
      const sh = w < 40 ? 5 - i : 8 - i * 2;
      ctx.beginPath();
      ctx.moveTo(sx - 2, y + h * 0.12);
      ctx.lineTo(sx, y + h * 0.12 - sh);
      ctx.lineTo(sx + 2, y + h * 0.12);
      ctx.closePath();
      ctx.fill();
    }

    // Yellow slit eye
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.ellipse(
      x + w * 0.65,
      y + h * 0.38,
      w < 40 ? 3.5 : 6,
      w < 40 ? 3 : 5,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(
      x + w * 0.65,
      y + h * 0.38,
      w < 40 ? 1 : 2,
      w < 40 ? 2.5 : 4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x + w * 0.66, y + h * 0.36, w < 40 ? 0.6 : 1, 0, Math.PI * 2);
    ctx.fill();

    // Nostril
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(x + w * 0.84, y + h * 0.42, w < 40 ? 1.2 : 2, 0, Math.PI * 2);
    ctx.fill();

    // Tail
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = w < 40 ? 2.5 : 4;
    ctx.beginPath();
    ctx.moveTo(x + 5, y + h * 0.5);
    ctx.quadraticCurveTo(x - 4, y + h * 0.5, x - 8, y + h * 0.68);
    ctx.stroke();

    if (w >= 40) {
      // Small arm
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.35, y + h * 0.55);
      ctx.lineTo(x + w * 0.2, y + h * 0.68);
      ctx.stroke();
    }

    if (powered) {
      const flapY = Math.sin(frame * 0.3) * 4;
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y + h * 0.5);
      ctx.lineTo(x - 12, y + h * 0.3 + flapY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCharacter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    powered: boolean,
    bigMode: boolean,
    frame: number,
    colorId: string,
    characterType: string,
  ) {
    switch (characterType) {
      case "bear":
        return drawBear(ctx, x, y, w, h, powered, bigMode, frame, colorId);
      case "panda":
        return drawPanda(ctx, x, y, w, h, powered, bigMode, frame, colorId);
      case "dino":
        return drawDinoChar(ctx, x, y, w, h, powered, bigMode, frame, colorId);
      default:
        return drawPig(ctx, x, y, w, h, powered, bigMode, frame, colorId);
    }
  }

  // ── GAME TICK ─────────────────────────────────────────
  const tick = useCallback(
    (dtFactor = 1) => {
      const g = gameRef.current;
      if (!g.started || g.over) return;

      if (g.dinoMode) {
        // ── Dino physics (flappy coords: higher birdY = visually higher on screen) ──
        // Gravity is negative here because decreasing birdY moves pig DOWN visually
        const gravity = -0.65;
        g.dinoVelocity += gravity;
        g.birdY += g.dinoVelocity;

        // Clamp to ground
        if (g.birdY <= g.dinoGroundY) {
          g.birdY = g.dinoGroundY;
          g.dinoVelocity = 0;
          g.dinoIsJumping = false;
        }

        // Move & cleanup cacti
        for (const c of g.cacti) c.x -= g.pipeSpeed * dtFactor;
        g.cacti = g.cacti.filter((c) => c.x > -60);

        // Spawn next cactus when last one scrolled past the gap threshold
        const lastC = g.cacti.length > 0 ? g.cacti[g.cacti.length - 1] : null;
        if (!lastC || lastC.x < CONFIG.width - g.dinoNextGap) {
          const height = 44 + Math.floor(Math.random() * 40);
          g.cacti.push({ x: CONFIG.width + 60, height, passed: false });
          g.dinoNextGap = 300 + Math.random() * 270;
          spawnDinoCoins(CONFIG.width + 60);
          if (Math.random() < 0.3) spawnDinoMushroom(CONFIG.width + 60);
        }

        // Collision check + cactus-passed scoring
        const bW = g.birdSize.w;
        const bH = g.birdSize.h;
        const birdLeft = 100,
          birdRight = 100 + bW;
        let hitCactus = false;
        for (const cactus of g.cacti) {
          if (
            birdRight > cactus.x + 4 &&
            birdLeft < cactus.x + 16 &&
            g.birdY < cactus.height - 6
          ) {
            hitCactus = true;
            break;
          }
          if (!cactus.passed && cactus.x + 20 < birdLeft) {
            cactus.passed = true;
            g.score++;
            g.pipesPassedCount++;
            setUiScore(g.score);
            if (g.pipesPassedCount % 5 === 0)
              g.pipeSpeed = Math.min(g.pipeSpeed + 0.3, 14);
          }
        }
        if (hitCactus && !g.bigMode) {
          endGame();
          return;
        }

        // Coin collection (dino mode)
        g.coins = g.coins.filter((coin) => {
          if (coin.collected) return false;
          coin.x -= g.pipeSpeed * dtFactor;
          if (coin.x < -40) return false;
          const r = coin.radius;
          const cx = coin.x + r,
            cy2 = coin.y + r;
          const bCx = 100 + bW / 2,
            bCy = CONFIG.height - g.birdY - bH / 2;
          if (
            Math.abs(cx - bCx) < bW / 2 + r &&
            Math.abs(cy2 - bCy) < bH / 2 + r
          ) {
            coin.collected = true;
            g.score += coin.value;
            setUiScore(g.score);
            playOink();
            return false;
          }
          return true;
        });

        // Mushroom collection (dino mode)
        g.mushrooms = g.mushrooms.filter((m) => {
          m.x -= g.pipeSpeed * dtFactor;
          if (m.x < -60) return false;
          const mx = m.x + 18,
            my = m.y + 18;
          const bCx = 100 + bW / 2,
            bCy = CONFIG.height - g.birdY - bH / 2;
          if (
            Math.abs(mx - bCx) < bW / 2 + 18 &&
            Math.abs(my - bCy) < bH / 2 + 18
          ) {
            m.collected = true;
            activateMushroom();
            return false;
          }
          return true;
        });

        // Sync dino position/score to multiplayer
        if (!solo && socketRef.current) {
          socketRef.current.send("player_update", {
            y: g.birdY,
            score: g.score,
            alive: true,
            bigMode: g.bigMode,
          });
        }

        draw();
        return;
      }

      const gravity = -0.5;
      const jumpStrength = 9;

      g.birdVelocity += gravity;
      g.birdY += g.birdVelocity;

      if (g.birdY <= 0) {
        endGame();
        return;
      }
      if (g.birdY >= CONFIG.height - 20 - g.birdSize.h) {
        g.birdY = CONFIG.height - 20 - g.birdSize.h;
        g.birdVelocity = 0;
      }

      // Pipes
      const { w: bW, h: bH } = g.birdSize;
      const birdLeft = 100,
        birdRight = 100 + bW;
      const birdTop = CONFIG.height - g.birdY - bH;
      const birdBottom = CONFIG.height - g.birdY;

      g.pipes.forEach((pipe) => {
        pipe.x -= g.pipeSpeed * dtFactor;
        const px = pipe.x,
          pr = pipe.x + 60;

        if (birdRight > px + 5 && birdLeft < pr - 5) {
          const inTop = birdTop < pipe.topH;
          const inBottom = birdBottom > CONFIG.height - pipe.bottomH;
          if (inTop || inBottom) {
            if (g.isPowered) {
              // Coin power: unlimited pipe crushing while active
              if (!pipe.crushed) {
                pipe.crushed = true;
                playCrush();
                setTimeout(() => {
                  pipe.crushed = false;
                }, 400);
              }
            } else if (g.bigMode) {
              // Mushroom immunity: ignore all hits for 1 second, no crush effect
            } else if (!pipe.crushed) {
              endGame();
              return;
            }
          }
        } else {
          pipe.crushed = false;
        }

        if (!pipe.passed && pipe.x < 80) {
          pipe.passed = true;
          g.score++;
          g.pipesPassedCount++;
          setUiScore(g.score);
          if (g.pipesPassedCount >= 20 && !g.pipesWiggling)
            g.pipesWiggling = true;
          if (g.pipesPassedCount % 5 === 0) g.pipeSpeed += 0.3;
        }
      });

      if (g.pipes.length > 0 && g.pipes[0].x < -100) {
        g.pipes.shift();
        makePipe(g.pipes[g.pipes.length - 1].x + 600);
      }

      // Coins
      g.coins = g.coins.filter((coin) => {
        if (coin.collected) return false;
        coin.x -= g.pipeSpeed * dtFactor;
        if (coin.x < -40) return false;
        const r = coin.radius;
        const cx = coin.x + r,
          cy2 = coin.y + r;
        const bCx = 100 + bW / 2,
          bCy = CONFIG.height - g.birdY - bH / 2;
        if (
          Math.abs(cx - bCx) < bW / 2 + r &&
          Math.abs(cy2 - bCy) < bH / 2 + r
        ) {
          coin.collected = true;
          g.score += coin.value;
          setUiScore(g.score);
          playOink();
          return false;
        }
        return true;
      });

      // Poison clouds
      g.poisons = g.poisons.filter((poison) => {
        poison.x -= g.pipeSpeed * dtFactor;
        if (poison.x + poison.r < 0) return false;
        const bCx = 100 + bW / 2;
        const bCy = CONFIG.height - g.birdY - bH / 2;
        const dist = Math.sqrt((bCx - poison.x) ** 2 + (bCy - poison.y) ** 2);
        if (dist < poison.r) {
          poison.contactTime++;
          if (poison.contactTime % 12 === 0) {
            g.score = Math.max(0, g.score - 1);
            setUiScore(g.score);
          }
        } else {
          poison.contactTime = 0;
        }
        return true;
      });

      // Mushrooms
      g.mushrooms = g.mushrooms.filter((m) => {
        m.x -= g.pipeSpeed * dtFactor;
        if (m.x < -60) return false;
        const mx = m.x + 18,
          my = m.y + 18;
        const bCx = 100 + bW / 2,
          bCy = CONFIG.height - g.birdY - bH / 2;
        if (
          Math.abs(mx - bCx) < bW / 2 + 18 &&
          Math.abs(my - bCy) < bH / 2 + 18
        ) {
          m.collected = true;
          activateMushroom();
          return false;
        }
        return true;
      });

      // Sync to multiplayer
      if (!solo && socketRef.current) {
        socketRef.current.send("player_update", {
          y: g.birdY,
          score: g.score,
          alive: true,
          powered: g.isPowered,
          bigMode: g.bigMode,
        });
      }

      draw();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [draw, solo],
  );

  function endGame() {
    const g = gameRef.current;
    if (g.over) return;
    g.over = true;
    g.started = false;
    if (g.gameLoop) clearInterval(g.gameLoop);
    if (g.powerTimer) clearTimeout(g.powerTimer);
    if (g.bigTimer) clearTimeout(g.bigTimer);
    g.isPowered = false;
    g.bigMode = false;
    g.birdSize = g.dinoMode ? { w: 30, h: 30 } : { w: 54, h: 46 };

    // Spawn death particles at pig position
    const bx = 100 + g.birdSize.w / 2;
    const by2 = CONFIG.height - g.birdY - g.birdSize.h / 2;
    spawnDeathParticles(bx, by2);
    playLose();

    // Save score
    fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, score: g.score }),
    });

    if (solo) {
      setGamePhase("dead");
      // Animate particles then show result
      g.animLoop = setInterval(() => draw(), 20);
      setTimeout(() => {
        if (g.animLoop) {
          clearInterval(g.animLoop);
          g.animLoop = null;
        }
        setResultData({
          winner: "",
          myWon: false,
          scores: [{ username, score: g.score }],
        });
        setGamePhase("result");
        draw();
      }, 1500);
    } else if (socketRef.current) {
      socketRef.current.send("player_died", { score: g.score });
      // Reset velocity so the pig falls from death position
      g.birdVelocity = 0;
      // Keep spectator loop alive so dead players can watch others
      // Also advance world state (pipes/cacti/items) so they keep scrolling
      if (g.animLoop) clearInterval(g.animLoop);
      let lastAnimMs = Date.now();
      g.animLoop = setInterval(() => {
        const now = Date.now();
        const dtf = Math.min(now - lastAnimMs, 80) / 20;
        lastAnimMs = now;
        const sg = gameRef.current;
        // Fall animation for dead player's pig
        if (!sg.dinoMode) {
          sg.birdVelocity -= 0.5;
          sg.birdY += sg.birdVelocity;
          if (sg.birdY < -80) sg.birdY = -80; // hold just below screen
        }
        if (sg.dinoMode) {
          for (const c of sg.cacti) c.x -= sg.pipeSpeed * dtf;
          sg.cacti = sg.cacti.filter((c) => c.x > -60);
          const lastC =
            sg.cacti.length > 0 ? sg.cacti[sg.cacti.length - 1] : null;
          if (!lastC || lastC.x < CONFIG.width - sg.dinoNextGap) {
            const height = 44 + Math.floor(Math.random() * 40);
            sg.cacti.push({ x: CONFIG.width + 60, height, passed: false });
            sg.dinoNextGap = 300 + Math.random() * 270;
          }
        } else {
          for (const pipe of sg.pipes) pipe.x -= sg.pipeSpeed * dtf;
          if (sg.pipes.length > 0 && sg.pipes[0].x < -100) {
            sg.pipes.shift();
            makePipe(sg.pipes[sg.pipes.length - 1].x + 600);
          }
          for (const poison of sg.poisons) poison.x -= sg.pipeSpeed * dtf;
          sg.poisons = sg.poisons.filter((p) => p.x + p.r > 0);
        }
        for (const coin of sg.coins) coin.x -= sg.pipeSpeed * dtf;
        sg.coins = sg.coins.filter((c) => c.x > -40);
        for (const m of sg.mushrooms) m.x -= sg.pipeSpeed * dtf;
        sg.mushrooms = sg.mushrooms.filter((m) => m.x > -60);
        draw();
      }, 20);
      setGamePhase("dead");
    }
  }

  function jump() {
    const g = gameRef.current;
    if (g.countdownActive) return;
    if (g.over || !g.started) return;
    if (g.dinoMode) {
      if (!g.dinoIsJumping) {
        g.dinoVelocity = 13; // positive = upward in flappy coords
        g.dinoIsJumping = true;
        playOink();
      }
    } else {
      g.birdVelocity = 9;
    }
  }

  function startGame() {
    const g = gameRef.current;
    g.over = false;
    g.score = 0;
    g.birdY = g.dinoMode ? g.dinoGroundY : 300;
    g.birdVelocity = 0;
    g.dinoVelocity = 0;
    g.dinoIsJumping = false;
    g.isPowered = false;
    g.bigMode = false;
    if (g.bigTimer) {
      clearTimeout(g.bigTimer);
      g.bigTimer = null;
    }
    if (g.powerTimer) {
      clearTimeout(g.powerTimer);
      g.powerTimer = null;
    }
    g.birdSize = g.dinoMode ? { w: 30, h: 30 } : { w: 54, h: 46 };
    g.pipesWiggling = false;
    g.pipeSpeed = g.initialSpeed; // use stored initialSpeed, not global CONFIG
    g.pipesPassedCount = 0;
    // Clear pipes, cacti, items
    g.pipes = [];
    g.cacti = [];
    g.coins = [];
    g.mushrooms = [];
    g.poisons = [];
    g.dinoNextGap = 450;
    // (Re-)initialize seeded RNG so all players get identical pipe sequence
    if (g.gameSeed) g.rng = mulberry32(g.gameSeed);
    g.deathParticles = [];
    g.winParticles = [];
    setUiScore(0);
    if (!g.dinoMode) initPipes(); // dino mode spawns cacti in tick
    g.started = true;
    g.lastTickMs = Date.now();
    if (g.gameLoop) clearInterval(g.gameLoop);
    g.gameLoop = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(now - g.lastTickMs, 80);
      g.lastTickMs = now;
      tick(dt / 20);
    }, 20);
    setGamePhase("playing");
  }

  function startCountdown(secs: number, onDone: () => void) {
    const g = gameRef.current;
    // Clear any previously running countdown (prevents double-run from StrictMode)
    if (g.countdownIv) {
      clearInterval(g.countdownIv);
      g.countdownIv = null;
    }
    if (g.countdownDrawIv) {
      clearInterval(g.countdownDrawIv);
      g.countdownDrawIv = null;
    }
    if (g.animLoop) {
      clearInterval(g.animLoop);
      g.animLoop = null;
    }
    // If no countdown time, start immediately
    if (secs <= 0) {
      g.countdownActive = false;
      onDone();
      return;
    }
    g.countdownActive = true;
    g.countdownVal = secs;
    setCountdown(secs);
    setGamePhase("countdown");
    g.countdownIv = setInterval(() => {
      g.countdownVal--;
      setCountdown(g.countdownVal);
      if (g.countdownVal <= 0) {
        if (g.countdownIv) clearInterval(g.countdownIv);
        g.countdownIv = null;
        g.countdownActive = false;
        onDone();
      }
    }, 1000);
    // keep drawing during countdown
    g.countdownDrawIv = setInterval(() => draw(), 50);
    setTimeout(
      () => {
        if (g.countdownDrawIv) clearInterval(g.countdownDrawIv);
        g.countdownDrawIv = null;
      },
      secs * 1000 + 200,
    );
  }

  // ── COLYSEUS (MULTIPLAYER) ────────────────────────────
  useEffect(() => {
    if (solo) return;
    let cancelled = false;

    const colyseusUrl =
      process.env.NEXT_PUBLIC_COLYSEUS_URL ||
      (() => {
        const port = parseInt(window.location.port, 10) || 80;
        const wsPort = port === 3000 ? 3001 : port + 1;
        const proto = window.location.protocol === "https:" ? "wss" : "ws";
        return `${proto}://${window.location.hostname}:${wsPort}`;
      })();

    const client = new ColyseusClient(colyseusUrl);

    client
      .joinOrCreate("flappy_room", {
        roomCode: roomId,
        username,
        pigColor,
        character,
        speed: initialSpeed || CONFIG.baseSpeed,
        password: password || "",
        gameMode: dinoMode ? "dino" : "flappy",
      })
      .then((room) => {
        if (cancelled) {
          room.leave();
          return;
        }
        socketRef.current = room;
        setSocketId(room.sessionId);

        // ── State sync via onStateChange ──
        room.onStateChange((rawState: unknown) => {
          const state = rawState as Record<string, unknown>;
          const playersMap = state.players as Map<
            string,
            Record<string, unknown>
          >;
          if (!playersMap || typeof playersMap.forEach !== "function") return;
          const allPlayers: PlayerState[] = [];
          playersMap.forEach(
            (player: Record<string, unknown>, sessionId: string) => {
              const p: PlayerState = {
                id: sessionId,
                username: player.username as string,
                y: player.y as number,
                score: player.score as number,
                alive: player.alive as boolean,
                powered: (player.powered as boolean) ?? false,
                bigMode: (player.bigMode as boolean) ?? false,
                pigColor: player.pigColor as string,
                character: player.character as string,
                slot: player.slot as number,
              };
              allPlayers.push(p);
              if (sessionId !== room.sessionId) {
                gameRef.current.opponents.set(sessionId, p);
              }
            },
          );
          // Remove opponents that left
          gameRef.current.opponents.forEach((_, id) => {
            if (!playersMap.has(id)) gameRef.current.opponents.delete(id);
          });
          setRoomPlayers(allPlayers);
          setIsHost((state.host as string) === room.sessionId);
          const speed = state.speed as number | undefined;
          if (speed !== undefined && speed !== gameRef.current.initialSpeed) {
            setRoomSpeed(speed);
            gameRef.current.initialSpeed = speed;
          }
        });

        // ── Messages ──
        room.onMessage(
          "game_start",
          ({
            countdown: cd,
            seed,
            speed,
          }: {
            countdown: number;
            seed?: number;
            speed?: number;
          }) => {
            if (seed !== undefined) gameRef.current.gameSeed = seed;
            if (speed !== undefined) gameRef.current.initialSpeed = speed;
            if (gameRef.current.started && !gameRef.current.over) return;
            setResultData(null);
            setRematchVotes(null);
            setHasVotedRematch(false);
            gameRef.current.deathParticles = [];
            gameRef.current.winParticles = [];
            startCountdown(cd, startGame);
          },
        );

        room.onMessage(
          "rematch_votes",
          ({ votes, total }: { votes: number; total: number }) => {
            setRematchVotes({ votes, total });
          },
        );

        room.onMessage("player_died", ({ id }: { id: string }) => {
          const op = gameRef.current.opponents.get(id);
          if (op) op.alive = false;
        });

        room.onMessage("player_left", ({ id }: { id: string }) => {
          gameRef.current.opponents.delete(id);
          setRoomPlayers((prev) => prev.filter((p) => p.id !== id));
        });

        room.onMessage(
          "room_reset",
          ({
            players,
            host,
            speed,
          }: {
            players: PlayerState[];
            host: string;
            speed?: number;
          }) => {
            setRoomPlayers(players);
            setIsHost(host === room.sessionId);
            if (speed !== undefined) setRoomSpeed(speed);
            gameRef.current.opponents.clear();
            players.forEach((p) => {
              if (p.id !== room.sessionId)
                gameRef.current.opponents.set(p.id, p);
            });
            setGamePhase("waiting");
            setResultData(null);
            setRematchVotes(null);
            setHasVotedRematch(false);
          },
        );

        room.onMessage(
          "last_survivor",
          ({ targetScore }: { targetScore: number }) => {
            setTargetScore(targetScore);
          },
        );

        room.onMessage(
          "game_over_result",
          ({
            winnerId,
            winnerName,
            scores,
          }: {
            winnerId: string;
            winnerName: string;
            scores: { id: string; username: string; score: number }[];
          }) => {
            const myWon = winnerId === room.sessionId;
            setTargetScore(null);
            const g2 = gameRef.current;
            if (g2.animLoop) {
              clearInterval(g2.animLoop);
              g2.animLoop = null;
            }
            if (myWon) {
              playWin();
              spawnWinParticles();
            }
            const animLoop = setInterval(() => draw(), 20);
            setTimeout(() => {
              clearInterval(animLoop);
              setResultData({
                winner: winnerName,
                myWon,
                scores: scores.map((s) => ({
                  username: s.username,
                  score: s.score,
                })),
              });
              setGamePhase("result");
              draw();
            }, 2000);
          },
        );

        room.onMessage("chat_message", (msg: ChatMsg) => {
          setChatMessages((prev) => [...prev, msg].slice(-100));
          setUnreadChat((n) => (showChatRef.current ? 0 : n + 1));
        });
        room.onMessage("chat_history", (msgs: ChatMsg[]) => {
          setChatMessages(msgs.slice(-100));
        });
      })
      .catch(() => {
        // Connection failed — will show in UI via missing socketId
      });

    return () => {
      cancelled = true;
      socketRef.current?.leave();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Solo: apply initialSpeed then start
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const g = gameRef.current;
    if (solo) {
      g.initialSpeed = initialSpeed || 3;
      t = setTimeout(() => startCountdown(5, startGame), 0);
    }
    return () => {
      if (t !== null) clearTimeout(t);
      if (g.gameLoop) {
        clearInterval(g.gameLoop);
        g.gameLoop = null;
      }
      if (g.countdownIv) {
        clearInterval(g.countdownIv);
        g.countdownIv = null;
      }
      if (g.countdownDrawIv) {
        clearInterval(g.countdownDrawIv);
        g.countdownDrawIv = null;
      }
      if (g.animLoop) {
        clearInterval(g.animLoop);
        g.animLoop = null;
      }
      g.started = false;
      g.over = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solo]);

  // Input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw loop when not in game loop
  useEffect(() => {
    const iv = setInterval(() => {
      if (!gameRef.current.started) draw();
    }, 50);
    return () => clearInterval(iv);
  }, [draw]);

  function handleRestart() {
    const g = gameRef.current;
    g.opponents.clear();
    g.deathParticles = [];
    g.winParticles = [];
    setResultData(null);
    if (solo) {
      startCountdown(5, startGame);
    } else {
      // Ask server to reset the room (host only; non-host button is hidden)
      socketRef.current?.send("request_room_reset");
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full px-1">
      {/* Scaled canvas wrapper */}
      <div
        style={{
          width: CONFIG.width * canvasScale,
          height: CONFIG.height * canvasScale,
          flexShrink: 0,
        }}
      >
        <div
          className="relative"
          style={{
            width: CONFIG.width,
            height: CONFIG.height,
            transform: `scale(${canvasScale})`,
            transformOrigin: "top left",
          }}
        >
          <canvas
            ref={canvasRef}
            width={CONFIG.width}
            height={CONFIG.height}
            className="rounded-xl shadow-2xl cursor-pointer select-none"
            style={{ border: "3px solid #e8829a", touchAction: "none" }}
            onPointerDown={(e) => {
              e.preventDefault();
              jump();
            }}
          />

          {/* Waiting for opponent / waiting room */}
          {gamePhase === "waiting" && !solo && (
            <div className="absolute inset-0 flex flex-col items-center justify-start rounded-xl bg-black/60 p-4 overflow-y-auto">
              <div className="text-4xl mb-2 mt-2">🐷</div>
              <h2 className="text-white text-2xl font-bold mb-1">
                Ruang Tunggu
              </h2>
              <p className="text-white/60 text-sm mb-4 font-mono">
                Room:{" "}
                <span className="text-yellow-300 font-bold">{roomId}</span>
              </p>

              {/* Player list */}
              <div className="bg-white/10 rounded-xl p-3 w-72 mb-4 max-h-64 overflow-y-auto">
                {roomPlayers.length === 0 ? (
                  <p className="text-white/40 text-xs text-center py-2">
                    Menghubungkan...
                  </p>
                ) : (
                  roomPlayers
                    .slice()
                    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
                    .map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 py-2 border-b border-white/10 last:border-0"
                      >
                        <span
                          className="inline-block w-6 h-6 rounded-full border-2 border-white/40 text-center text-xs leading-5"
                          style={{
                            backgroundColor:
                              PIG_COLOR_HEX[p.pigColor || "pink"],
                          }}
                        >
                          🐷
                        </span>
                        <span className="text-white font-semibold flex-1 truncate">
                          {p.username}
                        </span>
                        {(p.slot ?? 99) === 0 && (
                          <span className="text-yellow-300 text-xs font-bold bg-yellow-300/20 px-1.5 py-0.5 rounded">
                            HOST
                          </span>
                        )}
                      </div>
                    ))
                )}
                {roomPlayers.length > 0 && roomPlayers.length < 2 && (
                  <p className="text-white/40 text-xs text-center pt-2">
                    Menunggu pemain lain bergabung...
                  </p>
                )}
              </div>

              {/* Start / waiting indicator */}
              {isHost ? (
                <div className="flex flex-col items-center gap-3 w-72">
                  {/* Speed slider for host */}
                  <div className="bg-white/10 rounded-xl p-3 w-full">
                    <p className="text-white/70 text-xs mb-1">
                      ⚡ Kecepatan awal:{" "}
                      <span className="text-yellow-200 font-bold">
                        {roomSpeed}
                      </span>
                    </p>
                    <input
                      type="range"
                      min="1"
                      max="8"
                      step="0.5"
                      value={roomSpeed}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setRoomSpeed(v);
                        socketRef.current?.send("update_speed", { speed: v });
                      }}
                      className="w-full accent-pink-400"
                    />
                    <div className="flex justify-between text-white/40 text-xs mt-0.5">
                      <span>Pelan</span>
                      <span>Cepat</span>
                    </div>
                  </div>
                  <button
                    onClick={() => socketRef.current?.send("room_ready")}
                    disabled={roomPlayers.length < 2}
                    className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xl font-bold rounded-full shadow-lg transition active:scale-95"
                  >
                    ▶️ Mulai Game ({roomPlayers.length}/10)
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-white/50 text-sm">
                    ⚡ Kecepatan:{" "}
                    <span className="text-yellow-200 font-bold">
                      {roomSpeed}
                    </span>
                  </p>
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-3 h-3 rounded-full bg-pink-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.2}s` }}
                      />
                    ))}
                  </div>
                  <p className="text-white/70 text-sm">
                    Menunggu host memulai...
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Spectating banner when dead in multiplayer */}
          {gamePhase === "dead" && !solo && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 pointer-events-none z-10">
              <div className="flex items-center gap-2 bg-black/65 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg">
                <span className="animate-pulse">💀</span>
                <span>Kamu mati — menonton pemain lain...</span>
              </div>
            </div>
          )}

          {/* Last survivor banner */}
          {gamePhase === "playing" && targetScore !== null && !solo && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none">
              <div className="bg-yellow-400/90 text-gray-900 font-bold text-sm px-4 py-1.5 rounded-full shadow-lg animate-pulse whitespace-nowrap">
                🏆 Kamu tersisa! Kalahkan skor{" "}
                <span className="text-pink-700">{targetScore}</span> untuk
                menang!
              </div>
            </div>
          )}

          {/* Countdown overlay with player list */}
          {gamePhase === "countdown" && !solo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/60 pointer-events-none">
              <p className="text-white/70 text-sm mb-2">
                Game dimulai dalam...
              </p>
              <div
                className="text-yellow-300 font-extrabold drop-shadow-lg"
                style={{
                  fontSize: "140px",
                  lineHeight: 1,
                  textShadow: "0 0 30px #ff6347",
                }}
              >
                {countdown}
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-sm px-4">
                {roomPlayers
                  .slice()
                  .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
                  .map((p) => (
                    <span
                      key={p.id}
                      className="flex items-center gap-1 bg-white/15 px-2 py-1 rounded-full text-sm font-bold"
                      style={{
                        color: p.id === socketId ? "#ffd700" : "#fff",
                      }}
                    >
                      <span
                        className="inline-block w-3 h-3 rounded-full border border-white/40"
                        style={{
                          backgroundColor: PIG_COLOR_HEX[p.pigColor || "pink"],
                        }}
                      />
                      {p.username}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Result overlay */}
          {gamePhase === "result" && resultData && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/75 overflow-y-auto py-4">
              {resultData.myWon || solo ? (
                <div className="text-center mb-2">
                  <div className="text-7xl mb-1">{solo ? "🐷" : "🏆"}</div>
                  <h2 className="text-yellow-300 text-4xl font-bold drop-shadow-lg">
                    {solo ? "Game Over!" : "MENANG! 🎉"}
                  </h2>
                </div>
              ) : (
                <div className="text-center mb-2">
                  <div className="text-7xl mb-1">💀</div>
                  <h2 className="text-red-400 text-4xl font-bold drop-shadow-lg">
                    KALAH!
                  </h2>
                  {resultData.winner && (
                    <p className="text-white text-base mt-1">
                      Pemenang:{" "}
                      <span className="text-yellow-300 font-bold">
                        {resultData.winner}
                      </span>
                    </p>
                  )}
                </div>
              )}

              {/* Score table */}
              <div className="bg-white/10 rounded-xl p-3 w-72 mb-3">
                <p className="text-white/60 text-xs text-center mb-2 font-bold tracking-widest">
                  SKOR AKHIR
                </p>
                {resultData.scores
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 py-1.5 border-b border-white/15 last:border-0"
                    >
                      <span className="text-base w-5 text-center">
                        {i === 0
                          ? "🥇"
                          : i === 1
                            ? "🥈"
                            : i === 2
                              ? "🥉"
                              : `${i + 1}.`}
                      </span>
                      <span
                        className="inline-block w-3 h-3 rounded-full border border-white/30 shrink-0"
                        style={{
                          backgroundColor:
                            PIG_COLOR_HEX[
                              roomPlayers.find(
                                (rp) => rp.username === s.username,
                              )?.pigColor || "pink"
                            ] || "#ffc8d8",
                        }}
                      />
                      <span
                        className={`flex-1 font-semibold truncate text-sm ${
                          s.username === username
                            ? "text-yellow-300"
                            : "text-white"
                        }`}
                      >
                        {s.username}
                      </span>
                      <span className="text-yellow-300 font-bold text-sm">
                        {s.score}
                      </span>
                    </div>
                  ))}
              </div>

              {/* Restart / rematch actions */}
              {solo ? (
                <button
                  onClick={handleRestart}
                  className="px-8 py-3 bg-pink-500 hover:bg-pink-400 text-white text-lg font-bold rounded-full shadow-lg transition active:scale-95"
                >
                  🔄 Main Lagi
                </button>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={() => {
                      if (hasVotedRematch) return;
                      setHasVotedRematch(true);
                      socketRef.current?.send("vote_rematch");
                    }}
                    disabled={hasVotedRematch}
                    className="px-8 py-3 bg-green-500 hover:bg-green-400 disabled:bg-green-700 disabled:cursor-not-allowed text-white text-lg font-bold rounded-full shadow-lg transition active:scale-95"
                  >
                    {hasVotedRematch ? "✅ Siap Rematch!" : "🔄 Rematch"}
                  </button>
                  {rematchVotes && (
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex gap-1.5">
                        {Array.from({ length: rematchVotes.total }, (_, i) => (
                          <div
                            key={i}
                            className={`w-3 h-3 rounded-full transition-colors ${
                              i < rematchVotes.votes
                                ? "bg-green-400"
                                : "bg-white/25"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-white/70 text-sm">
                        {rematchVotes.votes}/{rematchVotes.total} pemain siap
                      </p>
                    </div>
                  )}
                  {!rematchVotes && (
                    <p className="text-white/40 text-xs">
                      Semua pemain harus siap untuk rematch
                    </p>
                  )}
                </div>
              )}

              <a
                href="/lobby"
                className="mt-2 text-xs text-white/40 hover:text-white underline"
              >
                Keluar ke Lobby
              </a>
              <a
                href="/leaderboard"
                className="mt-1 text-xs text-white/40 hover:text-white underline"
              >
                🏆 Lihat Leaderboard
              </a>
            </div>
          )}
        </div>
        {/* end inner scale div */}
      </div>
      {/* end outer size div */}

      {/* Bottom bar: speed + chat toggle */}
      <div
        className="flex items-center gap-2 bg-white/20 backdrop-blur px-4 py-2 rounded-full text-white font-bold shadow"
        style={{ width: CONFIG.width * canvasScale, maxWidth: "100%" }}
      >
        <span className="text-sm flex-1">⚡ Kecepatan: {roomSpeed}</span>
        {!solo && (
          <button
            onClick={() => {
              setShowChat((v) => !v);
              if (!showChat) setUnreadChat(0);
            }}
            className="relative flex items-center gap-1 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-sm transition active:scale-95"
          >
            💬
            {unreadChat > 0 && !showChat && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center">
                {unreadChat > 9 ? "9+" : unreadChat}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Chat panel (multiplayer only) */}
      {!solo && showChat && (
        <div
          className="flex flex-col bg-white/15 backdrop-blur rounded-2xl shadow-xl overflow-hidden"
          style={{
            width: CONFIG.width * canvasScale,
            maxWidth: "100%",
            maxHeight: 260,
          }}
        >
          {/* Message list */}
          <div
            className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5"
            style={{ minHeight: 0, maxHeight: 200 }}
          >
            {chatMessages.length === 0 ? (
              <p className="text-white/40 text-xs text-center py-4">
                Belum ada pesan. Sapa pemain lain!
              </p>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-1.5 text-sm">
                  <span
                    className="mt-0.5 shrink-0 inline-block w-2.5 h-2.5 rounded-full border border-white/30"
                    style={{
                      backgroundColor: PIG_COLOR_HEX[msg.pigColor] || "#ffc8d8",
                    }}
                  />
                  <span
                    className="font-bold shrink-0"
                    style={{
                      color: msg.username === username ? "#ffd700" : "#fff",
                    }}
                  >
                    {msg.username}:
                  </span>
                  <span className="text-white/90 break-words min-w-0">
                    {msg.text}
                  </span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          {/* Input */}
          <div className="flex gap-2 px-3 py-2 border-t border-white/20 bg-black/10">
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
              className="flex-1 bg-white/20 text-white placeholder-white/40 rounded-xl px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-pink-300 min-w-0"
            />
            <button
              onClick={sendChat}
              disabled={!chatInput.trim()}
              className="px-3 py-1.5 bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition active:scale-95 shrink-0"
            >
              Kirim
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
