import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/services/firebaseAdmin";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "";

type MemberProfile = {
  uid?: string;
  displayName?: string;
  email?: string;
  photoURL?: string | null;
  emailVerified?: boolean;
  causeJarBalances?: Record<string, number>;
  joinedProjectIds?: string[];
  createdAt?: { toDate?: () => Date };
};

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: challengeId } = await context.params;
  if (!challengeId) {
    return NextResponse.json({ error: "Challenge id is required" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdminDb();
    const projectSnap = await db.collection("projects").doc(challengeId).get();

    if (!projectSnap.exists) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    const project = projectSnap.data() ?? {};
    const isOwner = project.createdBy === decoded.uid;
    const isSiteAdmin = Boolean(ADMIN_EMAIL && decoded.email === ADMIN_EMAIL);

    if (!isOwner && !isSiteAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const memberUids = Array.isArray(project.memberUids)
      ? project.memberUids.filter((uid): uid is string => typeof uid === "string")
      : [];

    const members = [];
    for (const batch of chunks(memberUids, 100)) {
      const refs = batch.map((uid) => db.collection("users").doc(uid));
      const snaps = await db.getAll(...refs);
      for (const snap of snaps) {
        if (!snap.exists) continue;
        const data = snap.data() as MemberProfile;
        const uid = data.uid ?? snap.id;
        members.push({
          uid,
          displayName: data.displayName || "Member",
          email: data.email || "",
          photoURL: data.photoURL ?? null,
          emailVerified: data.emailVerified ?? null,
          pledged: Number(data.causeJarBalances?.[challengeId] ?? 0),
          joinedChallenge: data.joinedProjectIds?.includes(challengeId) ?? true,
          joinedAt: data.createdAt?.toDate?.().toISOString() ?? null,
        });
      }
    }

    members.sort((a, b) => b.pledged - a.pledged || a.displayName.localeCompare(b.displayName));

    return NextResponse.json({
      members,
      totalMembers: memberUids.length,
      emailableMembers: members.filter((member) => member.email).length,
    });
  } catch (error) {
    console.error("[challenge members] failed", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
