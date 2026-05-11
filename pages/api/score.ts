import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

const ALLOWED_GAME_KEYS = new Set([
  "flappy_solo",
  "baby_solo",
  "egg_solo",
  "flappy_multi",
  "baby_multi",
  "egg_multi",
]);

function normalizeGameKey(input: unknown): string {
  const key = String(input || "flappy_solo")
    .trim()
    .toLowerCase();
  return ALLOWED_GAME_KEYS.has(key) ? key : "flappy_solo";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "POST") {
    const { userId, score, gameKey } = req.body as {
      userId: number;
      score: number;
      gameKey?: string;
    };
    if (!userId || score === undefined)
      return res.status(400).json({ error: "Missing fields" });
    try {
      const normalizedGameKey = normalizeGameKey(gameKey);
      await pool.query(
        "INSERT INTO scores (user_id, score, game_key) VALUES ($1, $2, $3)",
        [userId, score, normalizedGameKey],
      );
      return res.status(201).json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Server error" });
    }
  }
  return res.status(405).end();
}
