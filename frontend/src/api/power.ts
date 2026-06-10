import { apiGet } from "./client";
import type { ApplicationScenario, PhysicalMapping, OperatingPointSet, PowerSummary } from "../types/power";

export function getApplicationScenarios(): Promise<ApplicationScenario[]> {
  return apiGet<ApplicationScenario[]>("/api/application-scenarios");
}

export function getPhysicalMappings(implOptionId?: string): Promise<PhysicalMapping[]> {
  const path = implOptionId ? `/api/physical-mappings?impl_option_id=${encodeURIComponent(implOptionId)}` : "/api/physical-mappings";
  return apiGet<PhysicalMapping[]>(path);
}

export function getOperatingPointSets(): Promise<OperatingPointSet[]> {
  return apiGet<OperatingPointSet[]>("/api/operating-point-sets");
}

export interface PowerSummaryFilters {
  impl_option_id: string;
  physical_mapping_id: string;
  application_scenario_id: string;
  operating_point_set_id: string;
  statistic_type?: string;
  power_type?: string;
  time_window_name?: string;
  development_stage?: string;
}

export function getPowerSummary(filters: PowerSummaryFilters): Promise<PowerSummary> {
  const params = new URLSearchParams();
  params.set("impl_option_id", filters.impl_option_id);
  params.set("physical_mapping_id", filters.physical_mapping_id);
  params.set("application_scenario_id", filters.application_scenario_id);
  params.set("operating_point_set_id", filters.operating_point_set_id);
  
  if (filters.statistic_type) params.set("statistic_type", filters.statistic_type);
  if (filters.power_type) params.set("power_type", filters.power_type);
  if (filters.time_window_name) params.set("time_window_name", filters.time_window_name);
  if (filters.development_stage) params.set("development_stage", filters.development_stage);

  return apiGet<PowerSummary>(`/api/power-summary?${params.toString()}`);
}
