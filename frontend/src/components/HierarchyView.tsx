import React, { useEffect, useMemo, useState } from "react";
import {
  GitBranch,
  ChevronDown,
  ChevronRight,
  Search,
  RadioTower,
  MemoryStick,
  Cpu,
  SplitSquareVertical,
  AlertTriangle,
  Settings2
} from "lucide-react";
import {
  Badge,
  Card,
  ResourceIcon,
  AreaTriplet,
  confidenceTone,
  formatNumber
} from "./ui";
import type { BlockNode, TreeBlock, PhysicalPartition } from "../types/component";
import type { TierInfo } from "../types/tier";

type PartitionResourceCategory = "logic" | "sram" | "block";

const partitionResourceCategories: { id: PartitionResourceCategory; label: string }[] = [
  { id: "logic", label: "Logic" },
  { id: "sram", label: "SRAM" },
  { id: "block", label: "Block" },
];

const partitionResourceLabels: Record<PartitionResourceCategory, string> = {
  logic: "Logic",
  sram: "SRAM",
  block: "Block",
};

const partitionResourceOrder: Record<PartitionResourceCategory, number> = {
  logic: 0,
  sram: 1,
  block: 2,
};

interface TreeNodeProps {
  node: TreeBlock;
  selectedId: string;
  onSelect: (id: string) => void;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  depth?: number;
}

interface PartitionMappingEditorProps {
  component: BlockNode;
  blocks: BlockNode[];
  tiers: TierInfo[];
  selectedScenarioId: string;
  selectedTeam: string | null;
  onSave: (
    component: BlockNode,
    logicalInstanceCount: number,
    partitions: PhysicalPartition[],
    logicalMetrics?: {
      signal_count_total?: number;
      logic_area?: number;
      sram_area?: number;
      block_area?: number;
      power?: number;
    }
  ) => Promise<void>;
}

export interface HierarchyViewProps {
  blocks: BlockNode[];
  tree: TreeBlock[];
  tiers: TierInfo[];
  selectedScenarioId: string;
  selectedTeam: string;
  loading: boolean;
  error: string | null;
  onSaveComponentDetail: (
    component: BlockNode,
    logicalInstanceCount: number,
    partitions: PhysicalPartition[],
    logicalMetrics?: {
      signal_count_total?: number;
      logic_area?: number;
      sram_area?: number;
      block_area?: number;
      power?: number;
    }
  ) => Promise<void>;
}

function collectExpandableIds(nodes: TreeBlock[]): string[] {
  return nodes.flatMap((node) => [node.children.length > 0 ? node.id : "", ...collectExpandableIds(node.children)]).filter(Boolean);
}

function findAncestorPath(nodes: TreeBlock[], targetId: string, ancestors: string[] = []): string[] {
  for (const node of nodes) {
    if (node.id === targetId) return ancestors;
    const childPath = findAncestorPath(node.children, targetId, [...ancestors, node.id]);
    if (childPath.length > 0) return childPath;
  }
  return [];
}

