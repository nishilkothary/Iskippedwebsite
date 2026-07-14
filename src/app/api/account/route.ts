import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { Firestore, Query } from "firebase-admin/firestore";
import { getAdminDb, getAdminAuth, getAdminRtdb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
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
    try {
      await getAdminRtdb().ref("globalStats").transaction((current) => {
        if (!current) return current;
        return {
          ...current,
          totalSaved: Math.max(0, (current.totalSaved || 0) - (profile.totalSaved || 0)),
          totalSkips: Math.max(0, (current.totalSkips || 0) - (profile.totalSkips || 0)),
        };
      });
    } catch {
      // Non-critical
    }

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
