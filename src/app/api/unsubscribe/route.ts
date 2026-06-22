import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/services/firebaseAdmin";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid") ?? "";
  const token = searchParams.get("token") ?? "";

  if (!uid || !token) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }

  const expected = crypto
    .createHmac("sha256", process.env.CRON_SECRET ?? "")
    .update(uid)
    .digest("hex");

  if (token !== expected) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }

  try {
    await getAdminDb().collection("users").doc(uid).update({ weeklyEmailOptOut: true });
  } catch {
    return new NextResponse("Something went wrong. Please try again.", { status: 500 });
  }

  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px 20px">
      <h2>You've been unsubscribed.</h2>
      <p>You won't receive weekly iSkipped reports anymore.</p>
      <a href="https://iskipped.com" style="color:#2ecc71">Back to iSkipped</a>
    </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
