import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  onSnapshot,
  Timestamp,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./config";
import { Project } from "@/lib/types/models";

export const OFFICIAL_PROJECTS: Project[] = [
  {
    id: "cfc",
    title: "A Student's Education in Cambodia",
    sponsor: "Caring for Cambodia",
    description: "quality education for a child in Cambodia, including tuition, uniforms, and school supplies.",
    goalAmount: parseFloat((365 * parseFloat((300 / 365).toFixed(4))).toFixed(2)),
    totalRaised: 0,
    imageURL: "/causes/cfc.jpg",
    donationURL: "https://www.caringforcambodia.org/donate",
    isCustom: false,
    location: "Cambodia",
    unitName: "Day of Education",
    unitDisplay: "days",
    unitCost: parseFloat((300 / 365).toFixed(4)), // ~$0.8219
    createdBy: null,
    groupName: "Educate Cambodia's Children",
    tags: ["education", "children", "cambodia"],
    visibility: "public" as const,
  },
  {
    id: "kc",
    title: "Laptops for Students",
    groupName: "Kenya's Students",
    sponsor: "Kenya Connect",
    description: "digital learning and new opportunities for students in remote Kenyan villages.",
    goalAmount: 750,
    totalRaised: 0,
    imageURL: "/causes/KC Chromebook.jpg",
    donationURL: "https://www.kenyaconnect.org/donate",
    learnMoreURL: "https://www.kenyaconnect.org/",
    isCustom: false,
    location: "Kenya",
    unitName: "Laptop",
    unitDisplay: "laptops",
    unitCost: 250,
    unitIsGoal: true,
    unitPhrase: "a laptop for a student in a remote village",
    createdBy: null,
    tags: ["education", "technology", "kenya"],
    visibility: "public" as const,
  },
  {
    id: "pop-education",
    title: "Educational Opportunities For a Student",
    sponsor: "Pencils of Promise",
    description: "student support and well-being through schools, trained teachers, and quality education in Ghana, Guatemala, and Laos.",
    goalAmount: parseFloat((364 * 0.27).toFixed(2)),
    totalRaised: 0,
    imageURL: "/causes/Pencils of Promose.jpg",
    imagePosition: "top",
    donationURL: "https://pencilsofpromise.org/ways-to-support/",
    learnMoreURL: "https://pencilsofpromise.org/about/",
    isCustom: false,
    location: "Ghana, Guatemala, and Laos",
    unitName: "Day of Education",
    unitDisplay: "days",
    unitCost: 0.27,
    groupName: "Pencils for Promise",
    createdBy: null,
    tags: ["official", "education"],
    visibility: "public" as const,
  },
  {
    id: "stm-palestine",
    title: "Life-Saving Meals in Palestine",
    sponsor: "Share the Meal",
    description: "emergency meals for families in need in Palestine.",
    goalAmount: 80,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://sharethemeal.org/en-us/campaigns/palestine11",
    isCustom: false,
    location: "Palestine",
    unitName: "Life-Saving Meal",
    unitDisplay: "meals",
    unitCost: 0.80,
    createdBy: null,
    tags: ["food", "emergency", "palestine"],
    visibility: "public" as const,
  },
  {
    id: "stm-ukraine",
    title: "Emergency Meals in Ukraine",
    sponsor: "Share the Meal",
    description: "emergency meals for families displaced by conflict in Ukraine.",
    goalAmount: 80,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://sharethemeal.org/en-us/campaigns/ukraine1",
    isCustom: false,
    location: "Ukraine",
    unitName: "Emergency Meal",
    unitDisplay: "meals",
    unitCost: 0.80,
    createdBy: null,
    tags: ["food", "emergency", "ukraine"],
    visibility: "public" as const,
  },
  {
    id: "stm-syria",
    title: "Meals in Syria",
    sponsor: "Share the Meal",
    description: "meals for families in need in Syria.",
    goalAmount: 80,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://sharethemeal.org/en-us/campaigns/syria10",
    isCustom: false,
    location: "Syria",
    unitName: "Meal",
    unitDisplay: "meals",
    unitCost: 0.80,
    createdBy: null,
    tags: ["food", "emergency", "syria"],
    visibility: "public" as const,
  },
  {
    id: "new-incentives",
    title: "Infant Vaccination Program in Nigeria",
    sponsor: "New Incentives",
    groupName: "Child Vaccination in Nigeria",
    imagePosition: "left center",
    description: "routine vaccinations for infants in northern Nigeria through caregiver incentives that help families reach clinics.",
    goalAmount: 80,
    totalRaised: 0,
    imageURL: "/causes/New Incentives.jpg",
    donationURL: "https://www.newincentives.org/donate",
    learnMoreURL: "https://www.newincentives.org/our-work",
    isCustom: false,
    location: "Nigeria",
    unitName: "Child Vaccination Program",
    unitDisplay: "vaccination programs",
    unitCost: 16,
    unitIsGoal: true,
    createdBy: null,
    tags: ["health", "children", "nigeria"],
    visibility: "public" as const,
  },
];

