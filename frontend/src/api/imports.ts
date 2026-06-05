import { API_BASE_URL } from "./client";

export interface ImportResult {
  filename: string;
  imported: Record<string, number>;
  errors: string[];
}

function scopedQuery(team?: string, scenarioId?: string): string {
  const params = new URLSearchParams();
  if (team) params.set("team", team);
  if (scenarioId) params.set("scenario_id", scenarioId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function importTemplateUrl(team?: string, scenarioId?: string): string {
  return `${API_BASE_URL}/api/import/template${scopedQuery(team, scenarioId)}`;
}

export async function uploadImportWorkbook(file: File, team?: string, scenarioId?: string): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/import/excel${scopedQuery(team, scenarioId)}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(typeof detail?.detail === "string" ? detail.detail : JSON.stringify(detail?.detail ?? detail));
  }

  return response.json() as Promise<ImportResult>;
}
