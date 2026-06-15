"use client";
import { useEffect, useState } from "react";
import { subscribeToProjects, OFFICIAL_PROJECTS } from "@/lib/services/firebase/projects";
import { Project } from "@/lib/types/models";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>(OFFICIAL_PROJECTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToProjects((updated) => {
      setProjects(updated);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { projects, loading, refetch: () => {} };
}
