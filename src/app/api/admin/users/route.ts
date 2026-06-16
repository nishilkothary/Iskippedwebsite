import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/services/firebaseAdmin";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    if (!ADMIN_EMAIL || decoded.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getAdminDb();
  const snap = await db.collection("users").orderBy("createdAt", "desc").get();
  const users = snap.docs.map((d) => d.data());
  return NextResponse.json({ users });
}
