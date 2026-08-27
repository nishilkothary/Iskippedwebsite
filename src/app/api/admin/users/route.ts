import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/services/firebaseAdmin";
import { DESIGNATED_ADMIN_EMAIL } from "@/lib/constants/admin";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    if ((decoded.email ?? "").trim().toLowerCase() !== DESIGNATED_ADMIN_EMAIL) {
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
