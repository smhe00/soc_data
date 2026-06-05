import { apiGet } from "./client";
import type { BlockNode, PhysicalPartition, TreeBlock } from "../types/component";

export function getComponents(): Promise<BlockNode[]> {
  return apiGet<BlockNode[]>("/api/components");
}

export function getComponentTree(): Promise<TreeBlock[]> {
  return apiGet<TreeBlock[]>("/api/components/tree");
}

export function getPhysicalPartitions(): Promise<PhysicalPartition[]> {
  return apiGet<PhysicalPartition[]>("/api/physical-partitions");
}
