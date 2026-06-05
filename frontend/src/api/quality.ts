import { apiGet } from "./client";

export interface QualityIssue {
  id: string;
  severity: "High" | "Medium" | "Low";
  title: string;
  detail: string;
  action: string;
  entity_type: string;
  entity_id: string;
}

export function getQualityIssues(team?: string, scenarioId?: string): Promise<QualityIssue[]> {
  const params = new URLSearchParams();
  if (team) params.set("team", team);
  if (scenarioId) params.set("scenario_id", scenarioId);
  const query = params.toString();
  const path = query ? `/api/quality/issues?${query}` : "/api/quality/issues";
  return apiGet<QualityIssue[]>(path);
}
