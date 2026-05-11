import type { NextApiRequest, NextApiResponse } from "next";
import { pool, initDB } from "@/lib/db";

async function verifyUser(userId: number, username: string): Promise<boolean> {
  const res = await pool.query(
    "SELECT id FROM users WHERE id=$1 AND username=$2",
    [userId, String(username).toLowerCase()],
  );
  return res.rows.length > 0;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await initDB();

  // ── GET ─────────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { id, my, userId } = req.query;

    // Single discussion with comments
    if (id) {
      const disc = await pool.query(
        "SELECT id, user_id, username, title, content, created_at, updated_at FROM discussions WHERE id=$1",
        [id],
      );
      if (disc.rows.length === 0)
        return res.status(404).json({ error: "Tidak ditemukan" });

      const comments = await pool.query(
        `SELECT id, user_id, username, content, created_at, updated_at
         FROM discussion_comments WHERE discussion_id=$1 ORDER BY created_at ASC`,
        [id],
      );
      return res.json({ discussion: disc.rows[0], comments: comments.rows });
    }

    // My discussions
    if (my && userId) {
      const result = await pool.query(
        `SELECT d.id, d.username, d.title, d.content, d.created_at, d.updated_at,
                COUNT(c.id)::int AS comment_count
         FROM discussions d
         LEFT JOIN discussion_comments c ON c.discussion_id = d.id
         WHERE d.user_id = $1
         GROUP BY d.id ORDER BY d.updated_at DESC LIMIT 50`,
        [userId],
      );
      return res.json({ discussions: result.rows });
    }

    // List all discussions (paginated, newest first)
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = 20;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT d.id, d.user_id, d.username, d.title, d.content, d.created_at, d.updated_at,
              COUNT(c.id)::int AS comment_count
       FROM discussions d
       LEFT JOIN discussion_comments c ON c.discussion_id = d.id
       GROUP BY d.id ORDER BY d.updated_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    const countRes = await pool.query(
      "SELECT COUNT(*)::int AS total FROM discussions",
    );
    return res.json({
      discussions: result.rows,
      total: countRes.rows[0].total,
      page,
      limit,
    });
  }

  // ── POST ────────────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const { action, userId, username, title, content, discussionId } =
      req.body as {
        action: string;
        userId: number;
        username: string;
        title?: string;
        content: string;
        discussionId?: number;
      };

    if (!userId || !username)
      return res.status(401).json({ error: "Tidak terautentikasi" });
    if (!(await verifyUser(userId, username)))
      return res.status(403).json({ error: "Akses ditolak" });

    if (action === "create_discussion") {
      const t = String(title || "")
        .trim()
        .slice(0, 200);
      const c = String(content || "")
        .trim()
        .slice(0, 5000);
      if (!t)
        return res.status(400).json({ error: "Judul tidak boleh kosong" });
      if (!c)
        return res.status(400).json({ error: "Konten tidak boleh kosong" });

      const result = await pool.query(
        `INSERT INTO discussions (user_id, username, title, content) VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, username, title, content, created_at, updated_at`,
        [userId, String(username).toLowerCase(), t, c],
      );
      return res.status(201).json({ discussion: result.rows[0] });
    }

    if (action === "create_comment") {
      if (!discussionId)
        return res.status(400).json({ error: "discussionId diperlukan" });
      const c = String(content || "")
        .trim()
        .slice(0, 2000);
      if (!c)
        return res.status(400).json({ error: "Komentar tidak boleh kosong" });

      // Check discussion exists
      const disc = await pool.query("SELECT id FROM discussions WHERE id=$1", [
        discussionId,
      ]);
      if (disc.rows.length === 0)
        return res.status(404).json({ error: "Diskusi tidak ditemukan" });

      // Update discussion updated_at
      await pool.query("UPDATE discussions SET updated_at=NOW() WHERE id=$1", [
        discussionId,
      ]);

      const result = await pool.query(
        `INSERT INTO discussion_comments (discussion_id, user_id, username, content)
         VALUES ($1, $2, $3, $4)
         RETURNING id, discussion_id, user_id, username, content, created_at, updated_at`,
        [discussionId, userId, String(username).toLowerCase(), c],
      );
      return res.status(201).json({ comment: result.rows[0] });
    }

    return res.status(400).json({ error: "Action tidak dikenal" });
  }

  // ── PUT ─────────────────────────────────────────────────────────────────
  if (req.method === "PUT") {
    const { action, userId, username, id, title, content } = req.body as {
      action: string;
      userId: number;
      username: string;
      id: number;
      title?: string;
      content?: string;
    };

    if (!userId || !username)
      return res.status(401).json({ error: "Tidak terautentikasi" });
    if (!(await verifyUser(userId, username)))
      return res.status(403).json({ error: "Akses ditolak" });

    if (action === "edit_discussion") {
      const disc = await pool.query(
        "SELECT user_id FROM discussions WHERE id=$1",
        [id],
      );
      if (disc.rows.length === 0)
        return res.status(404).json({ error: "Tidak ditemukan" });
      if (disc.rows[0].user_id !== Number(userId))
        return res.status(403).json({ error: "Bukan milikmu" });

      const t = title ? String(title).trim().slice(0, 200) : null;
      const c = content ? String(content).trim().slice(0, 5000) : null;

      const result = await pool.query(
        `UPDATE discussions SET
           title = COALESCE($1, title),
           content = COALESCE($2, content),
           updated_at = NOW()
         WHERE id = $3
         RETURNING id, username, title, content, created_at, updated_at`,
        [t || null, c || null, id],
      );
      return res.json({ discussion: result.rows[0] });
    }

    if (action === "edit_comment") {
      const comment = await pool.query(
        "SELECT user_id FROM discussion_comments WHERE id=$1",
        [id],
      );
      if (comment.rows.length === 0)
        return res.status(404).json({ error: "Tidak ditemukan" });
      if (comment.rows[0].user_id !== Number(userId))
        return res.status(403).json({ error: "Bukan milikmu" });

      const c = content ? String(content).trim().slice(0, 2000) : null;
      if (!c)
        return res.status(400).json({ error: "Konten tidak boleh kosong" });

      const result = await pool.query(
        `UPDATE discussion_comments SET content=$1, updated_at=NOW() WHERE id=$2
         RETURNING id, username, content, created_at, updated_at`,
        [c, id],
      );
      return res.json({ comment: result.rows[0] });
    }

    return res.status(400).json({ error: "Action tidak dikenal" });
  }

  // ── DELETE ──────────────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const { action, userId, username, id } = req.body as {
      action: string;
      userId: number;
      username: string;
      id: number;
    };

    if (!userId || !username)
      return res.status(401).json({ error: "Tidak terautentikasi" });
    if (!(await verifyUser(userId, username)))
      return res.status(403).json({ error: "Akses ditolak" });

    if (action === "delete_discussion") {
      const disc = await pool.query(
        "SELECT user_id FROM discussions WHERE id=$1",
        [id],
      );
      if (disc.rows.length === 0)
        return res.status(404).json({ error: "Tidak ditemukan" });
      if (disc.rows[0].user_id !== Number(userId))
        return res.status(403).json({ error: "Bukan milikmu" });

      await pool.query("DELETE FROM discussions WHERE id=$1", [id]);
      return res.json({ ok: true });
    }

    if (action === "delete_comment") {
      const comment = await pool.query(
        "SELECT user_id FROM discussion_comments WHERE id=$1",
        [id],
      );
      if (comment.rows.length === 0)
        return res.status(404).json({ error: "Tidak ditemukan" });
      if (comment.rows[0].user_id !== Number(userId))
        return res.status(403).json({ error: "Bukan milikmu" });

      await pool.query("DELETE FROM discussion_comments WHERE id=$1", [id]);
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "Action tidak dikenal" });
  }

  return res.status(405).end();
}
