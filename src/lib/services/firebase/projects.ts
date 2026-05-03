import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
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
    imageURL: null,
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
    title: "A Chromebook for a Student to Learn Coding",
    sponsor: "Kenya Connect",
    description: "Help equip students in remote Kenyan villages with a Chromebook, unlocking digital learning and new opportunities.",
    goalAmount: 250,
    totalRaised: 0,
    imageURL: null,
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
    imageURL: null,
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
    id: "mc-tests",
    title: "Malaria Diagnostic Tests",
    sponsor: "Malaria Consortium",
    description: "Rapid diagnostic tests that detect malaria in minutes, enabling life-saving treatment in remote areas.",
    goalAmount: 0,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://www.malariaconsortium.org/donate-to-malaria-consortium",
    learnMoreURL: "https://www.malariaconsortium.org/about-us/who-we-are",
    isCustom: false,
    location: "Sub-Saharan Africa",
    unitName: "Malaria Test",
    unitDisplay: "tests",
    unitCost: 0.41,
    createdBy: null,
    tags: ["official", "health"],
  },
  {
    id: "mc-medication",
    title: "Vials of Malaria Medication",
    sponsor: "Malaria Consortium",
    description: "Critical antimalarial medication vials that treat severe malaria cases, especially in young children.",
    goalAmount: 0,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://www.malariaconsortium.org/donate-to-malaria-consortium",
    learnMoreURL: "https://www.malariaconsortium.org/about-us/who-we-are",
    isCustom: false,
    location: "Sub-Saharan Africa",
    unitName: "Vial of Medication",
    unitDisplay: "vials",
    unitCost: 2.17,
    createdBy: null,
    tags: ["official", "health"],
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
    location: "Sub-Saharan Africa",
    unitName: "Mosquito Net",
    unitDisplay: "nets",
    unitCost: 2.27,
    createdBy: null,
    tags: ["official", "health"],
  },
  {
    id: "tsf-barbra",
    title: "Barbra's Education in Kenya",
    sponsor: "The School Fund",
    description: "Your savings help fund Barbra's education in Kenya, giving her the opportunity to stay in school and build a better future.",
    goalAmount: 600,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://theschoolfund.org/cgi-bin/dyn?c=view&t=student&i=8828&year=2027",
    isCustom: false,
    location: "Kenya",
    unitName: "Day of Education",
    unitDisplay: "days",
    unitCost: parseFloat((600 / 365).toFixed(4)), // ~$1.6438
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
  uid: string,
  projectId: string,
  data: { title: string; sponsor?: string; location?: string; goalAmount: number; donationURL?: string }
): Promise<void> {
  const snap = await getDoc(doc(db, "projects", projectId));
  if (!snap.exists() || snap.data().createdBy !== uid) throw new Error("Not authorized");
  await updateDoc(doc(db, "projects", projectId), {
    title: data.title,
    sponsor: data.sponsor || data.title,
    location: data.location || null,
    goalAmount: data.goalAmount,
    donationURL: data.donationURL || null,
  });
}

export async function deleteCustomProject(uid: string, projectId: string): Promise<void> {
  const snap = await getDoc(doc(db, "projects", projectId));
  if (!snap.exists() || snap.data().createdBy !== uid) throw new Error("Not authorized");
  await deleteDoc(doc(db, "projects", projectId));
}

