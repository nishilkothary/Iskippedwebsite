import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { validateNonEmptyString, isChallengeProjectServer } from "@/lib/services/serverProfileDefaults";
import { sendPushToUser } from "@/lib/services/push";
import { UserProfile } from "@/lib/types/models";
import { balancesFromLots, cloneLots, locationKey, transferLots } from "@/lib/utils/skipLedger";

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();
    const newCauseId = validateNonEmptyString(body.newCauseId, "newCauseId");
    const transferBalance = body.transferBalance === true;
    const makeActive = body.makeActive !== false;

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);

    const { balanceTransfer, displayName } = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new ApiError(404, "User not found");
      const profile = userSnap.data() as UserProfile;
      const skipLots = cloneLots(profile);

      const updates: Record<string, unknown> = {
        joinedProjectIds: FieldValue.arrayUnion(newCauseId),
      };
      if (makeActive) {
        updates.activeProjectId = newCauseId;
        updates.activeSkipTarget = { type: "fundraiser", id: newCauseId };
      }
      const balanceTransfer: Record<string, number> = {};
      let totalTransferred = 0;

      const allJarBalances = profile.causeJarBalances ?? {};
      if (transferBalance) {
        for (const [causeId, bal] of Object.entries(allJarBalances)) {
          const amount = Math.max(0, Number(bal) || 0);
          if (causeId === newCauseId || amount === 0) continue;
          updates[`causeJarBalances.${causeId}`] = 0;
          balanceTransfer[causeId] = 0;
          totalTransferred += amount;
          transferLots(skipLots, amount, [locationKey({ type: "fundraiser", id: causeId })], locationKey({ type: "fundraiser", id: newCauseId }));
          tx.set(db.collection("projects").doc(causeId), { totalRaised: FieldValue.increment(-amount) }, { merge: true });
        }
        if (totalTransferred > 0) {
          const existingNewBalance = Math.max(0, Number(allJarBalances[newCauseId]) || 0);
          const nextBalances = balancesFromLots(skipLots);
          updates.causeJarBalances = nextBalances.causeJarBalances;
          updates.goalJarBalances = nextBalances.goalJarBalances;
          updates.skipLots = skipLots;
          balanceTransfer[newCauseId] = existingNewBalance + totalTransferred;
        }
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

    // Challenge-activity push is best-effort and must not delay the join response.
    void (async () => {
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
    })();
    return NextResponse.json({ balanceTransfer });
  } catch (e) {
    return handleApiError(e);
  }
}
