export const DEMO_MODE = false;

import { Timestamp } from "firebase/firestore";

export const DEMO_USER = {
  uid: "demo-user-123",
  email: "demo@iskip.app",
  displayName: "Demo Skipper",
  photoURL: null,
} as const;

export const DEMO_PROFILE = {
  uid: "demo-user-123",
  displayName: "Demo Skipper",
  email: "demo@iskip.app",
  photoURL: null,
  totalSaved: 47.5,
  totalSkips: 12,
  streak: 3,
  longestStreak: 5,
  xp: 340,
  level: 2,
  activeProjectId: "demo-project-1",
  savedTowardActiveCause: 47.5,
  totalDonated: 0,
  followingCount: 2,
  followersCount: 5,
  lastSkipDate: new Date().toISOString().split("T")[0],
  createdAt: null as any,
  favoriteCauseIds: [] as string[],
};
