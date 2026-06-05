import { apiGet } from "./client";
import type { TierInfo } from "../types/tier";

export function getTiers(): Promise<TierInfo[]> {
  return apiGet<TierInfo[]>("/api/tiers");
}
