import { NextResponse } from "next/server";
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

export async function POST(req: Request) {
  try {
    const { userId, score, gameKey } = await req.json();
    if (!userId || score === undefined) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    const normalizedGameKey = normalizeGameKey(gameKey);
    await pool.query(
      "INSERT INTO scores (user_id, score, game_key) VALUES ($1, $2, $3)",
      [userId, score, normalizedGameKey],
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
