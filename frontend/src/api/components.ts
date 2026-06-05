import { apiGet, apiJson } from "./client";
import type { BlockNode, PhysicalPartition, TreeBlock } from "../types/component";
import type { QualityIssue } from "./quality";

function teamQuery(path: string, team?: string): string {
  return team ? `${path}?team=${encodeURIComponent(team)}` : path;
}

export function getComponents(team?: string): Promise<BlockNode[]> {
  return apiGet<BlockNode[]>(teamQuery("/api/components", team));
}

export function getComponentTree(team?: string): Promise<TreeBlock[]> {
  return apiGet<TreeBlock[]>(teamQuery("/api/components/tree", team));
}

export function getPhysicalPartitions(team?: string): Promise<PhysicalPartition[]> {
  return apiGet<PhysicalPartition[]>(teamQuery("/api/physical-partitions", team));
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
    physical_instance_count: number;
    content_share: number;
    description: string;
  }>;
}

export interface ComponentDetailUpdateResult {
  component: BlockNode;
  quality_issues: QualityIssue[];
}

export function updateComponentDetail(componentId: string, payload: ComponentDetailUpdate): Promise<ComponentDetailUpdateResult> {
  return apiJson<ComponentDetailUpdateResult>(`/api/components/${encodeURIComponent(componentId)}/detail`, "PUT", payload);
}
