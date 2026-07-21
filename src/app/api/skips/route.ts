import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminRtdb } from "@/lib/services/firebaseAdmin";
import { requireUid, ApiError, handleApiError } from "@/lib/services/apiAuth";
import { normalizeJarSplitServer, normalizeSpendingGoalsServer, validateAmount, validateNonEmptyString } from "@/lib/services/serverProfileDefaults";
import { getImpactMessage } from "@/lib/constants/impactMessages";
import { xpForSkip, levelForXp, REFERRAL_BONUS_XP } from "@/lib/utils/xp";
import { today, yesterday } from "@/lib/utils/dates";
import { formatUnits } from "@/lib/utils/impact";
import { UserProfile } from "@/lib/types/models";

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
    const projectUnitName: string | null = typeof body.projectUnitName === "string" ? body.projectUnitName : null;
    const projectUnitCost: number | null = typeof body.projectUnitCost === "number" ? body.projectUnitCost : null;
    const projectUnitIsGoal: boolean = body.projectUnitIsGoal === true;
    const shareWithCommunity: boolean = body.shareWithCommunity === true;
    const whatSkipped: string | undefined = typeof body.whatSkipped === "string" ? body.whatSkipped : undefined;
    const notes: string | undefined = typeof body.notes === "string" ? body.notes : undefined;
    const displayName: string | undefined = typeof body.displayName === "string" ? body.displayName : undefined;
    const photoURL: string | null | undefined = typeof body.photoURL === "string" ? body.photoURL : undefined;
    const rawJarSplit = body.jarSplit && typeof body.jarSplit.give === "number" ? body.jarSplit : undefined;

    const db = getAdminDb();
    const userRef = db.collection("users").doc(uid);
    const skipRef = userRef.collection("skips").doc();
    const feedRef = db.collection("feed").doc(uid).collection("items").doc();

    const todayStr = today();
    const yesterdayStr = yesterday();

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
      // First-skip XP bonus only applies to both parties on the invitee's first skip.
      const referralBonusXp = referrerProfile && isFirstSkip ? REFERRAL_BONUS_XP : 0;

      const defaultJarSplit = normalizeJarSplitServer(profile.jarSplit as any);
      const rawGive = rawJarSplit?.give ?? defaultJarSplit.give;
      const clampedGive = Math.min(100, Math.max(0, rawGive));
      const effectiveSplit = { give: clampedGive, live: 100 - clampedGive };
      const giveAmount = amount * (effectiveSplit.give / 100);
      const liveAmount = amount * (effectiveSplit.live / 100);

      const activeGoalId = normalizeSpendingGoalsServer(profile).activeId;

      const xpEarned = xpForSkip(amount) + referralBonusXp;
      const newXp = (profile.xp ?? 0) + xpEarned;
      const newLevel = levelForXp(newXp);
      const newTotalSaved = (profile.totalSaved ?? 0) + amount;

      let newStreak = profile.streak ?? 0;
      const lastSkipDate = profile.lastSkipDate ?? null;
      if (lastSkipDate === todayStr) {
        // no change
      } else if (lastSkipDate === yesterdayStr) {
        newStreak = (profile.streak ?? 0) + 1;
      } else {
        newStreak = 1;
      }
      const newLongestStreak = Math.max(profile.longestStreak ?? 0, newStreak);

      let newOverflowCount: number | undefined;
      const causeGoalAmount = projectId ? (profile.causeGoalAmounts?.[projectId] ?? 0) : 0;
      if (projectId && causeGoalAmount > 0 && giveAmount > 0) {
        const currentJarBal = profile.causeJarBalances?.[projectId] ?? 0;
        const newJarBal = currentJarBal + giveAmount;
        if (newJarBal >= causeGoalAmount) {
          newOverflowCount = (profile.causeJarOverflowCounts?.[projectId] ?? 0) + 1;
        }
      }

      const giveAmountForMessage = amount * (effectiveSplit.give / 100);
      let causeSuffix = "";
      if (projectTitle && projectUnitName && projectUnitCost && !projectUnitIsGoal) {
        const unitsStr = formatUnits(giveAmountForMessage, projectUnitCost, projectUnitName);
        causeSuffix = ` to help pledge ${unitsStr}${projectLocation ? ` in ${projectLocation}` : ""}`;
      } else if (projectTitle && projectUnitName && projectUnitCost && projectUnitIsGoal) {
        const pct = Math.max(1, Math.round((giveAmountForMessage / projectUnitCost) * 100));
        causeSuffix = ` to help pledge ${pct}% of ${projectTitle}`;
      } else if (projectTitle) {
        causeSuffix = ` to help pledge toward ${projectTitle}`;
      }

      const impactMessage = getImpactMessage(amount);
      const message = `skipped ${whatSkipped || categoryLabel}${causeSuffix}`;

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
        createdAt: FieldValue.serverTimestamp(),
        ...(whatSkipped ? { whatSkipped } : {}),
        ...(notes ? { notes } : {}),
        ...(rawJarSplit ? { jarSplit: effectiveSplit } : {}),
      });

      tx.update(userRef, {
        totalSaved: newTotalSaved,
        totalSkips: FieldValue.increment(1),
        xp: newXp,
        level: newLevel,
        streak: newStreak,
        longestStreak: newLongestStreak,
        lastSkipDate: todayStr,
        savedTowardActiveCause: projectId ? FieldValue.increment(amount) : (profile.savedTowardActiveCause ?? 0),
        totalGiveAllocated: FieldValue.increment(giveAmount),
        totalLiveAllocated: FieldValue.increment(liveAmount),
        ...(projectId ? { [`causeJarBalances.${projectId}`]: FieldValue.increment(giveAmount) } : {}),
        ...(activeGoalId ? { [`goalJarBalances.${activeGoalId}`]: FieldValue.increment(liveAmount) } : {}),
        ...(newOverflowCount !== undefined && projectId ? { [`causeJarOverflowCounts.${projectId}`]: newOverflowCount } : {}),
      });

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
      if (referrerRef && referrerProfile && (isFirstSkip || giveAmount > 0)) {
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
        tx.update(referrerRef, {
          referralImpactPoints: FieldValue.increment(giveAmount),
          ...firstSkipBonus,
        });
      }

      return { giveAmount, newTotalSaved, newXp, newLevel, newStreak, newOverflowCount, message };
    });

    // Project totals for challenge group tracking (best-effort, non-atomic — matches prior behavior)
    if (projectId) {
      const projectRef = db.collection("projects").doc(projectId);
      projectRef.update({ totalSkips: FieldValue.increment(1) }).catch((e) => console.warn("[skips] project totalSkips update failed:", e));
      if (result.giveAmount > 0) {
        projectRef.update({ totalRaised: FieldValue.increment(result.giveAmount) }).catch((e) => console.warn("[skips] project totalRaised update failed:", e));
      }
    }

    // Global counters in Realtime DB
    try {
      const rtdb = getAdminRtdb();
      const statsRef = rtdb.ref("globalStats");
      await statsRef.transaction((current) => {
        if (!current) return { totalSaved: amount, totalSkips: 1, totalUsers: 0 };
        return {
          ...current,
          totalSaved: (current.totalSaved || 0) + amount,
          totalSkips: (current.totalSkips || 0) + 1,
        };
      });
    } catch {
      // Non-critical, continue
    }

    // Community share — always visible, identity is opt-in
    try {
      const communityFeedRef = db.collection("communityFeed").doc(skipRef.id);
      await communityFeedRef.set({
        uid,
        displayName: shareWithCommunity ? (displayName || "Skipper") : "Anonymous",
        ...(shareWithCommunity && photoURL ? { photoURL } : {}),
        type: "skip",
        skipId: skipRef.id,
        skipAmount: amount,
        giveAmount: result.giveAmount,
        skipCategory: category,
        skipEmoji: categoryEmoji,
        skipLabel: whatSkipped || categoryLabel,
        projectId,
        projectTitle,
        ...(projectLocation ? { projectLocation } : {}),
        shareName: shareWithCommunity,
        message: result.message,
        createdAt: FieldValue.serverTimestamp(),
      });

      if (shareWithCommunity && projectId) {
        const causeTotalRef = getAdminRtdb().ref(`causeTotals/${projectId}`);
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
      giveJarOverflowCount: result.newOverflowCount,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
