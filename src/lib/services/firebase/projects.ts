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
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./config";
import { Project } from "@/lib/types/models";

export const OFFICIAL_PROJECTS: Project[] = [
  {
    id: "cfc",
    title: "A Student's Yearly Education",
    sponsor: "Caring for Cambodia",
    description: "Your savings fund a full year of quality education for a child in Cambodia, including tuition, uniforms, and school supplies.",
    goalAmount: 300,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://www.caringforcambodia.org/donate",
    isCustom: false,
    location: "Cambodia",
    createdBy: null,
    tags: ["education", "children", "cambodia"],
  },
  {
    id: "kc",
    title: "A Student's Chromebook",
    sponsor: "Kenya Connect",
    description: "Help equip students in remote Kenyan villages with a Chromebook, unlocking digital learning and new opportunities.",
    goalAmount: 250,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://www.kenyaconnect.org/donate",
    isCustom: false,
    location: "Kenya",
    createdBy: null,
    tags: ["education", "technology", "kenya"],
  },
  {
    id: "kc-library",
    title: "Support a Mobile Library for 3 Schools",
    sponsor: "Kenya Connect",
    description: "Your savings help bring a mobile library to three schools in rural Kenya, giving students access to books and learning resources.",
    goalAmount: 0,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://www.kenyaconnect.org/donate",
    isCustom: false,
    location: "Kenya",
    createdBy: null,
    tags: ["education", "library", "kenya"],
  },
  {
    id: "stm-palestine",
    title: "100 Life-Saving Meals",
    sponsor: "Share the Meal",
    description: "Your savings provide 100 emergency meals to families in need in Palestine.",
    goalAmount: 80,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://sharethemeal.org/en-us/campaigns/palestine11",
    isCustom: false,
    location: "Palestine",
    createdBy: null,
    tags: ["food", "emergency", "palestine"],
  },
  {
    id: "stm-ukraine",
    title: "100 Emergency Meals",
    sponsor: "Share the Meal",
    description: "Your savings provide 100 emergency meals to families displaced by conflict in Ukraine.",
    goalAmount: 80,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://sharethemeal.org/en-us/campaigns/ukraine1",
    isCustom: false,
    location: "Ukraine",
    createdBy: null,
    tags: ["food", "emergency", "ukraine"],
  },
  {
    id: "stm-syria",
    title: "Share 100 Meals with Families in Need",
    sponsor: "Share the Meal",
    description: "Your savings provide 100 meals to families in need in Syria.",
    goalAmount: 80,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://sharethemeal.org/en-us/campaigns/syria10",
    isCustom: false,
    location: "Syria",
    createdBy: null,
    tags: ["food", "emergency", "syria"],
  },
  {
    id: "tsf-barbra",
    title: "Barbra's Education",
    sponsor: "The School Fund",
    description: "Your savings help fund Barbra's education in Kenya, giving her the opportunity to stay in school and build a better future.",
    goalAmount: 600,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://theschoolfund.org/cgi-bin/dyn?c=view&t=student&i=8828&year=2027",
    isCustom: false,
    location: "Kenya",
    createdBy: null,
    tags: ["education", "kenya"],
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

export async function getProject(id: string): Promise<Project | null> {
  // Check official projects first
  const official = OFFICIAL_PROJECTS.find((p) => p.id === id);
  if (official) return official;
  const snap = await getDoc(doc(db, "projects", id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Project) : null;
}

export async function addCustomProject(
  uid: string,
  data: { title: string; sponsor?: string; location?: string; goalAmount: number; description?: string; donationURL?: string }
): Promise<string> {
  const ref = await addDoc(collection(db, "projects"), {
    title: data.title,
    sponsor: data.sponsor || data.title,
    location: data.location || null,
    description: data.description || "",
    goalAmount: data.goalAmount,
    totalRaised: 0,
    imageURL: null,
    donationURL: data.donationURL || null,
    isCustom: true,
    createdBy: uid,
    tags: ["custom"],
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCustomProject(
  projectId: string,
  data: { title: string; sponsor?: string; location?: string; goalAmount: number; donationURL?: string }
): Promise<void> {
  await updateDoc(doc(db, "projects", projectId), {
    title: data.title,
    sponsor: data.sponsor || data.title,
    location: data.location || null,
    goalAmount: data.goalAmount,
    donationURL: data.donationURL || null,
  });
}

export async function deleteCustomProject(projectId: string): Promise<void> {
  await deleteDoc(doc(db, "projects", projectId));
}

export function subscribeToProjects(callback: (projects: Project[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "projects"), (snap) => {
    const custom = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Project))
      .filter((p) => p.isCustom);
    callback([...OFFICIAL_PROJECTS, ...custom]);
  });
}
