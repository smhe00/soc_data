import { apiGet } from "./client";

export function getResponsibilityTeams(): Promise<string[]> {
  return apiGet<string[]>("/api/responsibilities/teams");
}
