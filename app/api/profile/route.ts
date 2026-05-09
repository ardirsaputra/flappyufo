import { NextResponse } from "next/server";
import { pool, initDB } from "@/lib/db";
import { auth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  await initDB();

  const { data: session } = await auth.getSession();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const neonAuthUserId = session.user.id;

  const result = await pool.query(
    "SELECT username, character, pig_color, is_admin FROM profiles WHERE neon_auth_user_id=$1",
    [neonAuthUserId],
  );

  if (result.rows.length === 0)
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  return NextResponse.json({ profile: result.rows[0] });
}

export async function POST(request: Request) {
  await initDB();

  const { data: session } = await auth.getSession();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const neonAuthUserId = session.user.id;
  const body = (await request.json()) as {
    action: string;
    username?: string;
    character?: string;
    pigColor?: string;
  };
  const { action } = body;

  if (action === "create") {
    const clean = String(body.username || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    if (!clean || clean.length < 2)
      return NextResponse.json(
        { error: "Username minimal 2 karakter" },
        { status: 400 },
      );

    const existing = await pool.query(
      "SELECT neon_auth_user_id FROM profiles WHERE username=$1",
      [clean],
    );
    if (existing.rows.length > 0)
      return NextResponse.json(
        { error: "Username sudah digunakan" },
        { status: 400 },
      );

    const isAdmin = clean === "admin";
    const result = await pool.query(
      `INSERT INTO profiles (neon_auth_user_id, username, character, pig_color, is_admin)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (neon_auth_user_id) DO UPDATE
         SET username=EXCLUDED.username, character=EXCLUDED.character, pig_color=EXCLUDED.pig_color
       RETURNING username, character, pig_color, is_admin`,
      [
        neonAuthUserId,
        clean,
        body.character || "pig",
        body.pigColor || "pink",
        isAdmin,
      ],
    );
    return NextResponse.json({ profile: result.rows[0] }, { status: 201 });
  }

  if (action === "update_character") {
    const result = await pool.query(
      `UPDATE profiles SET character=COALESCE($1, character), pig_color=COALESCE($2, pig_color)
       WHERE neon_auth_user_id=$3
       RETURNING username, character, pig_color, is_admin`,
      [body.character || null, body.pigColor || null, neonAuthUserId],
    );
    if (result.rows.length === 0)
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    return NextResponse.json({ profile: result.rows[0] });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
