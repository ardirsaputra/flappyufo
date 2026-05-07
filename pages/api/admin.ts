import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

async function isAdmin(userId: number): Promise<boolean> {
  const r = await pool.query("SELECT is_admin FROM users WHERE id=$1", [userId]);
  return r.rows[0]?.is_admin === true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { action, adminId } = req.body as { action: string; adminId: number };

  if (!adminId) return res.status(401).json({ error: "Tidak terautentikasi" });
  if (!(await isAdmin(adminId))) return res.status(403).json({ error: "Akses ditolak" });

  try {
    if (action === "list_users") {
      const r = await pool.query(
        `SELECT id, username, character, pig_color, is_admin, last_device_id, last_ip, created_at
         FROM users ORDER BY created_at DESC`,
      );
      return res.status(200).json({ users: r.rows });
    }

    if (action === "delete_user") {
      const { targetId } = req.body as { targetId: number };
      if (!targetId) return res.status(400).json({ error: "targetId diperlukan" });
      await pool.query("DELETE FROM users WHERE id=$1 AND is_admin=FALSE", [targetId]);
      return res.status(200).json({ ok: true });
    }

    if (action === "block_device") {
      const { deviceId, ip, reason, targetUsername } = req.body as {
        deviceId?: string;
        ip?: string;
        reason?: string;
        targetUsername?: string;
      };
      if (!deviceId && !ip) return res.status(400).json({ error: "deviceId atau ip diperlukan" });
      const adminUser = await pool.query("SELECT username FROM users WHERE id=$1", [adminId]);
      const blockedBy = adminUser.rows[0]?.username || "admin";
      await pool.query(
        "INSERT INTO blocked_devices (device_id, ip, reason, blocked_by) VALUES ($1, $2, $3, $4)",
        [deviceId || null, ip || null, reason || `Diblokir dari akun ${targetUsername || ""}`, blockedBy],
      );
      return res.status(200).json({ ok: true });
    }

    if (action === "list_blocked") {
      const r = await pool.query(
        "SELECT id, device_id, ip, reason, blocked_by, created_at FROM blocked_devices ORDER BY created_at DESC",
      );
      return res.status(200).json({ blocked: r.rows });
    }

    if (action === "unblock_device") {
      const { blockId } = req.body as { blockId: number };
      if (!blockId) return res.status(400).json({ error: "blockId diperlukan" });
      await pool.query("DELETE FROM blocked_devices WHERE id=$1", [blockId]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Action tidak valid" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
}
