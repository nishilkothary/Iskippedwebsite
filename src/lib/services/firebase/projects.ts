import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./config";
import { Project } from "@/lib/types/models";

export const SEED_PROJECTS: Omit<Project, "id">[] = [
  {
    title: "Educate a child for a year",
    sponsor: "Caring for Cambodia",
    description: "Your savings fund a full year of quality education for a child in Cambodia, including tuition, uniforms, and school supplies.",
    goalAmount: 300,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://www.caringforcambodia.org/donate",
    isCustom: false,
    createdBy: null,
    tags: ["education", "children", "cambodia"],
  },
  {
    title: "Fund a Chromebook for students",
    sponsor: "Kenya Connect",
    description: "Help equip students in remote Kenyan villages with a Chromebook, unlocking digital learning and new opportunities.",
    goalAmount: 250,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://www.kenyaconnect.org/donate",
    isCustom: false,
    createdBy: null,
    tags: ["education", "technology", "kenya"],
  },
];

export async function seedProjectsIfEmpty(): Promise<void> {
  const snap = await getDocs(collection(db, "projects"));
  const official = snap.docs.filter((d) => !d.data().isCustom);

  for (const seed of SEED_PROJECTS) {
    const existing = official.find((d) => d.data().sponsor === seed.sponsor);
    if (!existing) {
      await addDoc(collection(db, "projects"), seed);
    } else {
      const data = existing.data();
      if (data.goalAmount !== seed.goalAmount || data.title !== seed.title || data.description !== seed.description) {
        await updateDoc(doc(db, "projects", existing.id), {
          goalAmount: seed.goalAmount,
          title: seed.title,
          description: seed.description,
        });
      }
    }
  }
}

export async function getAllProjects(): Promise<Project[]> {
  const snap = await getDocs(collection(db, "projects"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
}

export async function getProject(id: string): Promise<Project | null> {
  const snap = await getDoc(doc(db, "projects", id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Project) : null;
}

export async function addCustomProject(
  uid: string,
  data: { title: string; goalAmount: number; description?: string; donationURL?: string }
): Promise<string> {
  const ref = await addDoc(collection(db, "projects"), {
    ...data,
    sponsor: "Custom",
    description: data.description || "",
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

export function subscribeToProjects(callback: (projects: Project[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "projects"), (snap) => {
    const projects = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
    callback(projects);
  });
}
