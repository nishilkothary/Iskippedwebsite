import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminRtdb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { validateAmount, validateNonEmptyString } from "@/lib/services/serverProfileDefaults";
import { getImpactMessage } from "@/lib/constants/impactMessages";
import { xpForSkip, levelForXp, REFERRAL_BONUS_XP } from "@/lib/utils/xp";
import { getConsecutiveWeeklyStreak, getLongestWeeklyStreak, today } from "@/lib/utils/dates";
import { adjustGlobalStats } from "@/lib/services/globalStats";
import { SkipAllocationTarget, UserProfile } from "@/lib/types/models";

function parseAllocationTarget(raw: unknown): SkipAllocationTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const type = data.type === "goal" || data.type === "fundraiser" ? data.type : null;
  const id = typeof data.id === "string" && data.id.trim() ? data.id.trim() : null;
  return type && id ? { type, id } : null;
}

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const body = await req.json();

    const category = validateNonEmptyString(body.category, "category");
    const categoryLabel = validateNonEmptyString(body.categoryLabel, "categoryLabel");
    const categoryEmoji = typeof body.categoryEmoji === "string" ? body.categoryEmoji : "";
    const amount = validateAmount(body.amount);
    const projectId: string | null = typeof body.projectId === "string" ? body.projectId : null;
    const projectTitle: string | null = typeof body.projectTitle === "string" ? body.projectTitle : null;
    const projectLocation: string | null = typeof body.projectLocation === "string" ? body.projectLocation : null;
    const shareWithCommunity: boolean = body.shareWithCommunity === true;
    const whatSkipped: string | undefined = typeof body.whatSkipped === "string" ? body.whatSkipped : undefined;
    const notes: string | undefined = typeof body.notes === "string" ? body.notes : undefined;
    const displayName: string | undefined = typeof body.displayName === "string" ? body.displayName : undefined;
    const photoURL: string | null | undefined = typeof body.photoURL === "string" ? body.photoURL : undefined;
    const requestedAllocationTarget = parseAllocationTarget(body.allocationTarget);

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const skipRef = userRef.collection("skips").doc();
    const feedRef = db.collection("feed").doc(uid).collection("items").doc();

    const todayStr = today();

    const result = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new ApiError(404, "User not found");
      const profile = userSnap.data() as UserProfile;

      // Referral: the inviter is credited the give-portion of EVERY skip this invitee logs
      // (feeds the inviter's Impact Score). The one-time XP/referralCount bonus is still gated
      // to the invitee's FIRST skip (prevents empty-account farming). Read the referrer doc now —
      // all transaction reads must precede writes.
      const isFirstSkip = (profile.totalSkips ?? 0) === 0;
      const referrerRef = profile.referredBy ? db.collection("users").doc(profile.referredBy) : null;
      const referrerSnap = referrerRef ? await tx.get(referrerRef) : null;
      const referrerProfile = referrerSnap?.exists ? (referrerSnap.data() as UserProfile) : null;
      const existingSkipsSnap = await tx.get(userRef.collection("skips"));
      const skipDates = existingSkipsSnap.docs
        .map((doc) => doc.get("date"))
        .filter((date): date is string => typeof date === "string");
      // First-skip XP bonus only applies to both parties on the invitee's first skip.
      const referralBonusXp = referrerProfile && isFirstSkip ? REFERRAL_BONUS_XP : 0;

      const xpEarned = xpForSkip(amount) + referralBonusXp;
      const newXp = (profile.xp ?? 0) + xpEarned;
      const newLevel = levelForXp(newXp);
      const newTotalSaved = (profile.totalSaved ?? 0) + amount;

      const allSkipDates = [...skipDates, todayStr];
      const newStreak = getConsecutiveWeeklyStreak(allSkipDates, todayStr);
      const newLongestStreak = getLongestWeeklyStreak(allSkipDates);

      let causeSuffix = "";
      if (projectTitle) causeSuffix = ` with ${projectTitle}`;

      const impactMessage = getImpactMessage(amount);
      const message = `skipped ${whatSkipped || categoryLabel}${causeSuffix}`;
      const allocationTarget = requestedAllocationTarget ?? profile.activeSkipTarget ?? null;

      tx.set(skipRef, {
        uid,
        category,
        categoryLabel,
        categoryEmoji,
        amount,
        date: todayStr,
        projectId,
        projectTitle,
        impactMessage,
        allocationMode: "skip-pot",
        ...(allocationTarget ? { allocationTarget } : {}),
        createdAt: FieldValue.serverTimestamp(),
        ...(whatSkipped ? { whatSkipped } : {}),
        ...(notes ? { notes } : {}),
      });

      const userUpdates: Record<string, unknown> = {
        totalSaved: newTotalSaved,
        totalSkips: FieldValue.increment(1),
        xp: newXp,
        level: newLevel,
        streak: newStreak,
        longestStreak: newLongestStreak,
        lastSkipDate: todayStr,
        savedTowardActiveCause: allocationTarget?.type === "fundraiser" ? FieldValue.increment(amount) : (profile.savedTowardActiveCause ?? 0),
      };
      if (allocationTarget?.type === "goal") userUpdates[`goalJarBalances.${allocationTarget.id}`] = FieldValue.increment(amount);
      if (allocationTarget?.type === "fundraiser") userUpdates[`causeJarBalances.${allocationTarget.id}`] = FieldValue.increment(amount);
      tx.update(userRef, userUpdates);

      tx.set(feedRef, {
        uid,
        displayName: displayName || "Skipper",
        ...(photoURL ? { photoURL } : {}),
        type: "skip",
        skipAmount: amount,
        skipCategory: category,
        skipEmoji: categoryEmoji,
        projectTitle,
        message,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Credit the inviter: always roll up this skip's give-dollars into their Impact Score;
      // on the invitee's first skip only, also grant the one-time XP + Friends-Joined bonus.
      if (referrerRef && referrerProfile && isFirstSkip) {
        const firstSkipBonus = isFirstSkip
          ? (() => {
              const referrerNewXp = (referrerProfile.xp ?? 0) + REFERRAL_BONUS_XP;
              return {
                xp: referrerNewXp,
                level: levelForXp(referrerNewXp),
                referralCount: FieldValue.increment(1),
              };
            })()
          : {};
        tx.update(referrerRef, firstSkipBonus);
      }

      return { newTotalSaved, newXp, newLevel, newStreak, newLongestStreak, message, allocationTarget };
    });

    // Project totals for challenge group tracking (best-effort, non-atomic — matches prior behavior)
    if (result.allocationTarget?.type === "fundraiser") {
      const projectRef = db.collection("projects").doc(result.allocationTarget.id);
      projectRef.update({
        totalSkips: FieldValue.increment(1),
        totalRaised: FieldValue.increment(amount),
        memberUids: FieldValue.arrayUnion(uid),
      }).catch((e) => console.warn("[skips] project totals update failed:", e));
    }

    // Global counters in Realtime DB
    await adjustGlobalStats(amount, 1);

    // Community/group sharing only applies to fundraiser-targeted skips.
    if (result.allocationTarget?.type === "fundraiser") try {
      const communityFeedRef = db.collection("communityFeed").doc(skipRef.id);
      await communityFeedRef.set({
        uid,
        displayName: shareWithCommunity ? (displayName || "Skipper") : "Anonymous",
        ...(shareWithCommunity && photoURL ? { photoURL } : {}),
        type: "skip",
        skipId: skipRef.id,
        skipAmount: amount,
        skipCategory: category,
        skipEmoji: categoryEmoji,
        skipLabel: whatSkipped || categoryLabel,
        projectId: result.allocationTarget.id,
        projectTitle,
        ...(projectLocation ? { projectLocation } : {}),
        shareName: shareWithCommunity,
        message: result.message,
        createdAt: FieldValue.serverTimestamp(),
      });

      if (shareWithCommunity) {
        const causeTotalRef = getAdminRtdb().ref(`causeTotals/${result.allocationTarget.id}`);
        await causeTotalRef.transaction((current) => (current || 0) + amount);
      }
    } catch {
      // Non-critical, continue
    }

    return NextResponse.json({
      skipId: skipRef.id,
      newTotal: result.newTotalSaved,
      newXp: result.newXp,
      newLevel: result.newLevel,
      newStreak: result.newStreak,
      newLongestStreak: result.newLongestStreak,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
