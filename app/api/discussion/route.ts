import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parent_id = searchParams.get("parent_id");
    if (parent_id) {
      // Fetch replies for a specific discussion
      const id = parseInt(parent_id, 10);
      if (isNaN(id)) return NextResponse.json({ error: "Invalid parent_id" }, { status: 400 });
      const { rows } = await pool.query(
        `SELECT id, user_id, username, pig_color, content, parent_id, created_at
         FROM discussions WHERE parent_id = $1 ORDER BY created_at ASC`,
        [id],
      );
      return NextResponse.json({ replies: rows }, { status: 200 });
    }
    // Fetch top-level discussions (no parent) with reply counts
    const { rows } = await pool.query(
      `SELECT d.id, d.user_id, d.username, d.pig_color, d.content, d.created_at,
              COUNT(r.id)::int AS reply_count
       FROM discussions d
       LEFT JOIN discussions r ON r.parent_id = d.id
       WHERE d.parent_id IS NULL
       GROUP BY d.id
       ORDER BY d.created_at DESC
       LIMIT 100`,
    );
    return NextResponse.json({ discussions: rows }, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_id, username, pig_color, content, parent_id } = body;

    if (!user_id || !username || !content?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (content.trim().length > 1000) {
      return NextResponse.json({ error: "Content too long (max 1000 chars)" }, { status: 400 });
    }

    const { rows } = await pool.query(
      `INSERT INTO discussions (user_id, username, pig_color, content, parent_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, username, pig_color, content, parent_id, created_at`,
      [user_id, username, pig_color || "pink", content.trim(), parent_id ?? null],
    );
    return NextResponse.json({ discussion: rows[0] }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { id, user_id } = body;
    if (!id || !user_id) return NextResponse.json({ error: "Missing id or user_id" }, { status: 400 });
    const { rowCount } = await pool.query(
      `DELETE FROM discussions WHERE id = $1 AND user_id = $2`,
      [id, user_id],
    );
    if (!rowCount) return NextResponse.json({ error: "Not found or not authorized" }, { status: 403 });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
