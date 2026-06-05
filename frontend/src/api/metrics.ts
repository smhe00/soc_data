import { apiGet } from "./client";
import type { DashboardData, ComponentMetric } from "../types/metric";

export function getMetrics(): Promise<ComponentMetric[]> {
  return apiGet<ComponentMetric[]>("/api/metrics");
}

export function getDashboard(): Promise<DashboardData> {
  return apiGet<DashboardData>("/api/dashboard");
}