/** Official causes actively offered to users (pick-a-cause grids, partner challenges). The rest of OFFICIAL_PROJECTS is kept for existing users' history but no longer promoted. */
export const PARTNER_CHALLENGE_IDS = ["cfc", "kc", "pop-education", "new-incentives"];

function mergeWithOfficials(firestoreDocs: Project[]): Project[] {
  const firestoreById = new Map(firestoreDocs.map((d) => [d.id, d]));
  const officials = OFFICIAL_PROJECTS.map((p) => {
    const fs = firestoreById.get(p.id);
    return fs
      ? {
          ...fs,
          ...p,
          totalRaised: fs.totalRaised ?? p.totalRaised,
          totalDonated: fs.totalDonated ?? p.totalDonated,
          totalSkips: fs.totalSkips ?? p.totalSkips,
          status: fs.status ?? p.status,
          startDate: fs.startDate ?? p.startDate,
          endDate: fs.endDate ?? p.endDate,
          memberUids: fs.memberUids ?? p.memberUids,
        }
      : p;
  });
  const officialIds = new Set(OFFICIAL_PROJECTS.map((p) => p.id));
  const custom = firestoreDocs.filter((p) => p.isCustom && !officialIds.has(p.id));
  return [...officials, ...custom];
}

export function subscribeToProjects(callback: (projects: Project[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, "projects"),
    (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
      callback(mergeWithOfficials(docs));

      // Seed any official projects not yet in Firestore so totalRaised can be incremented
      const firestoreIds = new Set(docs.map((d) => d.id));
      const missing = OFFICIAL_PROJECTS.filter((p) => !firestoreIds.has(p.id));
      if (missing.length > 0) {
        const batch = writeBatch(db);
        for (const p of missing) {
          batch.set(doc(db, "projects", p.id), { totalRaised: 0, memberUids: [], isCustom: false }, { merge: true });
        }
        batch.commit().catch(() => {});
      }
    },
    () => callback(OFFICIAL_PROJECTS),
  );
}

export async function getAllProjects(): Promise<Project[]> {
  try {
    const snap = await getDocs(collection(db, "projects"));
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
    return mergeWithOfficials(docs);
  } catch {
    return OFFICIAL_PROJECTS;
  }
}

export function isChallengeProject(project: Project): boolean {
  if (project.projectKind) return project.projectKind === "challenge";
  // Legacy custom projects created before projectKind field was added default to challenge
  return project.tags?.includes("challenge") || !!project.isCustom;
}

export function isCauseProject(project: Project): boolean {
  return !isChallengeProject(project);
}

export function isProjectEnded(project: Project): boolean {
  if (project.status === "ended") return true;
  if (project.endDate) {
    const ms = typeof (project.endDate as any).toMillis === "function"
      ? (project.endDate as any).toMillis()
      : NaN;
    return !isNaN(ms) && ms < Date.now();
  }
  return false;
}

