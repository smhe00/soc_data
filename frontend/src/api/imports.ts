import { API_BASE_URL } from "./client";

export interface ImportResult {
  filename: string;
  imported: Record<string, number>;
  errors: string[];
}

function scopedQuery(team?: string, implOptionId?: string): string {
  const params = new URLSearchParams();
  if (team) params.set("team", team);
  if (implOptionId) params.set("impl_option_id", implOptionId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function importTemplateUrl(team?: string, implOptionId?: string): string {
  return `${API_BASE_URL}/api/import/template${scopedQuery(team, implOptionId)}`;
}

export async function uploadImportWorkbook(file: File, team?: string, implOptionId?: string): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/import/excel${scopedQuery(team, implOptionId)}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(typeof detail?.detail === "string" ? detail.detail : JSON.stringify(detail?.detail ?? detail));
  }

  return response.json() as Promise<ImportResult>;
}
