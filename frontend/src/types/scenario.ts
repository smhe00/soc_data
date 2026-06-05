export type RiskLevel = "Low" | "Medium" | "High";

export interface Scenario {
  id: string;
  project_id: string;
  name: string;
  process: string;
  process_combo: string;
  die: string;
  scenario_type: string;
  area: number;
  power: number;
  risk: RiskLevel;
  cost: RiskLevel;
  thermal: RiskLevel;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}
