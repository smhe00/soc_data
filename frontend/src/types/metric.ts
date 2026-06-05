import type { Project } from "./project";
import type { Scenario } from "./scenario";

export interface ComponentMetric {
  id: string;
  scenario_id: string;
  subject_type: string;
  subject_id: string;
  metric_name: string;
  metric_value: string;
  metric_unit: string;
  metric_category: string;
  value_type: string;
  corner: string;
  workload: string;
  confidence: string;
  source_note: string;
  created_at: string;
}

export interface DashboardData {
  target_scenario: Scenario;
  metrics: {
    total_area: number;
    total_power: number;
    total_sram_area: number;
    phy_area: number;
    partition_count: number;
  };
  resource_mix: Array<{
    label: string;
    value: number;
    tone: string;
  }>;
  projects: Project[];
  scenarios: Scenario[];
}
