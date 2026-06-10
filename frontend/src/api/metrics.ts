import { apiGet } from "./client";
import type { DashboardData, ComponentMetric } from "../types/metric";

export function getMetrics(implOptionId?: string): Promise<ComponentMetric[]> {
  const query = implOptionId ? `?impl_option_id=${encodeURIComponent(implOptionId)}` : "";
  return apiGet<ComponentMetric[]>(`/api/metrics${query}`);
}

export function getDashboard(implOptionId?: string): Promise<DashboardData> {
  const query = implOptionId ? `?impl_option_id=${encodeURIComponent(implOptionId)}` : "";
  return apiGet<DashboardData>(`/api/dashboard${query}`);
}
