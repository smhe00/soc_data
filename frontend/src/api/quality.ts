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

export function getQualityIssues(): Promise<QualityIssue[]> {
  return apiGet<QualityIssue[]>("/api/quality/issues");
}
