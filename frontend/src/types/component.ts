export type ConfidenceLevel = "approved" | "review" | "draft";

export interface BlockNode {
  id: string;
  parent: string | null;
  name: string;
  type: string;
  domain: string;
  resource: string;
  hierarchy_path: string;
  logical_instance_count: number;
  absolute_logical_instance_count: number;
  owner_team: string;
  visibility_level: string;
  physical_instance_count: number;
  instance_share: number;
  partition_ratio: number;
  signal_count_total: number;
  logic_area: number;
  sram_area: number;
  block_area: number;
  has_children: boolean;
  child_logic_area: number;
  child_sram_area: number;
  child_block_area: number;
  residual_logic_area: number;
  residual_sram_area: number;
  residual_block_area: number;
  area: number;
  power: number;
  tier: string;
  confidence: ConfidenceLevel;
  partitions: PhysicalPartition[];
  tier_area_distribution: TierAreaDistribution[];
  description: string;
  own_mapping_closed?: boolean;
  subtree_mapping_closed?: boolean;
}

export interface TreeBlock extends BlockNode {
  children: TreeBlock[];
}

export interface PhysicalPartition {
  id: string;
  scenario_id: string;
  logical_component_id: string;
  logical_component_name: string;
  tier_id: string;
  partition_name: string;
  partition_type: string;
  resource_category: "logic" | "sram" | "block";
  physical_instance_count: number;
  content_share: number;
  instance_share: number;
  partition_ratio: number;
  logic_area: number;
  sram_area: number;
  block_area: number;
  power: number;
  shape_type: string;
  description: string;
}

export interface TierAreaDistribution {
  tier_id: string;
  tier_name: string;
  process_id: string;
  process: string;
  base_logic_area: number;
  base_sram_area: number;
  base_block_area: number;
  base_total_area: number;
  logic_area: number;
  sram_area: number;
  block_area: number;
  total_area: number;
  partition_count: number;
}
