import { apiGet, apiJson } from "./client";
import type {
  ApplicationScenario,
  PhysicalMapping,
  PowerDataset,
  OperatingPointSet,
  PowerSummary,
  PowerObservation,
  ModulePowerUseCase,
  ApplicationScenarioSelection,
  ApplicationPowerSummary,
} from "../types/power";

export function getApplicationScenarios(): Promise<ApplicationScenario[]> {
  return apiGet<ApplicationScenario[]>("/api/application-scenarios");
}

export interface ApplicationScenarioInput {
  project_id: string;
  name: string;
  category: string;
  description?: string | null;
}

export function createApplicationScenario(payload: ApplicationScenarioInput): Promise<ApplicationScenario> {
  return apiJson<ApplicationScenario>("/api/application-scenarios", "POST", payload);
}

export function updateApplicationScenario(id: string, payload: ApplicationScenarioInput): Promise<ApplicationScenario> {
  return apiJson<ApplicationScenario>(`/api/application-scenarios/${encodeURIComponent(id)}`, "PUT", payload);
}

export function deleteApplicationScenario(id: string): Promise<{
  success: boolean;
  deleted_id: string;
  deleted_selection_count: number;
  deleted_observation_count: number;
}> {
  return apiJson<{ success: boolean; deleted_id: string; deleted_selection_count: number; deleted_observation_count: number }>(
    `/api/application-scenarios/${encodeURIComponent(id)}`,
    "DELETE",
  );
}

export function getPhysicalMappings(implOptionId?: string): Promise<PhysicalMapping[]> {
  const path = implOptionId ? `/api/physical-mappings?impl_option_id=${encodeURIComponent(implOptionId)}` : "/api/physical-mappings";
  return apiGet<PhysicalMapping[]>(path);
}

export function getPowerDatasets(implOptionId?: string): Promise<PowerDataset[]> {
  return getPhysicalMappings(implOptionId);
}

export function getOperatingPointSets(): Promise<OperatingPointSet[]> {
  return apiGet<OperatingPointSet[]>("/api/operating-point-sets");
}

export function getPowerObservations(implOptionId: string, physicalMappingId: string): Promise<PowerObservation[]> {
  return apiGet<PowerObservation[]>(`/api/power-observations?impl_option_id=${encodeURIComponent(implOptionId)}&physical_mapping_id=${encodeURIComponent(physicalMappingId)}`);
}

export function getModulePowerUseCases(implOptionId: string, physicalMappingId: string): Promise<ModulePowerUseCase[]> {
  const params = new URLSearchParams();
  params.set("impl_option_id", implOptionId);
  params.set("physical_mapping_id", physicalMappingId);
  return apiGet<ModulePowerUseCase[]>(`/api/module-power-usecases?${params.toString()}`);
}

export interface ModulePowerUseCaseInput {
  project_id: string;
  impl_option_id: string;
  physical_mapping_id: string;
  component_id: string;
  component_name: string;
  use_case_name: string;
  operating_point_set_id?: string | null;
  operating_point_set_name?: string | null;
  power_value_w: number;
  confidence?: string | null;
  note?: string | null;
}

export function upsertModulePowerUseCase(payload: ModulePowerUseCaseInput): Promise<ModulePowerUseCase> {
  return apiJson<ModulePowerUseCase>("/api/module-power-usecases", "POST", payload);
}

export function deleteModulePowerUseCase(id: string): Promise<{ success: boolean; deleted_id: string; deleted_selection_count: number }> {
  return apiJson<{ success: boolean; deleted_id: string; deleted_selection_count: number }>(`/api/module-power-usecases/${encodeURIComponent(id)}`, "DELETE");
}

export function getApplicationScenarioComposition(
  implOptionId: string,
  physicalMappingId: string,
  applicationScenarioId: string,
): Promise<ApplicationScenarioSelection[]> {
  const params = new URLSearchParams();
  params.set("impl_option_id", implOptionId);
  params.set("physical_mapping_id", physicalMappingId);
  params.set("application_scenario_id", applicationScenarioId);
  return apiGet<ApplicationScenarioSelection[]>(`/api/application-scenario-composition?${params.toString()}`);
}

export interface ApplicationScenarioCompositionPayload {
  project_id: string;
  impl_option_id: string;
  physical_mapping_id: string;
  application_scenario_id: string;
  selections: Array<{
    component_id: string;
    component_name: string;
    use_case_name: string;
    operating_point_set_id: string;
    included: boolean;
    note?: string | null;
  }>;
}

export function updateApplicationScenarioComposition(payload: ApplicationScenarioCompositionPayload): Promise<{
  selections: ApplicationScenarioSelection[];
  summary: ApplicationPowerSummary;
}> {
  return apiJson<{ selections: ApplicationScenarioSelection[]; summary: ApplicationPowerSummary }>("/api/application-scenario-composition", "PUT", payload);
}

export function getApplicationPowerSummary(
  implOptionId: string,
  physicalMappingId: string,
  applicationScenarioId: string,
): Promise<ApplicationPowerSummary> {
  const params = new URLSearchParams();
  params.set("impl_option_id", implOptionId);
  params.set("physical_mapping_id", physicalMappingId);
  params.set("application_scenario_id", applicationScenarioId);
  return apiGet<ApplicationPowerSummary>(`/api/application-power-summary?${params.toString()}`);
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

export interface PowerObservationInput {
  project_id: string;
  impl_option_id: string;
  physical_mapping_id: string;
  application_scenario_id: string;
  operating_point_set_id: string;
  scope_type: string;
  scope_id?: string | null;
  scope_name: string;
  use_case_name?: string | null;
  time_window_name?: string | null;
  statistic_type: string;
  power_type: string;
  power_value_w: number;
  development_stage?: string | null;
  confidence?: string | null;
  is_additive: boolean;
  note?: string | null;
}

export function createPowerObservation(observation: PowerObservationInput): Promise<PowerObservation> {
  return apiJson<PowerObservation>("/api/power-observations", "POST", observation);
}

export function deletePowerObservation(id: string): Promise<{ success: boolean; deleted_id: string }> {
  return apiJson<{ success: boolean; deleted_id: string }>(`/api/power-observations/${id}`, "DELETE");
}

export function updatePowerObservation(id: string, observation: PowerObservationInput): Promise<PowerObservation> {
  return apiJson<PowerObservation>(`/api/power-observations/${id}`, "PUT", observation);
}
