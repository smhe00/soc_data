import { apiGet } from "./client";
import type { DashboardData, MetricRecord } from "../types/metric";

export function getMetrics(implOptionId?: string): Promise<MetricRecord[]> {
  const query = implOptionId ? `?impl_option_id=${encodeURIComponent(implOptionId)}` : "";
  return apiGet<MetricRecord[]>(`/api/metrics${query}`);
}

export function getDashboard(implOptionId?: string): Promise<DashboardData> {
  const query = implOptionId ? `?impl_option_id=${encodeURIComponent(implOptionId)}` : "";
  return apiGet<DashboardData>(`/api/dashboard${query}`);
}
