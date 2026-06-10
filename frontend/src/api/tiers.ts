import { apiGet } from "./client";
import type { TierInfo } from "../types/tier";

export function getTiers(implOptionId?: string): Promise<TierInfo[]> {
  const query = implOptionId ? `?impl_option_id=${encodeURIComponent(implOptionId)}` : "";
  return apiGet<TierInfo[]>(`/api/tiers${query}`);
}
