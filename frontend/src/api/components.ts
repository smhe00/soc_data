import { apiGet, apiJson } from "./client";
import type { BlockNode, PhysicalPartition, TreeBlock } from "../types/component";
import type { QualityIssue } from "./quality";

function scopedQuery(path: string, team?: string, scenarioId?: string): string {
  const params = new URLSearchParams();
  if (team) params.set("team", team);
  if (scenarioId) params.set("scenario_id", scenarioId);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function getComponents(team?: string, scenarioId?: string): Promise<BlockNode[]> {
  return apiGet<BlockNode[]>(scopedQuery("/api/components", team, scenarioId));
}

export function getComponentTree(team?: string, scenarioId?: string): Promise<TreeBlock[]> {
  return apiGet<TreeBlock[]>(scopedQuery("/api/components/tree", team, scenarioId));
}

export function getPhysicalPartitions(team?: string, scenarioId?: string): Promise<PhysicalPartition[]> {
  return apiGet<PhysicalPartition[]>(scopedQuery("/api/physical-partitions", team, scenarioId));
}

export interface ComponentDetailUpdate {
  scenario_id: string;
  team?: string;
  logical_instance_count: number;
  partitions: Array<{
    id: string;
    tier_id: string;
    partition_name: string;
    partition_type: string;
    resource_category: "logic" | "sram" | "block";
    physical_instance_count: number;
    content_share: number;
    description: string;
  }>;
  signal_count_total?: number;
  logic_area?: number;
  sram_area?: number;
  block_area?: number;
  power?: number;
}

export interface ComponentDetailUpdateResult {
  component: BlockNode;
  quality_issues: QualityIssue[];
}

export function updateComponentDetail(componentId: string, payload: ComponentDetailUpdate): Promise<ComponentDetailUpdateResult> {
  return apiJson<ComponentDetailUpdateResult>(`/api/components/${encodeURIComponent(componentId)}/detail`, "PUT", payload);
}
