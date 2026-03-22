"use client";
import { useEffect } from "react";
import { onAuthChange } from "@/lib/services/firebase/auth";
import { useAuthStore } from "@/store/authStore";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/services/firebase/config";
import { getAllProjects } from "@/lib/services/firebase/projects";
import { setActiveProject } from "@/lib/services/firebase/users";

export function useAuth() {
  const { user, profile, isLoading, setUser, setProfile, setLoading, updateProfile } = useAuthStore();

  useEffect(() => {
    const unsubAuth = onAuthChange(async (authUser) => {
      setUser(authUser);
      if (!authUser) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const unsubProfile = onSnapshot(doc(db, "users", authUser.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data() as any;
          if (authUser.displayName && (!data.displayName || data.displayName === "Skipper")) {
            updateDoc(doc(db, "users", authUser.uid), { displayName: authUser.displayName });
          }
          setProfile(data);
          if (!data.activeProjectId) {
            getAllProjects().then((projects) => {
              const cfc = projects.find((p) => p.title?.includes("Cambodia"));
              if (cfc) {
                setActiveProject(authUser.uid, cfc.id);
                updateProfile({ activeProjectId: cfc.id });
              }
            });
          }
        }
        setLoading(false);
      });
      return () => unsubProfile();
    });
    return () => unsubAuth();
  }, []);

  return { user, profile, isLoading };
}
