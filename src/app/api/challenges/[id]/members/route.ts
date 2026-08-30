import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/services/firebaseAdmin";
import { DESIGNATED_ADMIN_EMAIL } from "@/lib/constants/admin";
import { getChallengeTotals } from "@/lib/services/challengeTotals";
import { getFundraiserTitles } from "@/lib/utils/fundraiserDetails";
import { getSkipBalanceSummary } from "@/lib/utils/skipBalances";

type MemberProfile = {
  uid?: string;
  displayName?: string;
  email?: string;
  photoURL?: string | null;
  emailVerified?: boolean;
  totalSaved?: number;
  totalSpent?: number;
  totalDonated?: number;
  totalDonatedFromSkips?: number;
  goalJarBalances?: Record<string, number>;
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
    const isDesignatedAdmin = (decoded.email ?? "").trim().toLowerCase() === DESIGNATED_ADMIN_EMAIL;
    if (!isOwner && !isDesignatedAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const challengeTitle = typeof project.title === "string" ? project.title : "";
    const challengeTitles = getFundraiserTitles(project);
    const totals = await getChallengeTotals(db, challengeId, challengeTitle, project.previousTitles);

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

    // A donation can be recorded before a member profile is added to the
    // project's memberUids array. Include those donor profiles so the
    // challenge total is attributable to a specific member in the list.
    const allDonationDocs = await db.collectionGroup("donations").get();
    const challengeDonationDocs = allDonationDocs.docs.filter((donation) => {
      const causeId = donation.get("causeId");
      return causeId === challengeId || (!causeId && challengeTitles.has(donation.get("causeTitle")));
    });
    for (const donation of challengeDonationDocs) {
      const uid = donation.ref.parent.parent?.id;
      if (uid) memberUidSet.add(uid);
    }

    const resolvedMemberUids = Array.from(memberUidSet);

    const donatedByUid = new Map<string, number>();
    for (const donation of challengeDonationDocs) {
      const uid = donation.ref.parent.parent?.id;
      const amount = Number(donation.get("amount") ?? 0);
      if (!uid || !Number.isFinite(amount) || amount <= 0) continue;
      donatedByUid.set(uid, (donatedByUid.get(uid) ?? 0) + amount);
    }

    const members = [];
    for (const batch of chunks(resolvedMemberUids, 100)) {
      const refs = batch.map((uid) => db.collection("users").doc(uid));
      const snaps = await db.getAll(...refs);
      for (const snap of snaps) {
        if (!snap.exists) continue;
        const data = snap.data() as MemberProfile;
        const uid = data.uid ?? snap.id;
        // Consent applies to every fundraiser-dashboard viewer, including the
        // designated site admin. Owner-level support access remains separate
        // from this routine organizer-facing member list.
        const emailShared = data.challengeEmailConsents?.[challengeId] === true;
        members.push({
          uid,
          displayName: data.displayName || "Member",
          email: emailShared ? data.email || "" : "",
          photoURL: data.photoURL ?? null,
          emailVerified: data.emailVerified ?? null,
          pledged: Math.min(
            Math.max(0, Number(data.causeJarBalances?.[challengeId] ?? 0) || 0),
            getSkipBalanceSummary({
              totalSaved: data.totalSaved ?? 0,
              totalSpent: data.totalSpent ?? 0,
              totalDonated: data.totalDonated ?? 0,
              totalDonatedFromSkips: data.totalDonatedFromSkips,
              causeJarBalances: data.causeJarBalances,
              goalJarBalances: data.goalJarBalances,
            }).availableFromSkips,
          ),
          donated: donatedByUid.get(snap.id) ?? donatedByUid.get(uid) ?? 0,
          joinedChallenge: data.joinedProjectIds?.includes(challengeId) ?? true,
          joinedAt: data.createdAt?.toDate?.().toISOString() ?? null,
        });
      }
    }

    members.sort((a, b) => b.pledged - a.pledged || a.displayName.localeCompare(b.displayName));

    const totalPledged = totals.totalPledged;
    const totalDonated = totals.totalDonated;

    return NextResponse.json({
      members,
      totalMembers: resolvedMemberUids.length,
      totalPledged,
      emailableMembers: members.filter((member) => member.email).length,
      totalDonated,
    });
  } catch (error) {
    console.error("[challenge members] failed", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
