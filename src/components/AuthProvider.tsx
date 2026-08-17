"use client";
import { useAuth } from "@/hooks/useAuth";
import { ExtensionSync } from "@/components/ExtensionSync";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useAuth();
  return (
    <>
      <ExtensionSync />
      {children}
    </>
  );
}
