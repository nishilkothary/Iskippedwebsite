// Run: node scripts/seed-official-causes.js
// Seeds all 8 official causes to Firestore so progress tracking works
// and they can be managed through the UI.
//
// Requires FIREBASE_SERVICE_ACCOUNT_PATH in .env.local (already configured).
// The script looks up your UID by email automatically.

require("dotenv").config({ path: ".env.local" });
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const fs = require("fs");

// --- Init Admin SDK ---
const serviceAccount = JSON.parse(
  fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf-8")
);
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const auth = getAuth(app);

// --- Official projects (mirrored from src/lib/services/firebase/projects.ts) ---
const OFFICIAL_PROJECTS = [
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
    unitCost: parseFloat((300 / 365).toFixed(4)),
    tags: ["education", "children", "cambodia"],
    visibility: "public",
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
    tags: ["education", "technology", "kenya"],
    visibility: "public",
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
    tags: ["education", "library", "kenya"],
    visibility: "public",
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
    unitCost: parseFloat((100 / 365).toFixed(4)),
    tags: ["official", "education"],
    visibility: "public",
  },
  {
    id: "stm-palestine",
    title: "Life-Saving Meals in Palestine",
    sponsor: "Share the Meal",
    description: "Your savings provide emergency meals to families in need in Palestine.",
    goalAmount: 0,
    totalRaised: 0,
    imageURL: null,
    donationURL: "https://sharethemeal.org/en-us/campaigns/palestine11",
    isCustom: false,
    location: "Palestine",
    unitName: "Life-Saving Meal",
    unitDisplay: "meals",
    unitCost: 0.80,
    tags: ["food", "emergency", "palestine"],
    visibility: "public",
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
    tags: ["food", "emergency", "ukraine"],
    visibility: "public",
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
    tags: ["food", "emergency", "syria"],
    visibility: "public",
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
    tags: ["official", "health"],
    visibility: "public",
  },
];

async function seed() {
  // Look up admin UID by email
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (!adminEmail) throw new Error("NEXT_PUBLIC_ADMIN_EMAIL not set in .env.local");

  console.log(`Looking up UID for ${adminEmail}...`);
  const adminUser = await auth.getUserByEmail(adminEmail);
  const adminUid = adminUser.uid;
  console.log(`Admin UID: ${adminUid}\n`);

  for (const project of OFFICIAL_PROJECTS) {
    const { id, ...data } = project;
    const ref = db.collection("projects").doc(id);
    const existing = await ref.get();

    const payload = {
      ...data,
      createdBy: adminUid,
      // Preserve existing totalRaised if the doc already exists
      totalRaised: existing.exists ? (existing.data().totalRaised ?? 0) : 0,
      memberUids: existing.exists ? (existing.data().memberUids ?? []) : [],
    };

    await ref.set(payload, { merge: false });
    console.log(`✓ ${id} — ${project.title}`);
  }

  console.log(`\nDone. All 8 causes seeded to Firestore under UID ${adminUid}.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
