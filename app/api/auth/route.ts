import { NextResponse } from "next/server";
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

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return (forwarded || "").split(",")[0].trim();
}

export async function POST(req: Request) {
  await initDB();

  const body = await req.json().catch(() => ({}));
  const { action, username, password, deviceId, character, pigColor } = body as {
    action?: "register" | "login";
    username?: string;
    password?: string;
    deviceId?: string;
    character?: string;
    pigColor?: string;
  };

  const clean = String(username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  if (!clean || clean.length < 2)
    return NextResponse.json({ error: "Username minimal 2 karakter" }, { status: 400 });

  const pwd = String(password || "").trim();
  if (!pwd || pwd.length < 4)
    return NextResponse.json({ error: "Password minimal 4 karakter" }, { status: 400 });

  const ip = getClientIp(req);

  try {
    // Check if device is blocked
    if (deviceId) {
      const blocked = await pool.query(
        "SELECT id FROM blocked_devices WHERE device_id=$1 LIMIT 1",
        [deviceId],
      );
      if (blocked.rows.length > 0)
        return NextResponse.json({ error: "Perangkat ini diblokir. Hubungi admin." }, { status: 403 });
    }

    if (action === "register") {
      const existing = await pool.query("SELECT id FROM users WHERE username=$1", [clean]);
      if (existing.rows.length > 0)
        return NextResponse.json({ error: "Username sudah digunakan" }, { status: 400 });

      const passwordHash = hashPassword(pwd);
      const isAdmin = clean === "admin";
      const result = await pool.query(
        `INSERT INTO users (username, password_hash, is_admin, last_device_id, last_ip, character, pig_color)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, username, character, pig_color, is_admin`,
        [clean, passwordHash, isAdmin, deviceId || null, ip || null, character || "pig", pigColor || "pink"],
      );
      return NextResponse.json({ user: result.rows[0] }, { status: 201 });
    }

    if (action === "login") {
      const result = await pool.query(
        "SELECT id, username, password_hash, character, pig_color, is_admin FROM users WHERE username=$1",
        [clean],
      );
      if (result.rows.length === 0)
        return NextResponse.json({ error: "Username tidak ditemukan" }, { status: 401 });

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
        return NextResponse.json({
          user: {
            id: user.id,
            username: user.username,
            character: user.character || "pig",
            pig_color: user.pig_color || "pink",
            is_admin: user.is_admin || false,
          },
        }, { status: 200 });
      }

      if (!verifyPassword(pwd, user.password_hash))
        return NextResponse.json({ error: "Password salah" }, { status: 401 });

      await pool.query(
        "UPDATE users SET last_device_id=$1, last_ip=$2 WHERE id=$3",
        [deviceId || null, ip || null, user.id],
      );

      return NextResponse.json({
        user: {
          id: user.id,
          username: user.username,
          character: user.character || "pig",
          pig_color: user.pig_color || "pink",
          is_admin: user.is_admin || false,
        },
      }, { status: 200 });
    }

    return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
