import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { Firestore, Query } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { adjustGlobalStats } from "@/lib/services/globalStats";
import { UserProfile } from "@/lib/types/models";

export const maxDuration = 60;

const DELETE_BATCH_SIZE = 400;

async function deleteMatchingDocs(db: Firestore, query: Query): Promise<void> {
  const snap = await query.get();
  for (let i = 0; i < snap.docs.length; i += DELETE_BATCH_SIZE) {
    const batch = db.batch();
    snap.docs.slice(i, i + DELETE_BATCH_SIZE).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

// Deletes the calling user's account: Firestore data (skips, donations, spendingHistory,
// following, personal feed, community feed entries, custom causes) and the Firebase Auth
// record. `uid` always comes from a server-verified ID token, so a caller can only ever
// delete themselves — never an arbitrary account.
export async function DELETE(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json().catch(() => ({}));
    if (body?.confirmation !== "DELETE") {
      throw new ApiError(400, "Confirmation text did not match");
    }

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new ApiError(404, "User not found");
    const profile = userSnap.data() as UserProfile;
    const [skipSnap, donationSnap] = await Promise.all([
      userRef.collection("skips").get(),
      userRef.collection("donations").get(),
    ]);

    // Reconcile every cached project counter before removing the canonical
    // records. Group money totals are normally derived from user jars and
    // donations, but these counters remain important fallbacks and feed the
    // group skip count.
    const projectDeltas = new Map<string, { pledged: number; donated: number; skips: number }>();
    const deltaFor = (projectId: string) => {
      const current = projectDeltas.get(projectId) ?? { pledged: 0, donated: 0, skips: 0 };
      projectDeltas.set(projectId, current);
      return current;
    };
    for (const [projectId, amount] of Object.entries(profile.causeJarBalances ?? {})) {
      if (Number(amount) > 0) deltaFor(projectId).pledged += Number(amount);
    }
    let actualSaved = 0;
    for (const skipDoc of skipSnap.docs) {
      const skip = skipDoc.data();
      actualSaved += Math.max(0, Number(skip.amount) || 0);
      const projectId = skip.allocationTarget?.type === "fundraiser"
        ? skip.allocationTarget.id
        : (typeof skip.projectId === "string" ? skip.projectId : "");
      if (projectId) deltaFor(projectId).skips += 1;
    }
    for (const donationDoc of donationSnap.docs) {
      const causeId = donationDoc.get("causeId");
      const amount = Math.max(0, Number(donationDoc.get("amount")) || 0);
      if (typeof causeId === "string" && causeId && amount > 0) deltaFor(causeId).donated += amount;
    }

    for (const [projectId, delta] of projectDeltas) {
      const projectRef = db.collection("projects").doc(projectId);
      await db.runTransaction(async (tx) => {
        const projectSnap = await tx.get(projectRef);
        if (!projectSnap.exists) return;
        const project = projectSnap.data() ?? {};
        tx.update(projectRef, {
          totalRaised: Math.max(0, Number(project.totalRaised ?? 0) - delta.pledged),
          totalDonated: Math.max(0, Number(project.totalDonated ?? 0) - delta.donated),
          totalSkips: Math.max(0, Number(project.totalSkips ?? 0) - delta.skips),
        });
      });
    }

    // Community feed entries this user posted
    await deleteMatchingDocs(db, db.collection("communityFeed").where("uid", "==", uid));

    // Custom causes/challenges this user created
    await deleteMatchingDocs(db, db.collection("projects").where("createdBy", "==", uid));

    // Best-effort: drop this uid from any project's member list
    if (profile.joinedProjectIds?.length) {
      await Promise.all(
        profile.joinedProjectIds.map((pid) =>
          db.collection("projects").doc(pid).update({ memberUids: FieldValue.arrayRemove(uid) }).catch(() => {})
        )
      );
    }

    // Best-effort: remove this user's contribution from the sitewide counters
    await adjustGlobalStats(-actualSaved, -skipSnap.size, -1);

    // Deletes the user doc plus every subcollection (skips, donations, spendingHistory, following)
    await db.recursiveDelete(userRef);
    // Personal fan-out feed lives under a separate top-level collection
    await db.recursiveDelete(db.collection("feed").doc(uid));

    // Admin SDK deletes the Auth record directly, bypassing the client SDK's
    // requires-recent-login restriction on user.delete().
    await getAdminAuth().deleteUser(uid);

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}
