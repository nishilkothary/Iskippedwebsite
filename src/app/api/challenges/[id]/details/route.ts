import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/services/firebaseAdmin";
import { ApiError, handleApiError } from "@/lib/services/apiAuth";
import { DESIGNATED_ADMIN_EMAIL } from "@/lib/constants/admin";
import { fundraiserDetailFields } from "@/lib/utils/fundraiserDetails";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const header = req.headers.get("Authorization") ?? "";
    if (!header.startsWith("Bearer ")) throw new ApiError(401, "Unauthorized");
    const decoded = await getAdminAuth().verifyIdToken(header.slice(7), true)
      .catch(() => { throw new ApiError(401, "Unauthorized"); });
    const { id } = await context.params;
    const data = await req.json().catch(() => { throw new ApiError(400, "Invalid request"); });
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new ApiError(400, "Invalid details");
    const updates: Record<string, string | number | null> = {};
    for (const [field, value] of Object.entries(data)) {
      if (!(fundraiserDetailFields as readonly string[]).includes(field)) throw new ApiError(400, "Unknown detail field");
      if (field === "goalAmount" || field === "unitCost") {
        if (field === "unitCost" && value === null) { updates[field] = null; continue; }
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (field === "unitCost" && value === 0)) {
          throw new ApiError(400, `Invalid ${field}`);
        }
        updates[field] = value;
        continue;
      }
      if (typeof value !== "string" && value !== null) throw new ApiError(400, `Invalid ${field}`);
      const text = typeof value === "string" ? value.trim() : "";
      if (field === "title" && !text) throw new ApiError(400, "Fundraiser name is required");
      if (field === "visibility" && !["public", "private", "unlisted", "password"].includes(text)) throw new ApiError(400, "Invalid visibility");
      if (["donationURL", "learnMoreURL"].includes(field) && text) {
        let url: URL;
        try { url = new URL(text); } catch { throw new ApiError(400, "Enter a complete https:// or http:// link"); }
        if (!["https:", "http:"].includes(url.protocol)) throw new ApiError(400, "Links must use https:// or http://");
      }
      updates[field] = text || null;
    }
    if (!Object.keys(updates).length) throw new ApiError(400, "No changes to save");
    const db = getAdminDb();
    const projectRef = db.collection("projects").doc(id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(projectRef);
      if (!snap.exists) throw new ApiError(404, "Fundraiser not found");
      const admin = (decoded.email ?? "").trim().toLowerCase() === DESIGNATED_ADMIN_EMAIL;
      if (snap.data()?.createdBy !== decoded.uid && !admin) throw new ApiError(403, "Only the fundraiser creator or admin can edit it");
      const tags = updates.visibility
        ? [...(snap.data()?.tags ?? []).filter((tag: string) => !tag.startsWith("visibility-")), `visibility-${updates.visibility}`]
        : undefined;
      const oldTitle = snap.data()?.title;
      const renamed = typeof updates.title === "string" && typeof oldTitle === "string" && oldTitle.length > 0 && updates.title !== oldTitle;
      tx.update(projectRef, {
        ...updates,
        ...(tags ? { tags } : {}),
        ...(renamed ? { previousTitles: FieldValue.arrayUnion(oldTitle) } : {}),
        editedDetailFields: FieldValue.arrayUnion(...Object.keys(updates)),
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
