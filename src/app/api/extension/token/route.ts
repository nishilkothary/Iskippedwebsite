import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/services/firebaseAdmin";
import { requireUid, handleApiError } from "@/lib/services/apiAuth";

// Mints a single-use Firebase custom token (1h expiry) so the browser
// extension can sign in as the current user via signInWithCustomToken.
// Called only from /extension/connect while signed in on the web app.
export async function POST(req: NextRequest) {
  try {
    const uid = await requireUid(req);
    const token = await getAdminAuth().createCustomToken(uid);
    return NextResponse.json({ token });
  } catch (e) {
    return handleApiError(e);
  }
}
