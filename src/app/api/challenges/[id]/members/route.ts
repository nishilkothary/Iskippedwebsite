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
  challengeEmailConsents?: Record<string, boolean>;
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
    const memberUidSet = new Set(memberUids);
    const [joinedUsersSnap, activeUsersSnap, balanceUsersSnap, feedUsersSnap] = await Promise.all([
      db.collection("users").where("joinedProjectIds", "array-contains", challengeId).get(),
      db.collection("users").where("activeProjectId", "==", challengeId).get(),
      db.collection("users").where(`causeJarBalances.${challengeId}`, ">", 0).get(),
      db.collection("communityFeed").where("projectId", "==", challengeId).get(),
    ]);
    for (const userSnap of [...joinedUsersSnap.docs, ...activeUsersSnap.docs, ...balanceUsersSnap.docs]) {
      memberUidSet.add(userSnap.id);
    }
    for (const feedSnap of feedUsersSnap.docs) {
      const uid = feedSnap.get("uid");
      if (typeof uid === "string" && uid) memberUidSet.add(uid);
    }
    const resolvedMemberUids = Array.from(memberUidSet);

    const members = [];
    for (const batch of chunks(resolvedMemberUids, 100)) {
      const refs = batch.map((uid) => db.collection("users").doc(uid));
      const snaps = await db.getAll(...refs);
      for (const snap of snaps) {
        if (!snap.exists) continue;
        const data = snap.data() as MemberProfile;
        const uid = data.uid ?? snap.id;
        const emailShared = data.challengeEmailConsents?.[challengeId] === true;
        members.push({
          uid,
          displayName: data.displayName || "Member",
          email: emailShared ? data.email || "" : "",
          photoURL: data.photoURL ?? null,
          emailVerified: data.emailVerified ?? null,
          pledged: Number(data.causeJarBalances?.[challengeId] ?? 0),
          joinedChallenge: data.joinedProjectIds?.includes(challengeId) ?? true,
          joinedAt: data.createdAt?.toDate?.().toISOString() ?? null,
        });
      }
    }

    members.sort((a, b) => b.pledged - a.pledged || a.displayName.localeCompare(b.displayName));

    let totalDonated = 0;
    for (const batch of chunks(resolvedMemberUids, 10)) {
      const donationSnaps = await Promise.all(
        batch.map((uid) => db.collection("users").doc(uid).collection("donations").where("causeId", "==", challengeId).get())
      );
      for (const donationSnap of donationSnaps) {
        for (const doc of donationSnap.docs) {
          const amount = doc.get("amount");
          totalDonated += typeof amount === "number" ? amount : 0;
        }
      }
    }

    return NextResponse.json({
      members,
      totalMembers: resolvedMemberUids.length,
      emailableMembers: members.filter((member) => member.email).length,
      totalDonated,
    });
  } catch (error) {
    console.error("[challenge members] failed", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
