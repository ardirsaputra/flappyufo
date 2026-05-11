import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    const { parent_id } = req.query;
    if (parent_id) {
      // Fetch replies for a specific discussion
      const id = parseInt(parent_id as string, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid parent_id" });
      const { rows } = await pool.query(
        `SELECT id, user_id, username, pig_color, content, parent_id, created_at
         FROM discussions WHERE parent_id = $1 ORDER BY created_at ASC`,
        [id],
      );
      return res.status(200).json({ replies: rows });
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
    return res.status(200).json({ discussions: rows });
  }

  if (req.method === "POST") {
    const { user_id, username, pig_color, content, parent_id } = req.body as {
      user_id: number;
      username: string;
      pig_color?: string;
      content: string;
      parent_id?: number | null;
    };

    if (!user_id || !username || !content?.trim()) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (content.trim().length > 1000) {
      return res.status(400).json({ error: "Content too long (max 1000 chars)" });
    }

    const { rows } = await pool.query(
      `INSERT INTO discussions (user_id, username, pig_color, content, parent_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, username, pig_color, content, parent_id, created_at`,
      [user_id, username, pig_color || "pink", content.trim(), parent_id ?? null],
    );
    return res.status(201).json({ discussion: rows[0] });
  }

  if (req.method === "DELETE") {
    const { id, user_id } = req.body as { id: number; user_id: number };
    if (!id || !user_id) return res.status(400).json({ error: "Missing id or user_id" });
    const { rowCount } = await pool.query(
      `DELETE FROM discussions WHERE id = $1 AND user_id = $2`,
      [id, user_id],
    );
    if (!rowCount) return res.status(403).json({ error: "Not found or not authorized" });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]);
  res.status(405).end();
}
