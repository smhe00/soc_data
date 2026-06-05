import { apiGet } from "./client";
import type { TierInfo } from "../types/tier";

export function getTiers(scenarioId?: string): Promise<TierInfo[]> {
  const query = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return apiGet<TierInfo[]>(`/api/tiers${query}`);
}
