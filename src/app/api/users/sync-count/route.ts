import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminRtdb } from "@/lib/services/firebaseAdmin";
import { requireUid, handleApiError } from "@/lib/services/apiAuth";

export async function POST(req: NextRequest) {
  try {
    await requireUid(req);

    // Derive the metric instead of incrementing it. Repeated requests and
    // interrupted signup flows therefore converge on the same exact value.
    const snapshot = await getAdminDb().collection("users").count().get();
    const totalUsers = snapshot.data().count;
    await getAdminRtdb().ref("globalStats/totalUsers").set(totalUsers);

    return NextResponse.json({ totalUsers });
  } catch (error) {
    return handleApiError(error);
  }
}
