"use client";
import { useEffect, useState } from "react";
import { getAllProjects, OFFICIAL_PROJECTS } from "@/lib/services/firebase/projects";
import { Project } from "@/lib/types/models";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>(OFFICIAL_PROJECTS);

  useEffect(() => {
    getAllProjects().then(setProjects);
  }, []);

  return { projects, loading: false, refetch: () => getAllProjects().then(setProjects) };
}
