import { API_BASE_URL } from "./client";

export interface ImportResult {
  filename: string;
  imported: Record<string, number>;
  errors: string[];
}

export function importTemplateUrl(team?: string): string {
  const query = team ? `?team=${encodeURIComponent(team)}` : "";
  return `${API_BASE_URL}/api/import/template${query}`;
}

export async function uploadImportWorkbook(file: File, team?: string): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const query = team ? `?team=${encodeURIComponent(team)}` : "";

  const response = await fetch(`${API_BASE_URL}/api/import/excel${query}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(typeof detail?.detail === "string" ? detail.detail : JSON.stringify(detail?.detail ?? detail));
  }

  return response.json() as Promise<ImportResult>;
}
