import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/services/firebaseAdmin";

export const runtime = "nodejs";
const COOKIE = "__Host-iskipped-install";
const LIFETIME_MS = 30 * 60 * 1000;
const COLLECTION = "installHandoffs"; // Server-only; denied by Firestore's catch-all rule.
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function sameOrigin(req: NextRequest) {
  return req.nextUrl.protocol === "https:"
    && req.headers.get("origin") === req.nextUrl.origin
    && req.headers.get("x-iskipped-install") === "1"
    && req.headers.get("sec-fetch-site") !== "cross-site";
}

function reply(body: object, status = 200, cookie?: { value: string; maxAge: number }) {
  const response = NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (cookie) response.cookies.set(COOKIE, cookie.value, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: cookie.maxAge,
  });
  return response;
}

function cookieValue(req: NextRequest) {
  const value = req.cookies.get(COOKIE)?.value;
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

// Prepare before installation. Only a verified, non-revoked Firebase login can
// mint a handoff. The browser receives an opaque HttpOnly cookie, never a token URL.
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return reply({ error: "Forbidden" }, 403);
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!bearer) return reply({ error: "Unauthorized" }, 401);
  let identity;
  try {
    identity = await getAdminAuth().verifyIdToken(bearer, true);
  } catch {
    return reply({ error: "Unauthorized" }, 401);
  }
  try {
    const collection = getAdminDb().collection(COLLECTION);
    const previous = cookieValue(req);
    if (previous) {
      const existing = (await collection.doc(digest(previous)).get()).data();
      if (existing?.uid === identity.uid && existing.authTime === identity.auth_time
        && existing.expiresAt.toMillis() > Date.now() + 60_000) {
        // Do not invalidate a cookie already copied into a newly installed app.
        return reply({ ready: true });
      }
      await collection.doc(digest(previous)).delete();
    }
    const secret = randomBytes(32).toString("hex");
    await collection.doc(digest(secret)).set({
      uid: identity.uid, authTime: identity.auth_time,
      expiresAt: Timestamp.fromMillis(Date.now() + LIFETIME_MS),
    });
    return reply({ ready: true }, 200, { value: secret, maxAge: LIFETIME_MS / 1000 });
  } catch {
    console.warn("[install-handoff] Preparation unavailable");
    return reply({ error: "Sign-in transfer unavailable" }, 503);
  }
}

// Redeem once in the installed app. Existing Firebase sign-ins take precedence.
// The transaction prevents two concurrent requests from consuming the same ticket.
export async function PUT(req: NextRequest) {
  if (!sameOrigin(req)) return reply({ error: "Forbidden" }, 403);
  const clear = { value: "", maxAge: 0 };
  const secret = cookieValue(req);
  if (!secret) return reply({ restored: false }, 200, clear);
  try {
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(digest(secret));
    const ticket = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const data = snap.data()!;
      tx.delete(ref);
      return data.expiresAt.toMillis() > Date.now() ? data : null;
    });
    if (!ticket) return reply({ restored: false }, 200, clear);
    const adminAuth = getAdminAuth();
    const user = await adminAuth.getUser(ticket.uid);
    const revokedAfter = Date.parse(user.tokensValidAfterTime ?? "") || 0;
    if (user.disabled || ticket.authTime * 1000 < revokedAfter) {
      return reply({ restored: false }, 200, clear);
    }
    // Never resurrect a deleted/missing profile through custom-token sign-in.
    if (!(await db.collection("users").doc(ticket.uid).get()).exists) {
      return reply({ restored: false }, 200, clear);
    }
    const customToken = await adminAuth.createCustomToken(ticket.uid);
    return reply({ customToken }, 200, clear);
  } catch {
    // No tokens, cookie values, or account data in logs; fall back to normal login.
    console.warn("[install-handoff] Restore unavailable");
    return reply({ restored: false }, 200, clear);
  }
}

// Explicit logout invalidates even a copy of the ticket in another app context.
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return reply({ error: "Forbidden" }, 403);
  try {
    const secret = cookieValue(req);
    if (secret) await getAdminDb().collection(COLLECTION).doc(digest(secret)).delete();
    return reply({ cleared: true }, 200, { value: "", maxAge: 0 });
  } catch {
    return reply({ error: "Unable to clear sign-in transfer" }, 503, { value: "", maxAge: 0 });
  }
}
