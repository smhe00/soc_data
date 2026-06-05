import { apiGet } from "./client";
import type { BlockNode, PhysicalPartition, TreeBlock } from "../types/component";

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
