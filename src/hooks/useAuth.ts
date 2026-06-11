"use client";
import { useEffect, useRef } from "react";
import { onAuthChange } from "@/lib/services/firebase/auth";
import { useAuthStore } from "@/store/authStore";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/services/firebase/config";
import { resetActiveProjectIfRemoved } from "@/lib/services/firebase/users";

export function useAuth() {
  const { user, profile, isLoading, setUser, setProfile, setLoading } = useAuthStore();
  const causeChecked = useRef(false);

  useEffect(() => {
    const unsubAuth = onAuthChange(async (authUser) => {
      setUser(authUser);
      causeChecked.current = false;
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
          if (!causeChecked.current && data.activeProjectId) {
            causeChecked.current = true;
            resetActiveProjectIfRemoved(authUser.uid, data.activeProjectId);
          }
          setProfile(data);
        }
        setLoading(false);
      });
      return () => unsubProfile();
    });
    return () => unsubAuth();
  }, []);

  return { user, profile, isLoading };
}
