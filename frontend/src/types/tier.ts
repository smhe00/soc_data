export interface TierInfo {
  id: string;
  scenario_id: string;
  tier_index: number;
  name: string;
  process_id: string;
  process: string;
  role: string;
  orientation: string;
  interconnect: string;
  thickness_um: number;
  area: number;
  area_limit_mm2: number;
  power: number;
  utilization: number;
  description: string;
}
