"use client";
import { useEffect, useRef } from "react";
import { onAuthChange } from "@/lib/services/firebase/auth";
import { useAuthStore } from "@/store/authStore";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/services/firebase/config";
import { resetActiveProjectIfRemoved } from "@/lib/services/firebase/users";
import { UserProfile } from "@/lib/types/models";

export function useAuth() {
  const { user, profile, isLoading, setUser, setProfile, setLoading } = useAuthStore();
  const causeChecked = useRef(false);
  // Held in a ref so the auth callback can clean it up without stale closure issues.
  // Returning cleanup from an async callback doesn't work — the return value is a Promise,
  // not the cleanup function, so Firebase Auth would never call it.
  const unsubProfileRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthChange(async (authUser) => {
      // Always tear down the previous profile listener before creating a new one
      unsubProfileRef.current?.();
      unsubProfileRef.current = null;

      // A later sign-in can arrive after the initial signed-out callback has
      // already set loading to false. Settle every auth transition afresh so a
      // protected route never races ahead of the matching profile.
      setLoading(true);
      setUser(authUser);
      causeChecked.current = false;
      if (!authUser) {
        setProfile(null);
        setLoading(false);
        return;
      }
      if (useAuthStore.getState().profile?.uid !== authUser.uid) {
        setProfile(null);
      }
      unsubProfileRef.current = onSnapshot(
        doc(db, "users", authUser.uid),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            if (authUser.displayName && (!data.displayName || data.displayName === "Skipper")) {
              updateDoc(doc(db, "users", authUser.uid), { displayName: authUser.displayName }).catch(() => {});
            }
            if (authUser.emailVerified && !data.emailVerified) {
              updateDoc(doc(db, "users", authUser.uid), { emailVerified: true }).catch(() => {});
            }
            if (!causeChecked.current && data.activeProjectId) {
              causeChecked.current = true;
              resetActiveProjectIfRemoved(authUser.uid, data.activeProjectId);
            }
            setProfile(data);
          } else {
            setProfile(null);
          }
          setLoading(false);
        },
        () => {
          // Do not leave the entire app behind an infinite spinner when Firestore
          // temporarily loses its live connection.
          setLoading(false);
        }
      );
    });
    return () => {
      unsubAuth();
      unsubProfileRef.current?.();
      unsubProfileRef.current = null;
    };
  }, []);

  return { user, profile, isLoading };
}
