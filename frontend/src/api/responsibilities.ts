import { apiGet } from "./client";

export function getResponsibilityTeams(implOptionId?: string): Promise<string[]> {
  const query = implOptionId ? `?impl_option_id=${encodeURIComponent(implOptionId)}` : "";
  return apiGet<string[]>(`/api/responsibilities/teams${query}`);
}
