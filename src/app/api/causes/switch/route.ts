import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { validateNonEmptyString, isChallengeProjectServer } from "@/lib/services/serverProfileDefaults";
import { sendPushToUser } from "@/lib/services/push";
import { UserProfile } from "@/lib/types/models";

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();
    const newCauseId = validateNonEmptyString(body.newCauseId, "newCauseId");

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);

    const { balanceTransfer, displayName } = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new ApiError(404, "User not found");
      const profile = userSnap.data() as UserProfile;

      const updates: Record<string, unknown> = {
        activeProjectId: newCauseId,
        joinedProjectIds: FieldValue.arrayUnion(newCauseId),
      };
      const balanceTransfer: Record<string, number> = {};
      let totalTransferred = 0;

      const allJarBalances = profile.causeJarBalances ?? {};
      for (const [causeId, bal] of Object.entries(allJarBalances)) {
        const amount = Math.max(0, Number(bal) || 0);
        if (causeId === newCauseId || amount === 0) continue;
        updates[`causeJarBalances.${causeId}`] = 0;
        balanceTransfer[causeId] = 0;
        totalTransferred += amount;
        tx.set(db.collection("projects").doc(causeId), { totalRaised: FieldValue.increment(-amount) }, { merge: true });
      }
      if (totalTransferred > 0) {
        updates[`causeJarBalances.${newCauseId}`] = FieldValue.increment(totalTransferred);
        balanceTransfer[newCauseId] = (allJarBalances[newCauseId] ?? 0) + totalTransferred;
      }

      tx.update(userRef, updates);
      tx.set(
        db.collection("projects").doc(newCauseId),
        { memberUids: FieldValue.arrayUnion(uid), ...(totalTransferred > 0 ? { totalRaised: FieldValue.increment(totalTransferred) } : {}) },
        { merge: true }
      );

      return {
        balanceTransfer: Object.keys(balanceTransfer).length > 0 ? balanceTransfer : null,
        displayName: profile.displayName,
      };
    });

    // Challenge-activity push: best-effort, never fails the join itself.
    try {
      const projSnap = await db.collection("projects").doc(newCauseId).get();
      const proj = projSnap.data();
      if (proj?.createdBy && proj.createdBy !== uid && isChallengeProjectServer(proj)) {
        await sendPushToUser(proj.createdBy, {
          title: "🎉 New challenge member",
          body: `${displayName || "Someone"} just joined "${proj.title || "your challenge"}"!`,
          url: `/challenges/${newCauseId}/manage`,
        });
      }
    } catch (e) {
      console.warn("[causes/switch] challenge-join push failed:", e);
    }

    return NextResponse.json({ balanceTransfer });
  } catch (e) {
    return handleApiError(e);
  }
}
