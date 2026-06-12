import { apiGet, apiJson } from "./client";
import type { BlockNode, PhysicalPartition, TreeBlock } from "../types/component";
import type { QualityIssue } from "./quality";

function scopedQuery(path: string, team?: string, implOptionId?: string): string {
  const params = new URLSearchParams();
  if (team) params.set("team", team);
  if (implOptionId) params.set("impl_option_id", implOptionId);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function getComponents(team?: string, implOptionId?: string): Promise<BlockNode[]> {
  return apiGet<BlockNode[]>(scopedQuery("/api/components", team, implOptionId));
}

export function getComponentTree(team?: string, implOptionId?: string): Promise<TreeBlock[]> {
  return apiGet<TreeBlock[]>(scopedQuery("/api/components/tree", team, implOptionId));
}

export function getPhysicalPartitions(team?: string, implOptionId?: string): Promise<PhysicalPartition[]> {
  return apiGet<PhysicalPartition[]>(scopedQuery("/api/physical-partitions", team, implOptionId));
}

export interface LogicalComponentInput {
  id?: string | null;
  project_id: string;
  parent_id?: string | null;
  module_definition_id?: string | null;
  name: string;
  instance_type: string;
  resource_type: string;
  function_domain: string;
  logical_instance_count: number;
  owner_team: string;
  visibility_level: string;
  description?: string;
  impl_option_id: string;
  team?: string | null;
}

export function createLogicalComponent(payload: LogicalComponentInput): Promise<BlockNode> {
  return apiJson<BlockNode>("/api/components", "POST", payload);
}

export function updateLogicalComponent(componentId: string, payload: LogicalComponentInput): Promise<BlockNode> {
  return apiJson<BlockNode>(`/api/components/${encodeURIComponent(componentId)}`, "PUT", payload);
}

export function deleteLogicalComponent(componentId: string, payload: { impl_option_id: string; team?: string | null; cascade?: boolean }): Promise<{ deleted_component_ids: string[]; deleted_partition_ids: string[] }> {
  return apiJson<{ deleted_component_ids: string[]; deleted_partition_ids: string[] }>(`/api/components/${encodeURIComponent(componentId)}`, "DELETE", payload);
}

export interface ComponentDetailUpdate {
  impl_option_id: string;
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
}

export interface ComponentDetailUpdateResult {
  component: BlockNode;
  quality_issues: QualityIssue[];
}

export function updateComponentDetail(componentId: string, payload: ComponentDetailUpdate): Promise<ComponentDetailUpdateResult> {
  return apiJson<ComponentDetailUpdateResult>(`/api/components/${encodeURIComponent(componentId)}/detail`, "PUT", payload);
}
