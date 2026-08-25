import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/services/firebaseAdmin";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await getAdminAuth().verifyIdToken(idToken);
    const { id: challengeId } = await context.params;
    if (!challengeId) return NextResponse.json({ error: "Challenge id is required" }, { status: 400 });

    const db = getAdminDb();
    const projectRef = db.collection("projects").doc(challengeId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

    const project = projectSnap.data() ?? {};
    const challengeTitle = typeof project.title === "string" ? project.title : "";
    const projectMemberUids = Array.isArray(project.memberUids)
      ? project.memberUids.filter((uid: unknown): uid is string => typeof uid === "string" && uid.length > 0)
      : [];
    const [joinedUsersSnap, activeUsersSnap] = await Promise.all([
      db.collection("users").where("joinedProjectIds", "array-contains", challengeId).get(),
      db.collection("users").where("activeProjectId", "==", challengeId).get(),
    ]);
    const joinedMemberCount = new Set([
      ...projectMemberUids,
      ...joinedUsersSnap.docs.map((user) => user.id),
      ...activeUsersSnap.docs.map((user) => user.id),
    ]).size;

    // Older fundraisers may have skip documents but no project totals or
    // communityFeed documents. Read those historical skips as a compatibility
    // fallback and repair the missing feed entries while this fundraiser is
    // viewed. The repair is idempotent because feed docs use the skip ID.
    const legacySkipQueries = [
      db.collectionGroup("skips").where("projectId", "==", challengeId).get(),
      db.collectionGroup("skips").where("allocationTarget.id", "==", challengeId).get(),
      ...(challengeTitle
        ? [db.collectionGroup("skips").where("projectTitle", "==", challengeTitle).get()]
        : []),
    ];
    const legacySkipSnapshots = await Promise.all(legacySkipQueries);
    const legacySkipsByPath = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const snapshot of legacySkipSnapshots) {
      for (const skip of snapshot.docs) legacySkipsByPath.set(skip.ref.path, skip);
    }
    const legacySkips = Array.from(legacySkipsByPath.values());
    const legacySkipTotal = legacySkips.reduce((sum, skip) => {
      const amount = skip.get("amount");
      return sum + (typeof amount === "number" ? Math.max(0, amount) : 0);
    }, 0);
    const legacySkipUids = Array.from(new Set(legacySkips
      .map((skip) => skip.get("uid"))
      .filter((uid): uid is string => typeof uid === "string" && uid.length > 0)));

    try {
      const existingFeedSnap = await db.collection("communityFeed").where("projectId", "==", challengeId).get();
      const existingFeedSkipIds = new Set(existingFeedSnap.docs.map((feed) => feed.get("skipId") || feed.id));
      const missingSkips = legacySkips.filter((skip) => !existingFeedSkipIds.has(skip.id)).slice(0, 400);
      if (missingSkips.length > 0) {
        const userRefs = Array.from(new Set(missingSkips.map((skip) => skip.get("uid")).filter((uid): uid is string => typeof uid === "string" && uid.length > 0)))
          .map((uid) => db.collection("users").doc(uid));
        const userSnaps = userRefs.length > 0 ? await db.getAll(...userRefs) : [];
        const usersByUid = new Map(userSnaps.map((user) => [user.id, user.data() ?? {}]));
        const batch = db.batch();
        for (const skip of missingSkips) {
          const uid = skip.get("uid");
          const user = typeof uid === "string" ? usersByUid.get(uid) ?? {} : {};
          const label = skip.get("whatSkipped") || skip.get("categoryLabel") || "a skip";
          batch.set(db.collection("communityFeed").doc(skip.id), {
            uid: typeof uid === "string" ? uid : "",
            displayName: user.displayName || "Skipper",
            ...(user.photoURL ? { photoURL: user.photoURL } : {}),
            type: "skip",
            skipId: skip.id,
            skipAmount: skip.get("amount") ?? 0,
            skipCategory: skip.get("category") || "other",
            skipEmoji: skip.get("categoryEmoji") || "",
            skipLabel: label,
            projectId: challengeId,
            projectTitle: skip.get("projectTitle") || challengeTitle,
            message: `skipped ${label}`,
            createdAt: skip.get("createdAt") || new Date(),
          }, { merge: true });
        }
        await batch.commit();
      }
    } catch (error) {
      console.warn("[challenge progress] legacy feed repair failed", error);
    }

    // Current impact is confirmed donations plus money still held in members' cause jars.
    const balanceUsersSnap = await db.collection("users").where(`causeJarBalances.${challengeId}`, ">", 0).get();
    const totalPledged = balanceUsersSnap.docs.reduce((sum, userSnap) => {
      const balance = userSnap.data().causeJarBalances?.[challengeId];
      return sum + (typeof balance === "number" ? Math.max(0, balance) : 0);
    }, 0);
    const [causeDonations, titleDonations] = await Promise.all([
      db.collectionGroup("donations").where("causeId", "==", challengeId).get(),
      challengeTitle
        ? db.collectionGroup("donations").where("causeTitle", "==", challengeTitle).get()
        : Promise.resolve({ docs: [] }),
    ]);
    const donationDocs = new Map<string, typeof causeDonations.docs[number]>();
    for (const donation of [...causeDonations.docs, ...titleDonations.docs]) donationDocs.set(donation.ref.path, donation);
    const recordedDonations = [...donationDocs.values()].reduce((sum, donation) => {
      const amount = donation.get("amount");
      return sum + (typeof amount === "number" ? Math.max(0, amount) : 0);
    }, 0);
    // A participant can have donated their saved skips already, leaving no
    // current jar balance. Count those people as supporters as well.
    const contributorUids = new Set(balanceUsersSnap.docs.map((userSnap) => userSnap.id));
    for (const donation of donationDocs.values()) {
      const uid = donation.ref.parent.parent?.id;
      if (uid) contributorUids.add(uid);
    }
    const contributorCount = contributorUids.size;
    const storedDonated = typeof project.totalDonated === "number" ? Math.max(0, project.totalDonated) : 0;
    const totalDonated = recordedDonations > 0 ? recordedDonations : storedDonated;
    const legacyTotal = legacySkipTotal + totalDonated;

    return NextResponse.json({
      totalPledged,
      totalDonated,
      contributorCount: Math.max(contributorCount, legacySkipUids.length, joinedMemberCount),
      total: Math.max(totalPledged + totalDonated, legacyTotal),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
