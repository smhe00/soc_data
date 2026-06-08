import { apiGet, apiJson } from "./client";
import type { Scenario } from "../types/scenario";

export function getScenarios(): Promise<Scenario[]> {
  return apiGet<Scenario[]>("/api/scenarios");
}

export interface ScenarioImplementationPayload {
  implementation_type: string;
  status?: string;
  tiers: Array<{
    id: string;
    name: string;
    process: string;
    role: string;
    thickness_um: number;
  }>;
  interfaces: Array<{
    id: string;
    from_tier_id: string;
    to_tier_id: string;
    orientation: string;
    interconnect: string;
    hb_pitch_um: number;
    upper_tsv_pitch_um: number;
    upper_tsv_keepout_um: number;
    lower_tsv_pitch_um: number;
    lower_tsv_keepout_um: number;
    description: string;
  }>;
  package_escape: {
    bottom_tier_id: string;
    requires_tsv: boolean;
    pitch_um: number;
    keepout_um: number;
    description: string;
  };
}

export interface ScenarioImplementationResponse extends ScenarioImplementationPayload {
  exists: boolean;
  scenario_id: string;
  status: string;
  version: number;
  updated_at: string;
}

export function getScenarioImplementation(scenarioId: string): Promise<ScenarioImplementationResponse> {
  return apiGet<ScenarioImplementationResponse>(`/api/scenarios/${encodeURIComponent(scenarioId)}/implementation`);
}

export function updateScenarioImplementation(scenarioId: string, payload: ScenarioImplementationPayload): Promise<{ implementation: ScenarioImplementationResponse }> {
  return apiJson<{ implementation: ScenarioImplementationResponse }>(`/api/scenarios/${encodeURIComponent(scenarioId)}/implementation`, "PUT", payload);
}
