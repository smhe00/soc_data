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
  physical_instance_count: number;
  partition_ratio: number;
  signal_count_total: number;
  logic_area: number;
  sram_area: number;
  block_area: number;
  area: number;
  power: number;
  tier: string;
  confidence: ConfidenceLevel;
  partitions: PhysicalPartition[];
  description: string;
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
  physical_instance_count: number;
  partition_ratio: number;
  logic_area: number;
  sram_area: number;
  block_area: number;
  power: number;
  shape_type: string;
  description: string;
}
