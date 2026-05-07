import type { NextApiRequest, NextApiResponse } from "next";
import { pool, initDB } from "@/lib/db";
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

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (raw || req.socket?.remoteAddress || "").split(",")[0].trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await initDB();
  if (req.method !== "POST") return res.status(405).end();

  const { action, username, password, deviceId } = req.body as {
    action: "register" | "login";
    username: string;
    password: string;
    deviceId?: string;
  };

  const clean = String(username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  if (!clean || clean.length < 2)
    return res.status(400).json({ error: "Username minimal 2 karakter" });

  const pwd = String(password || "").trim();
  if (!pwd || pwd.length < 4)
    return res.status(400).json({ error: "Password minimal 4 karakter" });

  const ip = getClientIp(req);

  try {
    // Check if device is blocked
    if (deviceId) {
      const blocked = await pool.query(
        "SELECT id FROM blocked_devices WHERE device_id=$1 LIMIT 1",
        [deviceId],
      );
      if (blocked.rows.length > 0)
        return res.status(403).json({ error: "Perangkat ini diblokir. Hubungi admin." });
    }

    if (action === "register") {
      const existing = await pool.query("SELECT id FROM users WHERE username=$1", [clean]);
      if (existing.rows.length > 0)
        return res.status(400).json({ error: "Username sudah digunakan" });

      const passwordHash = hashPassword(pwd);
      const isAdmin = clean === "admin";
      const result = await pool.query(
        `INSERT INTO users (username, password_hash, is_admin, last_device_id, last_ip)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, character, pig_color, is_admin`,
        [clean, passwordHash, isAdmin, deviceId || null, ip || null],
      );
      return res.status(201).json({ user: result.rows[0] });
    }

    if (action === "login") {
      const result = await pool.query(
        "SELECT id, username, password_hash, character, pig_color, is_admin FROM users WHERE username=$1",
        [clean],
      );
      if (result.rows.length === 0)
        return res.status(401).json({ error: "Username tidak ditemukan" });

      const user = result.rows[0];

      // Ensure "admin" always has is_admin = true (migration helper)
      if (clean === "admin" && !user.is_admin) {
        await pool.query("UPDATE users SET is_admin=TRUE WHERE id=$1", [user.id]);
        user.is_admin = true;
      }

      // Legacy accounts without password: set their password on first login
      if (!user.password_hash) {
        const passwordHash = hashPassword(pwd);
        await pool.query(
          "UPDATE users SET password_hash=$1, last_device_id=$2, last_ip=$3 WHERE id=$4",
          [passwordHash, deviceId || null, ip || null, user.id],
        );
        return res.status(200).json({
          user: {
            id: user.id,
            username: user.username,
            character: user.character || "pig",
            pig_color: user.pig_color || "pink",
            is_admin: user.is_admin || false,
          },
        });
      }

      if (!verifyPassword(pwd, user.password_hash))
        return res.status(401).json({ error: "Password salah" });

      await pool.query(
        "UPDATE users SET last_device_id=$1, last_ip=$2 WHERE id=$3",
        [deviceId || null, ip || null, user.id],
      );

      return res.status(200).json({
        user: {
          id: user.id,
          username: user.username,
          character: user.character || "pig",
          pig_color: user.pig_color || "pink",
          is_admin: user.is_admin || false,
        },
      });
    }

    return res.status(400).json({ error: "Action tidak valid" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
}
