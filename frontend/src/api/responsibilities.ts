import { apiGet } from "./client";

export function getResponsibilityTeams(scenarioId?: string): Promise<string[]> {
  const query = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return apiGet<string[]>(`/api/responsibilities/teams${query}`);
}
