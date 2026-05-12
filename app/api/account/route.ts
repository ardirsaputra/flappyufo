import { NextResponse } from "next/server";
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, userId, oldPassword, newPassword, password, character, pigColor } = body;

    if (!userId) return NextResponse.json({ error: "User tidak valid" }, { status: 400 });

    if (action === "change_password") {
      const result = await pool.query(
        "SELECT password_hash FROM users WHERE id=$1",
        [userId],
      );
      if (result.rows.length === 0)
        return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });

      if (!verifyPassword(String(oldPassword || ""), result.rows[0].password_hash))
        return NextResponse.json({ error: "Password lama salah" }, { status: 401 });

      const trimmed = String(newPassword || "").trim();
      if (trimmed.length < 4)
        return NextResponse.json({ error: "Password baru minimal 4 karakter" }, { status: 400 });

      await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        hashPassword(trimmed),
        userId,
      ]);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (action === "delete_account") {
      const result = await pool.query(
        "SELECT password_hash FROM users WHERE id=$1",
        [userId],
      );
      if (result.rows.length === 0)
        return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 });

      if (
        result.rows[0].password_hash &&
        !verifyPassword(String(password || ""), result.rows[0].password_hash)
      )
        return NextResponse.json({ error: "Password salah" }, { status: 401 });

      await pool.query("DELETE FROM users WHERE id=$1", [userId]);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (action === "update_profile") {
      if (!character && !pigColor) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      
      const updates = [];
      const values = [];
      let idx = 1;
      
      if (character) {
        updates.push(`character=$${idx++}`);
        values.push(character);
      }
      if (pigColor) {
        updates.push(`pig_color=$${idx++}`);
        values.push(pigColor);
      }
      
      values.push(userId);
      await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id=$${idx}`, values);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
