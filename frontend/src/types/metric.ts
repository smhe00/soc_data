import type { Project } from "./project";
import type { ImplOption } from "./impl_option";

export interface ComponentMetric {
  id: string;
  impl_option_id: string;
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
  target_impl_option: ImplOption;
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
  implOptions: ImplOption[];
}
