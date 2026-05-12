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

function normalizeGameKey(input: unknown): string | null {
  const raw = String(input || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  return ALLOWED_GAME_KEYS.has(raw) ? raw : null;
}

function normalizeLimit(input: unknown): number {
  const value = Number.parseInt(String(input || "20"), 10);
  if (!Number.isFinite(value)) return 20;
  return Math.min(50, Math.max(1, value));
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const gameKey = normalizeGameKey(searchParams.get("game"));
    const limit = normalizeLimit(searchParams.get("limit"));
    const whereClause = gameKey ? "WHERE s.game_key = $1" : "";
    const values = gameKey ? [gameKey, limit] : [limit];
    const limitParam = gameKey ? "$2" : "$1";

    const result = await pool.query(
      `
      SELECT u.username, MAX(s.score) AS best_score, COUNT(s.id) AS games_played
      FROM users u
      JOIN scores s ON u.id = s.user_id
      ${whereClause}
      GROUP BY u.id, u.username
      ORDER BY best_score DESC
      LIMIT ${limitParam}
    `,
      values,
    );
    return NextResponse.json({ leaderboard: result.rows, gameKey });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
