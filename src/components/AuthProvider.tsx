"use client";
import { useAuth } from "@/hooks/useAuth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useAuth();
  return <>{children}</>;
}
