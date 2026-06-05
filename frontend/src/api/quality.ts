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

export function getQualityIssues(team?: string): Promise<QualityIssue[]> {
  const path = team ? `/api/quality/issues?team=${encodeURIComponent(team)}` : "/api/quality/issues";
  return apiGet<QualityIssue[]>(path);
}
