import { apiGet } from "./client";
import type { DashboardData, ComponentMetric } from "../types/metric";

export function getMetrics(scenarioId?: string): Promise<ComponentMetric[]> {
  const query = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return apiGet<ComponentMetric[]>(`/api/metrics${query}`);
}

export function getDashboard(scenarioId?: string): Promise<DashboardData> {
  const query = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return apiGet<DashboardData>(`/api/dashboard${query}`);
}
