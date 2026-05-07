import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    const inputHash = scryptSync(password, salt, 64).toString("hex");
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(inputHash, "hex"));
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { action, userId, oldPassword, newPassword, password } = req.body as {
    action: string;
    userId: number;
    oldPassword?: string;
    newPassword?: string;
    password?: string;
  };

  if (!userId) return res.status(400).json({ error: "User tidak valid" });

  try {
    if (action === "change_password") {
      const result = await pool.query(
        "SELECT password_hash FROM users WHERE id=$1",
        [userId],
      );
      if (result.rows.length === 0)
        return res.status(404).json({ error: "User tidak ditemukan" });

      if (!verifyPassword(String(oldPassword || ""), result.rows[0].password_hash))
        return res.status(401).json({ error: "Password lama salah" });

      const trimmed = String(newPassword || "").trim();
      if (trimmed.length < 4)
        return res.status(400).json({ error: "Password baru minimal 4 karakter" });

      await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        hashPassword(trimmed),
        userId,
      ]);
      return res.status(200).json({ ok: true });
    }

    if (action === "delete_account") {
      const result = await pool.query(
        "SELECT password_hash FROM users WHERE id=$1",
        [userId],
      );
      if (result.rows.length === 0)
        return res.status(404).json({ error: "User tidak ditemukan" });

      if (
        result.rows[0].password_hash &&
        !verifyPassword(String(password || ""), result.rows[0].password_hash)
      )
        return res.status(401).json({ error: "Password salah" });

      await pool.query("DELETE FROM users WHERE id=$1", [userId]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Action tidak valid" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
}
