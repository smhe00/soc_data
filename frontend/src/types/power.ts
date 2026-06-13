export type ScopeType =
  | "soc"
  | "component"
  | "tier"
  | "power_rail"
  | "shared_resource"
  | "interaction"
  | "residual";

export type StatisticType =
  | "average"
  | "peak"
  | "p95"
  | "p99"
  | "rms"
  | "energy"
  | "sample";

export type PowerType =
  | "total"
  | "dynamic"
  | "leakage"
  | "clock"
  | "memory"
  | "interconnect"
  | "io"
  | "regulator_loss";

export type DevelopmentStage =
  | "architecture_estimate"
  | "rtl_power"
  | "gate_level_power"
  | "post_pnr_power"
  | "thermal_aware_power"
  | "silicon_measurement";

export interface PowerObservation {
  id: string;
  project_id: string;
  impl_option_id: string;
  physical_mapping_id: string;
  application_scenario_id: string;
  operating_point_set_id: string;
  scope_type: ScopeType;
  scope_id: string | null;
  scope_name: string;
  use_case_name: string | null;
  time_window_name: string | null;
  statistic_type: StatisticType;
  power_type: PowerType;
  power_value_w: number;
  development_stage: DevelopmentStage | null;
  source_type: string | null;
  confidence: string | null;
  is_additive: boolean;
  context_json: string | null;
  note: string | null;
}

export interface PowerSummary {
  filters: {
    impl_option_id: string;
    physical_mapping_id: string;
    application_scenario_id: string;
    operating_point_set_id: string;
    statistic_type: string;
    power_type: string;
    time_window_name: string | null;
    development_stage: string | null;
  };
  total_additive_power_w: number;
  non_additive_reference_power_w: number | null;
  residual_power_w: number | null;
  by_scope_type: Record<string, number>;
  by_component: Record<string, number>;
  by_stage: Record<string, number>;
  non_additive_references: Array<{
    scope_type: string;
    scope_name: string;
    power_value_w: number;
    development_stage: string | null;
  }>;
  observations: PowerObservation[];
}

export interface ModulePowerUseCase {
  id: string;
  project_id: string;
  impl_option_id: string;
  physical_mapping_id: string;
  component_id: string;
  component_name: string;
  use_case_name: string;
  operating_point_set_id: string;
  operating_point_set_name: string;
  power_value_w: number;
  confidence: string | null;
  note: string | null;
}

export interface ApplicationScenarioSelection {
  id: string;
  project_id: string;
  impl_option_id: string;
  physical_mapping_id: string;
  application_scenario_id: string;
  component_id: string;
  component_name: string;
  use_case_name: string;
  operating_point_set_id: string;
  included: boolean;
  note: string;
}

export interface ApplicationPowerSummary {
  filters: {
    impl_option_id: string;
    physical_mapping_id: string;
    application_scenario_id: string;
  };
  total_additive_power_w: number;
  non_additive_reference_power_w: number | null;
  residual_power_w: number | null;
  selected_count: number;
  missing_count: number;
  selections: Array<{
    id: string;
    component_id: string;
    component_name: string;
    use_case_name: string;
    operating_point_set_id: string;
    included: boolean;
    power_value_w: number | null;
    confidence: string | null;
    note: string;
  }>;
  hierarchy_rollups: Array<{
    parent_component_id: string;
    parent_component_name: string;
    parent_included: boolean;
    parent_power_value_w: number | null;
    assigned_child_count: number;
    missing_child_count: number;
    child_sum_power_w: number;
    unsplit_power_w: number | null;
    residual_power_w: number | null;
    status: "closed" | "unsplit" | "over_specified" | "incomplete";
    covered_descendant_ids: string[];
  }>;
  by_component: Record<string, number>;
}

export interface ApplicationScenario {
  id: string;
  project_id: string;
  name: string;
  category: string;
  description: string;
}

export interface PowerDataset {
  id: string;
  impl_option_id: string;
  name: string;
  mapping_version: string;
  description: string;
  mapping_json: string;
}

export type PhysicalMapping = PowerDataset;

export interface OperatingPointSet {
  id: string;
  project_id: string;
  name: string;
  description: string;
  op_json: string;
}
