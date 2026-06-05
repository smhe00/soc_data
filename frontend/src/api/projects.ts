import { apiGet } from "./client";
import type { Project } from "../types/project";

export function getProjects(): Promise<Project[]> {
  return apiGet<Project[]>("/api/projects");
}
