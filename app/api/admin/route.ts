import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

async function isAdmin(userId: number): Promise<boolean> {
  const r = await pool.query("SELECT is_admin FROM users WHERE id=$1", [userId]);
  return r.rows[0]?.is_admin === true;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, adminId } = body;

    if (!adminId) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
    if (!(await isAdmin(adminId))) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });

    if (action === "list_users") {
      const r = await pool.query(
        `SELECT id, username, character, pig_color, is_admin, last_device_id, last_ip, created_at
         FROM users ORDER BY created_at DESC`,
      );
      return NextResponse.json({ users: r.rows }, { status: 200 });
    }

    if (action === "delete_user") {
      const { targetId } = body;
      if (!targetId) return NextResponse.json({ error: "targetId diperlukan" }, { status: 400 });
      await pool.query("DELETE FROM users WHERE id=$1 AND is_admin=FALSE", [targetId]);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (action === "block_device") {
      const { deviceId, ip, reason, targetUsername } = body;
      if (!deviceId && !ip) return NextResponse.json({ error: "deviceId atau ip diperlukan" }, { status: 400 });
      const adminUser = await pool.query("SELECT username FROM users WHERE id=$1", [adminId]);
      const blockedBy = adminUser.rows[0]?.username || "admin";
      await pool.query(
        "INSERT INTO blocked_devices (device_id, ip, reason, blocked_by) VALUES ($1, $2, $3, $4)",
        [deviceId || null, ip || null, reason || `Diblokir dari akun ${targetUsername || ""}`, blockedBy],
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (action === "list_blocked") {
      const r = await pool.query(
        "SELECT id, device_id, ip, reason, blocked_by, created_at FROM blocked_devices ORDER BY created_at DESC",
      );
      return NextResponse.json({ blocked: r.rows }, { status: 200 });
    }

    if (action === "unblock_device") {
      const { blockId } = body;
      if (!blockId) return NextResponse.json({ error: "blockId diperlukan" }, { status: 400 });
      await pool.query("DELETE FROM blocked_devices WHERE id=$1", [blockId]);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ error: "Action tidak valid" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
