export type RiskLevel = "Low" | "Medium" | "High";

export interface ImplOption {
  id: string;
  project_id: string;
  name: string;
  process: string;
  process_combo: string;
  die: string;
  impl_type: string;
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