export async function getProject(id: string): Promise<Project | null> {
  // Check official projects first
  const official = OFFICIAL_PROJECTS.find((p) => p.id === id);
  if (official) return official;
  const snap = await getDoc(doc(db, "projects", id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Project) : null;
}

export async function addCustomProject(
  uid: string,
  data: {
    title: string;
    projectKind?: "cause" | "challenge";
    parentProjectId?: string | null;
    sponsor?: string;
    location?: string;
    goalAmount: number;
    description?: string;
    donationURL?: string;
    donationNote?: string;
    tags?: string[];
    imageURL?: string;
    imagePosition?: string;
    unitName?: string;
    unitDisplay?: string;
    unitCost?: number;
    unitIsGoal?: boolean;
    unitPhrase?: string;
    skipMilestones?: { level1: number; level2: number; level3: number };
    visibility?: "public" | "private" | "unlisted" | "password";
    password?: string;
    durationDays?: number | null;
    groupName?: string;
  }
): Promise<string> {
  const startDate = Timestamp.now();
  const endDate = data.durationDays
    ? Timestamp.fromMillis(Date.now() + data.durationDays * 86400_000)
    : null;
  const ref = await addDoc(collection(db, "projects"), {
    title: data.title,
    projectKind: data.projectKind || "cause",
    parentProjectId: data.parentProjectId || null,
    sponsor: data.sponsor || "",
    location: data.location || null,
    description: data.description || "",
    goalAmount: data.goalAmount,
    totalRaised: 0,
    imageURL: data.imageURL || null,
    imagePosition: data.imagePosition || null,
    donationURL: data.donationURL || null,
    donationNote: data.donationNote || null,
    unitName: data.unitName || null,
    unitDisplay: data.unitDisplay || null,
    unitCost: data.unitCost || null,
    unitIsGoal: data.unitIsGoal || false,
    unitPhrase: data.unitPhrase || null,
    skipMilestones: data.skipMilestones || null,
    visibility: data.visibility || "public",
    password: data.password || null,
    groupName: data.groupName || null,
    isCustom: true,
    createdBy: uid,
    tags: data.tags?.length ? data.tags : ["custom"],
    createdAt: serverTimestamp(),
    startDate,
    endDate,
  });
  return ref.id;
}

export async function updateCustomProject(
  uid: string,
  projectId: string,
  data: {
    title: string;
    sponsor?: string;
    location?: string;
    goalAmount: number;
    donationURL?: string;
    donationNote?: string;
    description?: string;
    imageURL?: string;
    imagePosition?: string;
    unitName?: string;
    unitDisplay?: string;
    unitCost?: number;
    unitIsGoal?: boolean;
    unitPhrase?: string;
    skipMilestones?: { level1: number; level2: number; level3: number };
    visibility?: "public" | "private" | "unlisted" | "password";
    password?: string;
    tags?: string[];
    durationDays?: number | null;
    groupName?: string;
  }
): Promise<void> {
  const snap = await getDoc(doc(db, "projects", projectId));
  if (!snap.exists() || snap.data().createdBy !== uid) throw new Error("Not authorized");
  const endDate =
    data.durationDays !== undefined
      ? data.durationDays
        ? Timestamp.fromMillis(Date.now() + data.durationDays * 86400_000)
        : null
      : undefined;
  await updateDoc(doc(db, "projects", projectId), {
    title: data.title,
    groupName: data.groupName || null,
    sponsor: data.sponsor || data.title,
    location: data.location || null,
    goalAmount: data.goalAmount,
    donationURL: data.donationURL || null,
    donationNote: data.donationNote || null,
    description: data.description || "",
    imageURL: data.imageURL || null,
    imagePosition: data.imagePosition || null,
    unitName: data.unitName || null,
    unitDisplay: data.unitDisplay || null,
    unitCost: data.unitCost || null,
    unitIsGoal: data.unitIsGoal || false,
    unitPhrase: data.unitPhrase || null,
    skipMilestones: data.skipMilestones || null,
    visibility: data.visibility || "public",
    password: data.password || null,
    ...(data.tags ? { tags: data.tags } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
  });
}

export async function setChallengeDeadline(
  uid: string,
  projectId: string,
  endDate: Date | null
): Promise<void> {
  const snap = await getDoc(doc(db, "projects", projectId));
  if (!snap.exists() || snap.data().createdBy !== uid) throw new Error("Not authorized");
  await updateDoc(doc(db, "projects", projectId), {
    endDate: endDate ? Timestamp.fromDate(endDate) : null,
  });
}

export async function endChallenge(uid: string, projectId: string): Promise<void> {
  const snap = await getDoc(doc(db, "projects", projectId));
  if (!snap.exists() || snap.data().createdBy !== uid) throw new Error("Not authorized");
  await updateDoc(doc(db, "projects", projectId), { status: "ended" });
}

export async function deleteCustomProject(uid: string, projectId: string): Promise<void> {
  const snap = await getDoc(doc(db, "projects", projectId));
  if (!snap.exists() || snap.data().createdBy !== uid) throw new Error("Not authorized");
  await deleteDoc(doc(db, "projects", projectId));
}

export function subscribeToProject(projectId: string, callback: (project: Project | null) => void): Unsubscribe {
  return onSnapshot(doc(db, "projects", projectId), (snap) => {
    callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Project) : null);
  });
}
