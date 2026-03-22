"use client";
import { useEffect, useState } from "react";
import { getAllProjects } from "@/lib/services/firebase/projects";
import { Project } from "@/lib/types/models";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  return { projects, loading, refetch: () => getAllProjects().then(setProjects) };
}
