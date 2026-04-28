import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/services/firebaseAdmin";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "";

export async function GET(req: NextRequest) {
  const callerEmail = req.headers.get("x-caller-email") ?? "";
  if (!ADMIN_EMAIL || callerEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getAdminDb();
  const snap = await db.collection("users").orderBy("createdAt", "desc").get();
  const users = snap.docs.map((d) => d.data());
  return NextResponse.json({ users });
}
