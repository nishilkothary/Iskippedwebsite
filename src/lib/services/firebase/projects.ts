import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
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
    description: "Your savings fund a full year of quality education for a child in Cambodia, including tuition, uniforms, and school supplies.",
    goalAmount: 300,
    totalRaised: 0,
    imageURL: "/causes/cfc.jpg",
    donationURL: "https://www.caringforcambodia.org/donate",
    isCustom: false,
    location: "Cambodia",
    unitName: "Day of Education",
    unitDisplay: "days",
    unitCost: parseFloat((300 / 365).toFixed(4)), // ~$0.8219
    createdBy: null,
    tags: ["education", "children", "cambodia"],
  },
  {
    id: "kc",
    title: "A Chromebook for A Student In Kenya",
    sponsor: "Kenya Connect",
    description: "Help equip students in remote Kenyan villages with a Chromebook, unlocking digital learning and new opportunities.",
    goalAmount: 250,
    totalRaised: 0,
    imageURL: "/causes/KC Chromebook.jpg",
    donationURL: "https://www.kenyaconnect.org/donate",
    isCustom: false,
    location: "Kenya",
    unitName: "Chromebook",
    unitDisplay: "chromebook",
    unitCost: 250,
    unitIsGoal: true,
    createdBy: null,
    tags: ["education", "technology", "kenya"],
  },
  {
    id: "kc-library",
    title: "A Mobile Library for Schools in Kenya",
    sponsor: "Kenya Connect",
    description: "Your savings help bring a mobile library to schools in rural Kenya, giving students access to books and learning resources.",
    goalAmount: 166.67,
    totalRaised: 0,
    imageURL: "/causes/KC Mobile Library.jpg",
    donationURL: "https://www.kenyaconnect.org/donate",
    isCustom: false,
    location: "Kenya",
    unitName: "Mobile Library",
    unitDisplay: "mobile library",
    unitCost: 166.67,
    unitIsGoal: true,
    createdBy: null,
    tags: ["education", "library", "kenya"],
  },
  {
    id: "pop-education",
    title: "Educational Opportunities For a Student",
    sponsor: "Pencils of Promise",
    description: "Pencils of Promise partners with communities in Ghana, Guatemala, and Laos to build schools, train teachers, and support student wellbeing — giving every child access to the quality education they deserve.",
    goalAmount: 0,
    totalRaised: 0,
    imageURL: "/causes/Pencils of Promose.jpg",
    imagePosition: "top",
    donationURL: "https://pencilsofpromise.org/ways-to-support/",
    learnMoreURL: "https://pencilsofpromise.org/about/",
    isCustom: false,
    location: "Ghana, Guatemala, and Laos",
    unitName: "Day of Educational Support",
    unitDisplay: "days",
    unitCost: parseFloat((100 / 365).toFixed(4)), // ~$0.2740
    createdBy: null,
    tags: ["official", "education"],
  },
  {
    id: "stm-palestine",
    title: "Life-Saving Meals in Palestine",
    sponsor: "Share the Meal",
    description: "Your savings provide emergency meals to families in need in Palestine.",
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
  },
  {
    id: "stm-ukraine",
    title: "Emergency Meals in Ukraine",
    sponsor: "Share the Meal",
    description: "Your savings provide emergency meals to families displaced by conflict in Ukraine.",
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
  },
  {
    id: "stm-syria",
    title: "Meals in Syria",
    sponsor: "Share the Meal",
    description: "Your savings provide meals to families in need in Syria.",
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
  },
  {
    id: "mc-nets",
    title: "Malaria Mosquito Nets",
    sponsor: "Malaria Consortium",
    description: "Long-lasting insecticidal nets that protect families from malaria-carrying mosquitoes while they sleep.",
    goalAmount: 0,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://www.malariaconsortium.org/donate-to-malaria-consortium",
    learnMoreURL: "https://www.malariaconsortium.org/about-us/who-we-are",
    isCustom: false,
    unitName: "Mosquito Net",
    unitDisplay: "nets",
    unitCost: 2.27,
    createdBy: null,
    tags: ["official", "health"],
  },
];

export async function getAllProjects(): Promise<Project[]> {
  try {
    const snap = await getDocs(collection(db, "projects"));
    const custom = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Project))
      .filter((p) => p.isCustom);
    return [...OFFICIAL_PROJECTS, ...custom];
  } catch {
    return OFFICIAL_PROJECTS;
  }
}

export function isChallengeProject(project: Project): boolean {
  return project.projectKind === "challenge" || project.tags?.includes("challenge");
}

export function isCauseProject(project: Project): boolean {
  return !isChallengeProject(project);
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
    tags?: string[];
    imageURL?: string;
    unitName?: string;
    unitDisplay?: string;
    unitCost?: number;
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
    donationURL: data.donationURL || null,
    unitName: data.unitName || null,
    unitDisplay: data.unitDisplay || null,
    unitCost: data.unitCost || null,
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
    description?: string;
    imageURL?: string;
    unitName?: string;
    unitDisplay?: string;
    unitCost?: number;
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
    description: data.description || "",
    imageURL: data.imageURL || null,
    unitName: data.unitName || null,
    unitDisplay: data.unitDisplay || null,
    unitCost: data.unitCost || null,
    skipMilestones: data.skipMilestones || null,
    visibility: data.visibility || "public",
    password: data.password || null,
    ...(data.tags ? { tags: data.tags } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
  });
}

export async function extendChallengeDeadline(
  uid: string,
  projectId: string,
  additionalDays: number
): Promise<void> {
  const snap = await getDoc(doc(db, "projects", projectId));
  if (!snap.exists() || snap.data().createdBy !== uid) throw new Error("Not authorized");
  const existing = snap.data().endDate as Timestamp | null;
  const baseMs = existing && existing.toMillis() > Date.now()
    ? existing.toMillis()
    : Date.now();
  const newEndDate = Timestamp.fromMillis(baseMs + additionalDays * 86400_000);
  await updateDoc(doc(db, "projects", projectId), { endDate: newEndDate });
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