function filterTree(nodes: TreeBlock[], query: string): TreeBlock[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return nodes;

  return nodes
    .map((node) => {
      const filteredChildren = filterTree(node.children, normalizedQuery);
      const haystack = [node.id, node.name, node.domain, node.resource, node.owner_team, node.hierarchy_path].join(" ").toLowerCase();
      if (haystack.includes(normalizedQuery) || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
      return null;
    })
    .filter((node): node is TreeBlock => node !== null);
}

function TreeNode({ node, selectedId, onSelect, expandedIds, onToggle, depth = 0 }: TreeNodeProps): JSX.Element {
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const active = selectedId === node.id;

  return (
    <div>
      <div
        className={`group flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm transition ${
          active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
        }`}
        style={{ paddingLeft: `${8 + depth * 18}px` }}
      >
        {hasChildren ? (
          <button
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition ${
              active ? "text-white hover:bg-white/15" : "text-slate-500 hover:bg-slate-200 hover:text-slate-900"
            }`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.id);
            }}
            type="button"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelect(node.id)} type="button">
          <ResourceIcon resource={node.resource} />
          <span className="truncate font-medium">{node.name}</span>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>
            {node.tier}
          </span>
        </button>
      </div>
      {hasChildren &&
        expanded &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            selectedId={selectedId}
            onSelect={onSelect}
            expandedIds={expandedIds}
            onToggle={onToggle}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

function requiredPartitionCategories(component: BlockNode): PartitionResourceCategory[] {
  const areaByCategory: Record<PartitionResourceCategory, number> = component.has_children
    ? {
        logic: component.residual_logic_area,
        sram: component.residual_sram_area,
        block: component.residual_block_area,
      }
    : {
        logic: component.logic_area,
        sram: component.sram_area,
        block: component.block_area,
      };
  const categories = partitionResourceCategories.filter((category) => Number(areaByCategory[category.id] || 0) > 0).map((category) => category.id);
  return categories.length > 0 ? categories : ["block"];
}

function preferredTierForCategory(category: PartitionResourceCategory, tiers: TierInfo[]): string {
  const haystack = (tier: TierInfo): string => [tier.id, tier.name, tier.role, tier.process, tier.interconnect].join(" ").toLowerCase();
  if (category === "sram") {
    return tiers.find((tier) => /sram|cache|memory/.test(haystack(tier)))?.id ?? tiers[0]?.id ?? "T0";
  }
  if (category === "block") {
    return tiers.find((tier) => /io|phy|analog|always|bottom/.test(haystack(tier)))?.id ?? tiers[0]?.id ?? "T0";
  }
  return tiers.find((tier) => /logic|compute|top/.test(haystack(tier)))?.id ?? tiers[0]?.id ?? "T0";
}

function makeDefaultPartition(component: BlockNode, selectedScenarioId: string, logicalCount: number, tiers: TierInfo[], category: PartitionResourceCategory, suffix: number): PhysicalPartition {
  const tierId = preferredTierForCategory(category, tiers);
  return {
    id: "",
    scenario_id: selectedScenarioId,
    logical_component_id: component.id,
    logical_component_name: component.name,
    tier_id: tierId,
    partition_name: "",
    partition_type: "full",
    resource_category: category,
    physical_instance_count: Math.max(1, logicalCount),
    content_share: 1,
    instance_share: logicalCount ? 1 : 0,
    partition_ratio: 1,
    logic_area: 0,
    sram_area: 0,
    block_area: 0,
    power: 0,
    shape_type: "",
    description: `Auto-filled ${partitionResourceLabels[category]} mapping for ${component.name}.`,
  };
}

function canonicalPartitionBaseName(component: BlockNode, partition: PhysicalPartition): string {
  return `${component.name}_${partition.resource_category ?? "block"}_${partition.tier_id}`;
}

function canonicalizePartitionNames<T extends PhysicalPartition>(component: BlockNode, rows: T[]): T[] {
  const partialCounters = new Map<string, number>();
  return rows.map((row) => {
    const baseName = canonicalPartitionBaseName(component, row);
    const partialKey = `${row.resource_category ?? "block"}:${row.tier_id}`;
    const partialIndex = row.partition_type === "partial" ? (partialCounters.get(partialKey) ?? 0) + 1 : 0;
    if (row.partition_type === "partial") partialCounters.set(partialKey, partialIndex);
    const generatedName = row.partition_type === "partial" ? `${baseName}_P${partialIndex}` : baseName;
    return {
      ...row,
      id: `PP_${generatedName}`,
      partition_name: generatedName,
    };
  });
}

function sortPartitionsForDisplay<T extends PhysicalPartition>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const categoryDelta = partitionResourceOrder[a.resource_category ?? "block"] - partitionResourceOrder[b.resource_category ?? "block"];
    if (categoryDelta !== 0) return categoryDelta;
    const tierDelta = a.tier_id.localeCompare(b.tier_id);
    if (tierDelta !== 0) return tierDelta;
    return a.partition_type.localeCompare(b.partition_type);
  });
}

function PartitionMappingEditor({ component, blocks, tiers, selectedScenarioId, selectedTeam, onSave }: PartitionMappingEditorProps): JSX.Element {
  const parentAbsoluteCount = useMemo(() => {
    let curr = component.parent;
    let multiplier = 1;
    while (curr) {
      const p = blocks.find((b) => b.id === curr);
      if (!p) break;
      multiplier *= p.logical_instance_count;
      curr = p.parent;
    }
    return multiplier;
  }, [component, blocks]);

  const initCount = component.absolute_logical_instance_count || 1;
  const [logicalCount, setLogicalCount] = useState<number>(component.logical_instance_count);
  const [signalCount, setSignalCount] = useState<number>(Math.round((component.signal_count_total || 0) / initCount));
  const [logicArea, setLogicArea] = useState<number>(Number(((component.logic_area || 0) / initCount).toFixed(3)));
  const [sramArea, setSramArea] = useState<number>(Number(((component.sram_area || 0) / initCount).toFixed(3)));
  const [blockArea, setBlockArea] = useState<number>(Number(((component.block_area || 0) / initCount).toFixed(3)));
  const [power, setPower] = useState<number>(Number(((component.power || 0) / initCount).toFixed(3)));
  const [partitions, setPartitions] = useState<PhysicalPartition[]>(component.partitions);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const absCount = component.absolute_logical_instance_count || 1;
    setLogicalCount(component.logical_instance_count);
    setSignalCount(Math.round((component.signal_count_total || 0) / absCount));
    setLogicArea(Number(((component.logic_area || 0) / absCount).toFixed(3)));
    setSramArea(Number(((component.sram_area || 0) / absCount).toFixed(3)));
    setBlockArea(Number(((component.block_area || 0) / absCount).toFixed(3)));
    setPower(Number(((component.power || 0) / absCount).toFixed(3)));
    const normalizedPartitions = component.partitions.map((partition) => ({
      ...partition,
      resource_category: partition.resource_category ?? "block",
      content_share: Number(Number(partition.content_share || 0).toFixed(3))
    }));
    const missingCategories = requiredPartitionCategories(component).filter((category) => !normalizedPartitions.some((partition) => partition.resource_category === category));
    setPartitions([
      ...normalizedPartitions,
      ...missingCategories.map((category, index) => makeDefaultPartition(component, selectedScenarioId, component.logical_instance_count, tiers, category, normalizedPartitions.length + index + 1)),
    ]);
    setSaveError(null);
  }, [component, selectedScenarioId, tiers]);

  function fixFormResiduals(): void {
    const count = logicalCount || 1;
    const absoluteCount = count * parentAbsoluteCount;
    if (logicArea * absoluteCount < component.child_logic_area) {
      setLogicArea(component.child_logic_area / absoluteCount);
    }
    if (sramArea * absoluteCount < component.child_sram_area) {
      setSramArea(component.child_sram_area / absoluteCount);
    }
    if (blockArea * absoluteCount < component.child_block_area) {
      setBlockArea(component.child_block_area / absoluteCount);
    }
  }

  const liveResiduals = useMemo(() => {
    const count = logicalCount || 1;
    const absoluteCount = count * parentAbsoluteCount;
    const totalLogic = logicArea * absoluteCount;
    const totalSram = sramArea * absoluteCount;
    const totalBlock = blockArea * absoluteCount;
    if (component.has_children) {
      return {
        logic: Math.max(0, totalLogic - component.child_logic_area),
        sram: Math.max(0, totalSram - component.child_sram_area),
        block: Math.max(0, totalBlock - component.child_block_area),
      };
    } else {
      return {
        logic: totalLogic,
        sram: totalSram,
        block: totalBlock,
      };
    }
  }, [component, logicArea, sramArea, blockArea, logicalCount, parentAbsoluteCount]);

  const liveRequiredCategories = useMemo<PartitionResourceCategory[]>(() => {
    const cats = partitionResourceCategories
      .filter((cat) => liveResiduals[cat.id] > 0.01)
      .map((cat) => cat.id);
    return cats.length > 0 ? cats : ["block"];
  }, [liveResiduals]);

  const categoryCoverage = partitionResourceCategories.map((category) => {
    const equivalent = partitions
      .filter((partition) => partition.resource_category === category.id)
      .reduce((sum, partition) => sum + Number(partition.physical_instance_count || 0) * Number(partition.content_share || 0), 0);
    const rowCount = partitions.filter((partition) => partition.resource_category === category.id).length;
    return {
      ...category,
      equivalent,
      rowCount,
      required: liveRequiredCategories.includes(category.id),
      closed: !liveRequiredCategories.includes(category.id) && rowCount === 0 ? true : Math.abs(equivalent - logicalCount) < 0.001,
    };
  });

  const tierSummary = tiers
    .map((tier) => {
      const count = partitions.filter((partition) => partition.tier_id === tier.id).reduce((sum, partition) => sum + Number(partition.physical_instance_count || 0), 0);
      return count > 0 ? `${tier.id}: ${count}x` : "";
    })
    .filter(Boolean)
    .join(", ");
  const coverageClosed = categoryCoverage.every((category) => category.closed);
  const displayedPartitions = canonicalizePartitionNames(component, sortPartitionsForDisplay(partitions.map((partition, index) => ({ ...partition, originalIndex: index } as PhysicalPartition & { originalIndex: number }))));

  function updatePartition(index: number, patch: Partial<PhysicalPartition>): void {
    setPartitions((rows) =>
      rows.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const next = { ...row, ...patch };
        if (next.partition_type === "full") next.content_share = 1;
        return next;
      })
    );
  }

  function addPartition(): void {
    const suffix = partitions.length + 1;
    const resourceCategory = liveRequiredCategories.find((category) => !partitions.some((partition) => partition.resource_category === category)) ?? partitionResourceCategories.find((category) => !partitions.some((partition) => partition.resource_category === category.id))?.id ?? "logic";
    setPartitions((rows) => [
      ...rows,
      makeDefaultPartition(component, selectedScenarioId, logicalCount, tiers, resourceCategory, suffix),
    ]);
  }

  async function save(): Promise<void> {
    try {
      setSaving(true);
      setSaveError(null);
      const count = logicalCount || 1;
      const absoluteCount = count * parentAbsoluteCount;
      await onSave(
        component,
        logicalCount,
        canonicalizePartitionNames(component, sortPartitionsForDisplay(partitions)),
        {
          signal_count_total: Math.round(signalCount * absoluteCount),
          logic_area: logicArea * absoluteCount,
          sram_area: sramArea * absoluteCount,
          block_area: blockArea * absoluteCount,
          power: power * absoluteCount,
        }
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unknown save error");
    } finally {
      setSaving(false);
    }
  }

  const mappingSubtitle = component.has_children
    ? `Daily edit surface for ${selectedTeam}; parent mappings cover derived residual/self area only.`
    : `Daily edit surface for ${selectedTeam}; metrics stay behind friendly fields.`;

  return (
    <Card title="Logical Info & Physical Partition Editor" subtitle={mappingSubtitle} icon={SplitSquareVertical}>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 md:grid-cols-6 rounded-2xl bg-slate-50 p-4 border border-slate-100">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Logical Instances</label>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
            type="number"
            min={1}
            value={logicalCount}
            onChange={(e) => setLogicalCount(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Signal Count (per inst)</label>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
            type="number"
            min={0}
            value={signalCount}
            onChange={(e) => setSignalCount(Number(e.target.value))}
          />
          {logicalCount > 1 && (
            <div className="mt-1 text-[10px] text-slate-500 font-medium">
              Total: {Math.round(signalCount * logicalCount)} signals
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Logic Area (per inst)</label>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
            type="number"
            step={0.01}
            min={0}
            value={logicArea}
            onChange={(e) => setLogicArea(Number(e.target.value))}
          />
          {logicalCount > 1 && (
            <div className="mt-1 text-[10px] text-slate-500 font-medium">
              Total: {(logicArea * logicalCount).toFixed(3)} mm²
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">SRAM Area (per inst)</label>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
            type="number"
            step={0.01}
            min={0}
            value={sramArea}
            onChange={(e) => setSramArea(Number(e.target.value))}
          />
          {logicalCount > 1 && (
            <div className="mt-1 text-[10px] text-slate-500 font-medium">
              Total: {(sramArea * logicalCount).toFixed(3)} mm²
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Block Area (per inst)</label>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
            type="number"
            step={0.01}
            min={0}
            value={blockArea}
            onChange={(e) => setBlockArea(Number(e.target.value))}
          />
          {logicalCount > 1 && (
            <div className="mt-1 text-[10px] text-slate-500 font-medium">
              Total: {(blockArea * logicalCount).toFixed(3)} mm²
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Power (per inst)</label>
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
            type="number"
            step={0.01}
            min={0}
            value={power}
            onChange={(e) => setPower(Number(e.target.value))}
          />
          {logicalCount > 1 && (
            <div className="mt-1 text-[10px] text-slate-500 font-medium">
              Total: {(power * logicalCount).toFixed(3)} W
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl bg-slate-50/50 border border-slate-100 p-4">
          <div className="text-xs text-slate-500 font-medium mb-2">Mapped Equivalent by Category</div>
          <div className="flex flex-wrap gap-2">
            {categoryCoverage.map((category) => (
              <Badge key={category.id} tone={category.closed ? "green" : "amber"}>
                {category.label} {category.required ? `${category.equivalent.toFixed(2)}/${logicalCount}` : category.rowCount === 0 ? "optional" : `${category.equivalent.toFixed(2)}/${logicalCount}`}
              </Badge>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50/50 border border-slate-100 p-4">
          <div className="text-xs text-slate-500 font-medium mb-2">Mapping Rule</div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">Category closed</span>
            <Badge tone={coverageClosed ? "green" : "amber"}>{coverageClosed ? "closed" : "open"}</Badge>
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50/50 border border-slate-100 p-4 relative group">
          <div className="flex items-center justify-between gap-1 text-xs text-slate-50 font-medium mb-2">
            <span className="text-slate-500">Live Residual Area (mm²)</span>
            {component.has_children && (liveResiduals.logic < -0.001 || liveResiduals.sram < -0.001 || liveResiduals.block < -0.001) && (
              <button
                className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200 hover:bg-amber-100 transition shadow-sm"
                onClick={fixFormResiduals}
                title="自动增加当前层面积以消除负值"
                type="button"
              >
                Fix
              </button>
            )}
          </div>
          <div className="mt-1 text-xs font-mono font-semibold text-slate-950">
            L: {liveResiduals.logic.toFixed(2)} | S: {liveResiduals.sram.toFixed(2)} | B: {liveResiduals.block.toFixed(2)}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50/50 border border-slate-100 p-4">
          <div className="text-xs text-slate-500 font-medium mb-2">Tier Summary</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{tierSummary || "-"}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Generated Name</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Tier</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Count</th>
              <th className="px-3 py-3">Instance Share</th>
              <th className="px-3 py-3">Content Share</th>
              <th className="px-3 py-3">Description</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {displayedPartitions.map((partition) => (
              <tr key={`${partition.id || partition.partition_name || "partition"}-${partition.originalIndex}`}>
                <td className="px-3 py-2">
                  <div className="w-56 rounded-lg bg-slate-50 px-2 py-1 text-xs font-mono text-slate-600">
                    {partition.partition_name}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <select className="rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-slate-400" value={partition.resource_category ?? "block"} onChange={(event) => updatePartition(partition.originalIndex, { resource_category: event.target.value as PartitionResourceCategory })}>
                    {partitionResourceCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select className="rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-slate-400" value={partition.tier_id} onChange={(event) => updatePartition(partition.originalIndex, { tier_id: event.target.value })}>
                    {tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.id}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select className="rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-slate-400" value={partition.partition_type} onChange={(event) => updatePartition(partition.originalIndex, { partition_type: event.target.value, content_share: event.target.value === "full" ? 1 : partition.content_share })}>
                    {["full", "partial"].map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input className="w-20 rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-slate-400" min={0} type="number" value={partition.physical_instance_count} onChange={(event) => updatePartition(partition.originalIndex, { physical_instance_count: Number(event.target.value) })} />
                </td>
                <td className="px-3 py-2">
                  <span className="text-sm font-medium text-slate-700">{logicalCount ? (Number(partition.physical_instance_count || 0) / logicalCount * 100).toFixed(1) : "0.0"}%</span>
                </td>
                <td className="px-3 py-2">
                  <input
                    className="w-24 rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
                    disabled={partition.partition_type === "full"}
                    min={0}
                    step={0.001}
                    type="number"
                    value={partition.partition_type === "full" ? 1 : partition.content_share}
                    onChange={(event) => updatePartition(partition.originalIndex, { content_share: Number(event.target.value) })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input className="w-56 rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-slate-400" value={partition.description} onChange={(event) => updatePartition(partition.originalIndex, { description: event.target.value })} />
                </td>
                <td className="px-3 py-2 text-right">
                  <button className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50" type="button" onClick={() => setPartitions((rows) => rows.filter((_, rowIndex) => rowIndex !== partition.originalIndex))}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={addPartition}>Add Partition</button>
        <div className="flex items-center gap-3">
          {saveError && <span className="max-w-xl text-sm text-red-600">{saveError}</span>}
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-60" disabled={saving} type="button" onClick={() => void save()}>
            {saving ? "Saving..." : "Save Mapping"}
          </button>
        </div>
      </div>
    </Card>
  );
}

export function HierarchyView({
  blocks,
  tree,
  tiers,
  selectedScenarioId,
  selectedTeam,
  loading,
  error,
  onSaveComponentDetail,
}: HierarchyViewProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<string>("B_NPU");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    if (blocks.length > 0 && !blocks.some((block) => block.id === selectedId)) {
      setSelectedId(blocks[0].id);
    }
  }, [blocks, selectedId]);

  useEffect(() => {
    if (tree.length === 0) return;
    const expandableIds = new Set(collectExpandableIds(tree));
    const selectedPath = findAncestorPath(tree, selectedId).filter((id) => expandableIds.has(id));
    setExpandedIds((current) => {
      const next = new Set([...current].filter((id) => expandableIds.has(id)));
      if (next.size === 0) {
        tree.forEach((node) => {
          if (node.children.length > 0) next.add(node.id);
        });
      }
      selectedPath.forEach((id) => next.add(id));
      return next;
    });
  }, [tree, selectedId]);

  const visibleTree = useMemo(() => filterTree(tree, searchQuery), [tree, searchQuery]);
  const displayedExpandedIds = useMemo(() => {
    if (!searchQuery.trim()) return expandedIds;
    return new Set(collectExpandableIds(visibleTree));
  }, [expandedIds, searchQuery, visibleTree]);

  const toggleNode = (id: string): void => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const expandAll = (): void => setExpandedIds(new Set(collectExpandableIds(tree)));
  const collapseAll = (): void => setExpandedIds(new Set(findAncestorPath(tree, selectedId)));

  if (loading) return <Card title="Loading Block Hierarchy" subtitle="Fetching component tree..." icon={GitBranch}><div className="text-sm text-slate-500">Loading...</div></Card>;
  if (error) return <Card title="API Error" subtitle="FastAPI backend is not reachable yet." icon={AlertTriangle}><div className="text-sm text-red-600">{error}</div></Card>;
  if (blocks.length === 0) return <Card title="No Components" icon={GitBranch}><div className="text-sm text-slate-500">No component data returned.</div></Card>;

  const selected = blocks.find((block) => block.id === selectedId) ?? blocks[0];
  const children = blocks.filter((block) => block.parent === selected.id);
  const SelectedIcon = selected.resource.includes("phy") ? RadioTower : selected.resource.includes("memory") ? MemoryStick : Cpu;
  const logicalBaseAreaTotal = selected.logic_area + selected.sram_area + selected.block_area;
  const tierBaseAreaTotal = selected.tier_area_distribution.reduce((total, row) => total + row.base_total_area, 0);
  const tierScaledAreaTotal = selected.tier_area_distribution.reduce((total, row) => total + row.total_area, 0);
  const unmappedBaseArea = logicalBaseAreaTotal - tierBaseAreaTotal;

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card
        title="Block Hierarchy"
        subtitle="logical_component keeps hierarchy and logical instance count compact"
        icon={GitBranch}
        right={
          <div className="flex items-center gap-2">
            <button
              aria-label="Expand all blocks"
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={expandAll}
              title="展开全部"
              type="button"
            >
              <ChevronDown size={15} />
            </button>
            <button
              aria-label="Collapse all blocks"
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={collapseAll}
              title="折叠全部"
              type="button"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        }
      >
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Search size={16} className="text-slate-400" />
          <input
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search block / alias / domain"
            value={searchQuery}
          />
        </div>
        <div className="space-y-1">
          {visibleTree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              selectedId={selectedId}
              onSelect={setSelectedId}
              expandedIds={displayedExpandedIds}
              onToggle={toggleNode}
            />
          ))}
          {visibleTree.length === 0 && <div className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">No matching blocks.</div>}
        </div>
      </Card>

      <div className="space-y-6">
        <Card
          title={selected.name}
          subtitle={`${selected.domain} / ${selected.type} / ${selected.owner_team}`}
          icon={SelectedIcon}
          right={<Badge tone={confidenceTone(selected.confidence)}>{selected.confidence}</Badge>}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Resource Type</div>
              <div className="mt-2 font-semibold text-slate-900">{selected.resource}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Signal Count</div>
              <div className="mt-2 font-semibold text-slate-900">{selected.signal_count_total || "-"} total</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Logical Instances</div>
              <div className="mt-2 font-semibold text-slate-900">
                {selected.logical_instance_count}x
                {selected.absolute_logical_instance_count !== selected.logical_instance_count && (
                  <span className="text-xs text-slate-500 font-normal ml-1">
                    (total {selected.absolute_logical_instance_count}x)
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Tier Assignment</div>
              <div className="mt-2 font-semibold text-slate-900">{selected.tier}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-900">Total Logic / SRAM / Block Area</div>
                {selected.absolute_logical_instance_count > 1 && (
                  <Badge tone="blue">Total (for {selected.absolute_logical_instance_count}x instances)</Badge>
                )}
              </div>
              <div className="mt-3 flex items-start gap-6">
                <div>
                  <div className="text-2xl font-semibold text-slate-950">{formatNumber(selected.logic_area)}</div>
                  <div className="text-xs text-slate-500">logic mm²</div>
                  {selected.absolute_logical_instance_count > 1 && (
                    <div className="mt-1 text-[11px] font-medium text-slate-500 bg-slate-50 rounded px-1.5 py-0.5 border border-slate-100 shadow-sm inline-block whitespace-nowrap">
                      {(selected.logic_area / selected.absolute_logical_instance_count).toFixed(3)} / inst
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-2xl font-semibold text-slate-950">{formatNumber(selected.sram_area)}</div>
                  <div className="text-xs text-slate-500">SRAM mm²</div>
                  {selected.absolute_logical_instance_count > 1 && (
                    <div className="mt-1 text-[11px] font-medium text-slate-500 bg-slate-50 rounded px-1.5 py-0.5 border border-slate-100 shadow-sm inline-block whitespace-nowrap">
                      {(selected.sram_area / selected.absolute_logical_instance_count).toFixed(3)} / inst
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-2xl font-semibold text-slate-950">{formatNumber(selected.block_area)}</div>
                  <div className="text-xs text-slate-500">block mm²</div>
                  {selected.absolute_logical_instance_count > 1 && (
                    <div className="mt-1 text-[11px] font-medium text-slate-500 bg-slate-50 rounded px-1.5 py-0.5 border border-slate-100 shadow-sm inline-block whitespace-nowrap">
                      {(selected.block_area / selected.absolute_logical_instance_count).toFixed(3)} / inst
                    </div>
                  )}
                </div>
              </div>
              {selected.has_children && (
                <div className="mt-4 rounded-xl bg-slate-50 p-3 border border-slate-100">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium text-slate-500">Children Sum</div>
                      <AreaTriplet compact logic={selected.child_logic_area} sram={selected.child_sram_area} block={selected.child_block_area} />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">Residual / Self</div>
                      <AreaTriplet compact logic={selected.residual_logic_area} sram={selected.residual_sram_area} block={selected.residual_block_area} />
                    </div>
                  </div>
                  {(selected.residual_logic_area < -0.001 || selected.residual_sram_area < -0.001 || selected.residual_block_area < -0.001) && (
                    <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-amber-700 font-semibold">检测到负的 Residual 面积！</span>
                      <button
                        className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 border border-amber-200 hover:bg-amber-100 transition shadow-sm"
                        onClick={async () => {
                          const nextLogic = Math.max(selected.logic_area, selected.child_logic_area);
                          const nextSram = Math.max(selected.sram_area, selected.child_sram_area);
                          const nextBlock = Math.max(selected.block_area, selected.child_block_area);
                          await onSaveComponentDetail(
                            selected,
                            selected.logical_instance_count,
                            selected.partitions,
                            {
                              signal_count_total: selected.signal_count_total,
                              logic_area: nextLogic,
                              sram_area: nextSram,
                              block_area: nextBlock,
                              power: selected.power,
                            }
                          );
                        }}
                        type="button"
                        title="点击调整本级面积以对齐下层子模块总和"
                      >
                        Fix Residual
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-slate-500">Logical base</div>
                  <div className="mt-1 font-semibold text-slate-900">{logicalBaseAreaTotal.toFixed(2)} mm2</div>
                  {selected.absolute_logical_instance_count > 1 && (
                    <div className="mt-0.5 text-[10px] text-slate-500 font-medium">
                      {(logicalBaseAreaTotal / selected.absolute_logical_instance_count).toFixed(2)} / inst
                    </div>
                  )}
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-slate-500">Mapped base</div>
                  <div className="mt-1 font-semibold text-slate-900">{tierBaseAreaTotal.toFixed(2)} mm2</div>
                  {selected.absolute_logical_instance_count > 1 && (
                    <div className="mt-0.5 text-[10px] text-slate-500 font-medium">
                      {(tierBaseAreaTotal / selected.absolute_logical_instance_count).toFixed(2)} / inst
                    </div>
                  )}
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-slate-500">Unmapped base</div>
                  <div className={`mt-1 font-semibold ${Math.abs(unmappedBaseArea) < 0.01 ? "text-emerald-700" : "text-amber-700"}`}>
                    {unmappedBaseArea.toFixed(2)} mm2
                  </div>
                  {selected.absolute_logical_instance_count > 1 && (
                    <div className="mt-0.5 text-[10px] text-slate-500 font-medium">
                      {(unmappedBaseArea / selected.absolute_logical_instance_count).toFixed(2)} / inst
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-900">Physical Coverage & Closure</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="blue">direct physical {selected.physical_instance_count}x</Badge>
                <Badge tone={Math.abs(selected.instance_share - 1) < 0.001 ? "green" : "amber"}>
                  direct mapped {(selected.instance_share * 100).toFixed(0)}%
                </Badge>
                {children.length > 0 && <Badge>{children.length} child rows</Badge>}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-500 font-medium mb-1">Self / Residual Mapping</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`h-2.5 w-2.5 rounded-full ${selected.own_mapping_closed ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <span className="text-xs font-semibold text-slate-900">
                      {selected.own_mapping_closed ? "Closed" : "Open"}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-500 font-medium mb-1">Subtree Mapping</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {selected.has_children ? (
                      <>
                        <span className={`h-2.5 w-2.5 rounded-full ${selected.subtree_mapping_closed ? "bg-emerald-500" : "bg-amber-500"}`} />
                        <span className="text-xs font-semibold text-slate-900">
                          {selected.subtree_mapping_closed ? "Closed" : "Open"}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">Leaf Node (N/A)</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
                  <span>Subtree area by tier</span>
                  <span>{tierScaledAreaTotal.toFixed(2)} mm2 scaled</span>
                </div>
                {selected.tier_area_distribution.length === 0 ? (
                  <div className="mt-3 text-sm text-slate-500">No physical partitions mapped for this logical subtree.</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {selected.tier_area_distribution.map((row) => (
                      <div key={row.tier_id} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Badge tone="slate">{row.tier_id}</Badge>
                            <span className="truncate text-sm font-medium text-slate-900">{row.tier_name}</span>
                            <span className="text-xs text-slate-500">{row.process}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-slate-950">{row.total_area.toFixed(2)} mm2</div>
                          </div>
                        </div>
                        <AreaTriplet compact logic={row.logic_area} sram={row.sram_area} block={row.block_area} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        <PartitionMappingEditor component={selected} blocks={blocks} tiers={tiers} selectedScenarioId={selectedScenarioId} selectedTeam={selectedTeam} onSave={onSaveComponentDetail} />

        <Card title="建模原则" subtitle="第一阶段需要先统一数据口径" icon={Settings2}>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><Cpu size={18} />Logic</div>
              <p className="text-sm leading-6 text-slate-600">保存晶体管数、标准单元面积、利用率和工艺密度，用于跨工艺面积换算。</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><MemoryStick size={18} />Memory</div>
              <p className="text-sm leading-6 text-slate-600">保存macro实例、容量、compiler版本、实际macro面积，避免纯经验估算。</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><RadioTower size={18} />PHY / Analog</div>
              <p className="text-sm leading-6 text-slate-600">按固定物理面积和placement constraint记录，不建议自动拆分。</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
