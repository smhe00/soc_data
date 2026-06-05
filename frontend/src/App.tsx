import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Database,
  Layers3,
  GitBranch,
  BarChart3,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Search,
  Cpu,
  MemoryStick,
  RadioTower,
  Boxes,
  ChevronRight,
  FileText,
  Settings2,
  SplitSquareVertical,
  Gauge,
  Flame,
  Package,
  History,
} from "lucide-react";
import { getComponents, getComponentTree, getPhysicalPartitions } from "./api/components";
import { importTemplateUrl, uploadImportWorkbook, type ImportResult } from "./api/imports";
import { getDashboard } from "./api/metrics";
import { getQualityIssues, type QualityIssue } from "./api/quality";
import { getResponsibilityTeams } from "./api/responsibilities";
import { getScenarios } from "./api/scenarios";
import { getTiers } from "./api/tiers";
import type { DashboardData } from "./types/metric";

type ProjectPhase = "Architecture Planning" | "Pre-Study" | "Design" | "Review" | "Released";
type RiskLevel = "Low" | "Medium" | "High";
type ConfidenceLevel = "approved" | "review" | "draft";
type SeverityLevel = "High" | "Medium" | "Low";
type BadgeTone = "slate" | "blue" | "green" | "amber" | "red" | "violet";
type TabId = "dashboard" | "hierarchy" | "tiers" | "compare" | "imports" | "quality" | "schema";

interface Project {
  id: string;
  name: string;
  product_family: string;
  generation: string;
  phase: ProjectPhase;
  owner: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface Scenario {
  id: string;
  name: string;
  process: string;
  die: string;
  area: number;
  power: number;
  risk: RiskLevel;
  cost: RiskLevel | "Medium";
  thermal: RiskLevel;
  description: string;
}

interface TierInfo {
  id: string;
  name: string;
  process: string;
  role: string;
  orientation: string;
  interconnect: string;
  area: number;
  power: number;
  utilization: number;
}

interface BlockNode {
  id: string;
  parent: string | null;
  name: string;
  type: string;
  domain: string;
  resource: string;
  hierarchy_path: string;
  logical_instance_count: number;
  owner_team: string;
  visibility_level: string;
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

interface TreeBlock extends BlockNode {
  children: TreeBlock[];
}

interface PhysicalPartition {
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

interface ImportArtifact {
  file: string;
  type: string;
  status: "Parsed" | "Need Review" | "Draft Mapping";
  extracted: string;
  issues: number;
  owner: string;
}

interface SchemaTable {
  table: string;
  purpose: string;
  fields: string;
}

interface TabItem {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
}

interface CardProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  right?: React.ReactNode;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  unit: string;
  icon: LucideIcon;
  hint?: string;
}

interface ResourceIconProps {
  resource: string;
}

interface TreeNodeProps {
  node: TreeBlock;
  selectedId: string;
  onSelect: (id: string) => void;
  depth?: number;
}

interface DataPageProps {
  blocks: BlockNode[];
  tree: TreeBlock[];
  dashboard: DashboardData | null;
  scenarios: Scenario[];
  tiers: TierInfo[];
  physicalPartitions: PhysicalPartition[];
  qualityIssues: QualityIssue[];
  loading: boolean;
  error: string | null;
  importing: boolean;
  importResult: ImportResult | null;
  importError: string | null;
  selectedTeam: string;
  onImportWorkbook: (file: File) => Promise<void>;
}

const imports: ImportArtifact[] = [
  {
    file: "architecture_plan_v0.3.xlsx",
    type: "Excel",
    status: "Parsed",
    extracted: "42 blocks, 18 metrics",
    issues: 3,
    owner: "Product Planning",
  },
  {
    file: "dc_npu_top_area.rpt",
    type: "Synthesis Report",
    status: "Need Review",
    extracted: "NPU_TOP area/power estimates",
    issues: 5,
    owner: "Design Team",
  },
  {
    file: "3dic_stack_spec.pdf",
    type: "PDF",
    status: "Draft Mapping",
    extracted: "Tier/process/HB/TSV parameters",
    issues: 2,
    owner: "Packaging Team",
  },
];

const schemaTables: SchemaTable[] = [
  {
    table: "project",
    purpose: "产品线、项目、代际管理",
    fields: "project_id, family, name, owner, phase, created_at",
  },
  {
    table: "scenario",
    purpose: "2D/3DIC/降本/性能方案管理",
    fields: "scenario_id, project_id, name, process_combo, status",
  },
  {
    table: "module_definition",
    purpose: "可复用RTL/IP/block主定义",
    fields: "id, name, module_type, ip_owner, reuse_class",
  },
  {
    table: "logical_component",
    purpose: "逻辑层次结构与逻辑例化数量",
    fields: "id, parent_id, module_definition_id, hierarchy_path, logical_instance_count",
  },
  {
    table: "process_node",
    purpose: "工艺能力、密度、成本、成熟度",
    fields: "process_id, foundry, node, logic_density, sram_density, cost_factor",
  },
  {
    table: "tier",
    purpose: "3D stack中每层die/tier定义",
    fields: "tier_id, scenario_id, process_id, tier_index, role, thickness",
  },
  {
    table: "physical_partition",
    purpose: "逻辑模块到Tier的物理承载事实",
    fields: "id, logical_component_id, tier_id, physical_instance_count, partition_ratio",
  },
  {
    table: "metric",
    purpose: "统一指标表，挂到logical/partition/tier/scenario",
    fields: "id, subject_type, subject_id, metric_name, metric_value, value_type",
  },
  {
    table: "source_artifact",
    purpose: "Excel/PDF/report/PPT等来源追溯",
    fields: "source_id, filename, source_type, owner, version, uploaded_at",
  },
];

const tabs: TabItem[] = [
  { id: "dashboard", label: "总览", icon: BarChart3 },
  { id: "hierarchy", label: "Block层次", icon: GitBranch },
  { id: "tiers", label: "3D Tier", icon: Layers3 },
  { id: "compare", label: "方案对比", icon: SplitSquareVertical },
  { id: "imports", label: "数据导入", icon: Upload },
  { id: "quality", label: "数据质量", icon: AlertTriangle },
  { id: "schema", label: "数据模型", icon: Database },
];

function Badge({ children, tone = "slate" }: BadgeProps): JSX.Element {
  const styles: Record<BadgeTone, string> = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-red-50 text-red-700 border-red-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${styles[tone]}`}>
      {children}
    </span>
  );
}

function Card({ title, subtitle, icon: Icon, children, right }: CardProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
              <Icon size={20} />
            </div>
          )}
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </motion.div>
  );
}

function MetricCard({ label, value, unit, icon: Icon, hint }: MetricCardProps): JSX.Element {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
          <Icon size={20} />
        </div>
        {hint && <Badge tone="blue">{hint}</Badge>}
      </div>
      <div className="mt-5">
        <div className="text-3xl font-semibold tracking-tight text-slate-950">
          {value}
          <span className="ml-1 text-base font-medium text-slate-500">{unit}</span>
        </div>
        <div className="mt-1 text-sm text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function ResourceIcon({ resource }: ResourceIconProps): JSX.Element {
  if (resource.includes("memory")) return <MemoryStick size={16} />;
  if (resource.includes("phy")) return <RadioTower size={16} />;
  if (resource.includes("logic")) return <Cpu size={16} />;
  return <Boxes size={16} />;
}

function confidenceTone(confidence: ConfidenceLevel): BadgeTone {
  if (confidence === "approved") return "green";
  if (confidence === "review") return "amber";
  return "slate";
}

function riskTone(risk: RiskLevel): BadgeTone {
  if (risk === "High") return "red";
  if (risk === "Medium") return "amber";
  return "green";
}

function severityTone(severity: SeverityLevel): BadgeTone {
  if (severity === "High") return "red";
  if (severity === "Medium") return "amber";
  return "slate";
}

function TreeNode({ node, selectedId, onSelect, depth = 0 }: TreeNodeProps): JSX.Element {
  const hasChildren = node.children.length > 0;
  const active = selectedId === node.id;

  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
          active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
        }`}
        style={{ paddingLeft: `${12 + depth * 18}px` }}
        type="button"
      >
        {hasChildren ? <ChevronRight size={14} className="shrink-0" /> : <span className="w-3.5" />}
        <ResourceIcon resource={node.resource} />
        <span className="truncate font-medium">{node.name}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>
          {node.tier}
        </span>
      </button>
      {hasChildren &&
        node.children.map((child) => (
          <TreeNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
        ))}
    </div>
  );
}

function Dashboard({ dashboard, loading, error }: Pick<DataPageProps, "dashboard" | "loading" | "error">): JSX.Element {
  if (loading) return <Card title="Loading Dashboard" subtitle="Fetching SQLite-backed API data..." icon={Database}><div className="text-sm text-slate-500">Loading...</div></Card>;
  if (error) return <Card title="API Error" subtitle="FastAPI backend is not reachable yet." icon={AlertTriangle}><div className="text-sm text-red-600">{error}</div></Card>;
  if (!dashboard) return <Card title="No Data" icon={Database}><div className="text-sm text-slate-500">No dashboard data returned.</div></Card>;

  const { metrics, projects, resource_mix: resourceMix } = dashboard;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="3DIC Option A 估算总面积" value={metrics.total_area} unit="mm²" icon={Package} hint="Scenario S2" />
        <MetricCard label="Peak场景总功耗估计" value={metrics.total_power} unit="W" icon={Gauge} hint="Draft" />
        <MetricCard label="逻辑层SRAM面积估计" value={metrics.total_sram_area} unit="mm²" icon={MemoryStick} hint="Metrics" />
        <MetricCard label="Physical Partition数量" value={metrics.partition_count} unit="rows" icon={SplitSquareVertical} hint="V7" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="当前项目" subtitle="第一阶段原型：项目、版本、方案、来源追溯" icon={Cpu}>
          <div className="space-y-3">
            {projects.map((project) => (
              <div key={project.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{project.name}</div>
                    <div className="mt-1 text-sm text-slate-500">{project.product_family}</div>
                  </div>
                  <Badge tone="blue">{project.phase}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500">
                  <div>
                    Owner: <span className="text-slate-700">{project.owner}</span>
                  </div>
                  <div>
                    Updated: <span className="text-slate-700">{project.updated_at}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="面积构成" subtitle="Logic / Memory / PHY分开建模，避免单纯mm²失真" icon={BarChart3}>
          <div className="space-y-4">
            {resourceMix.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-600">{item.label}</span>
                  <span className="font-medium text-slate-900">{item.value}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${item.tone}`} style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="平台第一阶段范围" subtitle="先保证数据可信、结构稳定、可比较" icon={CheckCircle2}>
          <div className="space-y-3 text-sm text-slate-600">
            <div className="flex gap-2">
              <CheckCircle2 size={18} className="text-emerald-600" />项目/版本/Scenario管理
            </div>
            <div className="flex gap-2">
              <CheckCircle2 size={18} className="text-emerald-600" />Block hierarchy和资源类型建模
            </div>
            <div className="flex gap-2">
              <CheckCircle2 size={18} className="text-emerald-600" />Process / Tier / Allocation建模
            </div>
            <div className="flex gap-2">
              <CheckCircle2 size={18} className="text-emerald-600" />Excel/Report/PDF来源追溯
            </div>
            <div className="flex gap-2">
              <CheckCircle2 size={18} className="text-emerald-600" />基础数据质量检查
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function HierarchyView({ blocks, tree, loading, error }: Pick<DataPageProps, "blocks" | "tree" | "loading" | "error">): JSX.Element {
  const [selectedId, setSelectedId] = useState<string>("B_NPU");
  useEffect(() => {
    if (blocks.length > 0 && !blocks.some((block) => block.id === selectedId)) {
      setSelectedId(blocks[0].id);
    }
  }, [blocks, selectedId]);

  if (loading) return <Card title="Loading Block Hierarchy" subtitle="Fetching component tree..." icon={GitBranch}><div className="text-sm text-slate-500">Loading...</div></Card>;
  if (error) return <Card title="API Error" subtitle="FastAPI backend is not reachable yet." icon={AlertTriangle}><div className="text-sm text-red-600">{error}</div></Card>;
  if (blocks.length === 0) return <Card title="No Components" icon={GitBranch}><div className="text-sm text-slate-500">No component data returned.</div></Card>;
  const selected = blocks.find((block) => block.id === selectedId) ?? blocks[0];
  const children = blocks.filter((block) => block.parent === selected.id);
  const SelectedIcon = selected.resource.includes("phy") ? RadioTower : selected.resource.includes("memory") ? MemoryStick : Cpu;

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card title="Block Hierarchy" subtitle="logical_component keeps hierarchy and logical instance count compact" icon={GitBranch}>
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Search size={16} className="text-slate-400" />
          <input className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="Search block / alias / domain" />
        </div>
        <div className="space-y-1">
          {tree.map((node) => (
            <TreeNode key={node.id} node={node} selectedId={selectedId} onSelect={setSelectedId} />
          ))}
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
              <div className="mt-2 font-semibold text-slate-900">{selected.logical_instance_count}x</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Tier Assignment</div>
              <div className="mt-2 font-semibold text-slate-900">{selected.tier}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-900">Logic / SRAM / Block Area</div>
              <div className="mt-3 flex items-end gap-6">
                <div>
                  <div className="text-2xl font-semibold text-slate-950">{selected.logic_area}</div>
                  <div className="text-xs text-slate-500">logic mm²</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-slate-950">{selected.sram_area}</div>
                  <div className="text-xs text-slate-500">SRAM mm²</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-slate-950">{selected.block_area}</div>
                  <div className="text-xs text-slate-500">block mm²</div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-900">Physical Coverage</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="blue">physical {selected.physical_instance_count}x</Badge>
                <Badge tone={Math.abs(selected.partition_ratio - 1) < 0.001 ? "green" : "amber"}>
                  ratio {(selected.partition_ratio * 100).toFixed(0)}%
                </Badge>
                {children.length > 0 && <Badge>{children.length} child rows</Badge>}
              </div>
            </div>
          </div>
        </Card>

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

function TiersView({ tiers, physicalPartitions, loading, error }: Pick<DataPageProps, "tiers" | "physicalPartitions" | "loading" | "error">): JSX.Element {
  if (loading) return <Card title="Loading 3D Stack" subtitle="Fetching tier data..." icon={Layers3}><div className="text-sm text-slate-500">Loading...</div></Card>;
  if (error) return <Card title="API Error" subtitle="FastAPI backend is not reachable yet." icon={AlertTriangle}><div className="text-sm text-red-600">{error}</div></Card>;

  return (
    <div className="space-y-6">
      <Card title="3D Stack Definition" subtitle="Scenario S2: N5 + N7 + N7, Wafer-to-Wafer, Face-to-Face + TSV" icon={Layers3}>
        <div className="grid gap-4 xl:grid-cols-3">
          {tiers.map((tier, index) => (
            <div key={tier.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between">
                <Badge tone={index === 0 ? "violet" : index === 1 ? "blue" : "amber"}>{tier.id}</Badge>
                <span className="text-xs text-slate-500">Util. {tier.utilization}%</span>
              </div>
              <div className="mt-4 text-lg font-semibold text-slate-950">{tier.name}</div>
              <div className="mt-1 text-sm text-slate-500">{tier.process}</div>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <div><span className="font-medium text-slate-800">Role:</span> {tier.role}</div>
                <div><span className="font-medium text-slate-800">Orientation:</span> {tier.orientation}</div>
                <div><span className="font-medium text-slate-800">Interconnect:</span> {tier.interconnect}</div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs text-slate-500">Area</div>
                  <div className="mt-1 font-semibold text-slate-900">{tier.area} mm²</div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs text-slate-500">Power</div>
                  <div className="mt-1 font-semibold text-slate-900">{tier.power} W</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Physical Partitions" subtitle="V7 uses physical_instance_count for quantity and partition_ratio for logical content share." icon={SplitSquareVertical}>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Partition</th>
                <th className="px-4 py-3">Logical Block</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Physical Count</th>
                <th className="px-4 py-3">Ratio</th>
                <th className="px-4 py-3">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {physicalPartitions.map((partition) => (
                <tr key={partition.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{partition.partition_name}</td>
                  <td className="px-4 py-3 text-slate-600">{partition.logical_component_name}</td>
                  <td className="px-4 py-3"><Badge tone="blue">{partition.tier_id}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{partition.physical_instance_count}</td>
                  <td className="px-4 py-3 text-slate-600">{(partition.partition_ratio * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3">
                    <Badge tone={partition.partition_type === "partial" ? "amber" : partition.partition_type === "residual" ? "slate" : "green"}>
                      {partition.partition_type}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CompareView({ scenarios, loading, error }: Pick<DataPageProps, "scenarios" | "loading" | "error">): JSX.Element {
  if (loading) return <Card title="Loading Scenarios" subtitle="Fetching comparison data..." icon={SplitSquareVertical}><div className="text-sm text-slate-500">Loading...</div></Card>;
  if (error) return <Card title="API Error" subtitle="FastAPI backend is not reachable yet." icon={AlertTriangle}><div className="text-sm text-red-600">{error}</div></Card>;

  return (
    <div className="space-y-6">
      <Card title="Scenario Comparison" subtitle="第一阶段重点支持不同架构方案可比、可追溯" icon={SplitSquareVertical}>
        <div className="grid gap-4 xl:grid-cols-3">
          {scenarios.map((scenario) => (
            <div key={scenario.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-slate-950">{scenario.name}</div>
                  <div className="mt-1 text-sm text-slate-500">{scenario.process}</div>
                </div>
                <Badge tone={riskTone(scenario.risk)}>{scenario.risk} Risk</Badge>
              </div>
              <p className="mt-4 min-h-[48px] text-sm leading-6 text-slate-600">{scenario.description}</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs text-slate-500">Area</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{scenario.area}</div>
                  <div className="text-xs text-slate-500">mm²</div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs text-slate-500">Power</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{scenario.power}</div>
                  <div className="text-xs text-slate-500">W</div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs text-slate-500">Thermal</div>
                  <div className="mt-1 font-semibold text-slate-900">{scenario.thermal}</div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs text-slate-500">Cost</div>
                  <div className="mt-1 font-semibold text-slate-900">{scenario.cost}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Cross-Scenario Roll-up" subtitle="示例：3DIC Option A相对2D baseline的初步收益与风险" icon={BarChart3}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-900">
            <div className="text-sm font-medium">Area Reduction</div>
            <div className="mt-2 text-3xl font-semibold">-37%</div>
            <p className="mt-2 text-sm leading-6 text-emerald-800">通过三层tier拆分降低单die平面面积，但需计入HB/TSV/keepout开销。</p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-5 text-amber-900">
            <div className="text-sm font-medium">Thermal Risk</div>
            <div className="mt-2 text-3xl font-semibold">High</div>
            <p className="mt-2 text-sm leading-6 text-amber-800">Top N5高性能logic与middle memory堆叠后，需要重点关注热点耦合。</p>
          </div>
          <div className="rounded-2xl bg-red-50 p-5 text-red-900">
            <div className="text-sm font-medium">Implementation Risk</div>
            <div className="mt-2 text-3xl font-semibold">High</div>
            <p className="mt-2 text-sm leading-6 text-red-800">W2W良率、bonding terminal assignment、TSV keepout和EDA flow均需提前验证。</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ImportsView({
  importing,
  importResult,
  importError,
  selectedTeam,
  onImportWorkbook,
}: Pick<DataPageProps, "importing" | "importResult" | "importError" | "selectedTeam" | "onImportWorkbook">): JSX.Element {
  const scopedTemplateUrl = importTemplateUrl(selectedTeam);
  return (
    <div className="space-y-6">
      <Card title="Excel Import Workbench" subtitle="Phase-1 imports use a controlled workbook template mapped to the SQLite schema." icon={Upload}>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <Upload className="mx-auto text-slate-400" size={34} />
          <div className="mt-4 text-base font-semibold text-slate-900">Upload SoC Import Workbook</div>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Download the workbook for {selectedTeam}, edit logical_components / physical_partitions / metrics, then upload the .xlsx file. The backend validates references and team scope before upserting into SQLite.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <a className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" href={scopedTemplateUrl}>
              Download {selectedTeam} Template
            </a>
            <label className={`cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 ${importing ? "opacity-60" : ""}`}>
              {importing ? "Importing..." : "Select .xlsx"}
              <input
                accept=".xlsx"
                className="hidden"
                disabled={importing}
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onImportWorkbook(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {importError && <div className="mx-auto mt-4 max-w-xl rounded-xl bg-red-50 p-3 text-sm text-red-700">{importError}</div>}
          {importResult && (
            <div className="mx-auto mt-4 max-w-xl rounded-xl bg-emerald-50 p-3 text-left text-sm text-emerald-800">
              <div className="font-semibold">Imported {importResult.filename}</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {Object.entries(importResult.imported).map(([sheet, count]) => (
                  <div key={sheet} className="rounded-lg bg-white/70 px-3 py-2">
                    {sheet}: <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="Recent Source Artifacts" subtitle="所有数据必须能追溯到来源文件、版本和owner" icon={FileText}>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Extracted</th>
                <th className="px-4 py-3">Issues</th>
                <th className="px-4 py-3">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {imports.map((item) => (
                <tr key={item.file} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{item.file}</td>
                  <td className="px-4 py-3 text-slate-600">{item.type}</td>
                  <td className="px-4 py-3"><Badge tone={item.status === "Parsed" ? "green" : "amber"}>{item.status}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{item.extracted}</td>
                  <td className="px-4 py-3 text-slate-600">{item.issues}</td>
                  <td className="px-4 py-3 text-slate-600">{item.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function QualityView({ qualityIssues, loading, error }: Pick<DataPageProps, "qualityIssues" | "loading" | "error">): JSX.Element {
  const highCount = qualityIssues.filter((issue) => issue.severity === "High").length;
  const mediumCount = qualityIssues.filter((issue) => issue.severity === "Medium").length;
  const lowCount = qualityIssues.filter((issue) => issue.severity === "Low").length;

  if (loading) return <Card title="Loading Quality Checks" subtitle="Evaluating V7 data rules..." icon={AlertTriangle}><div className="text-sm text-slate-500">Loading...</div></Card>;
  if (error) return <Card title="API Error" subtitle="FastAPI backend is not reachable yet." icon={AlertTriangle}><div className="text-sm text-red-600">{error}</div></Card>;

  return (
    <div className="space-y-6">
      <Card title="Data Quality Gate" subtitle="正式数据库只接受已确认数据；AI和自动解析结果先进入待审核区" icon={AlertTriangle}>
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Open Issues" value={qualityIssues.length} unit="" icon={AlertTriangle} hint="Rules" />
          <MetricCard label="High Severity" value={highCount} unit="" icon={Flame} hint="Blockers" />
          <MetricCard label="Medium Severity" value={mediumCount} unit="" icon={History} hint="Review" />
          <MetricCard label="Low Severity" value={lowCount} unit="" icon={CheckCircle2} hint="Info" />
        </div>
      </Card>

      <Card title="Quality Issues" subtitle="规则检查 + 人工确认；后续P1可加入AI anomaly detection" icon={AlertTriangle}>
        <div className="space-y-3">
          {qualityIssues.length === 0 && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-sm text-emerald-800">
              No open quality issues for the selected demo scenario. Partition ratios, full-instance counts, and numeric metrics are closed.
            </div>
          )}
          {qualityIssues.map((issue) => (
            <div key={issue.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={severityTone(issue.severity)}>{issue.severity}</Badge>
                    <div className="font-semibold text-slate-900">{issue.title}</div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{issue.detail}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">Recommended action: {issue.action}</p>
                  <div className="mt-2 font-mono text-xs text-slate-400">{issue.entity_type}:{issue.entity_id}</div>
                </div>
                <button className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button">
                  Review
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SchemaView(): JSX.Element {
  return (
    <div className="space-y-6">
      <Card title="Phase-1 Logical Data Model" subtitle="先稳定核心表，后续AI、仿真、优化都挂在这套数据模型上" icon={Database}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {schemaTables.map((table) => (
            <div key={table.table} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="font-mono text-sm font-semibold text-slate-950">{table.table}</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{table.purpose}</p>
              <div className="mt-3 rounded-xl bg-white p-3 font-mono text-xs leading-5 text-slate-500">{table.fields}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Phase-1 Boundary" subtitle="原型阶段不追求完整EDA闭环，先保证数据结构、追溯、对比能力" icon={Settings2}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><CheckCircle2 size={18} />Included</div>
            <ul className="space-y-2 text-sm leading-6 text-slate-600">
              <li>项目/方案/版本管理</li>
              <li>Block层次和资源类型</li>
              <li>Process/Tier/Allocation</li>
              <li>面积/功耗/频率基础指标</li>
              <li>文件来源追溯</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><AlertTriangle size={18} />Deferred to P1/P2</div>
            <ul className="space-y-2 text-sm leading-6 text-slate-600">
              <li>AI自动解析和命名对齐</li>
              <li>Thermal surrogate model</li>
              <li>Partition candidate generator</li>
              <li>EDA flow自动闭环</li>
              <li>Cost/yield高级模型</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><Flame size={18} />Key Risk</div>
            <ul className="space-y-2 text-sm leading-6 text-slate-600">
              <li>数据口径不一致</li>
              <li>Block命名不统一</li>
              <li>PHY/Analog约束遗漏</li>
              <li>3D split比例缺失</li>
              <li>来源文件不可追溯</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function Soc3dicPhase1Prototype(): JSX.Element {
  const [active, setActive] = useState<TabId>("dashboard");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [blocks, setBlocks] = useState<BlockNode[]>([]);
  const [tree, setTree] = useState<TreeBlock[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [tiers, setTiers] = useState<TierInfo[]>([]);
  const [physicalPartitions, setPhysicalPartitions] = useState<PhysicalPartition[]>([]);
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[]>([]);
  const [teams, setTeams] = useState<string[]>(["Architecture Team"]);
  const [selectedTeam, setSelectedTeam] = useState<string>("Architecture Team");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];

  async function refreshApiData(team = selectedTeam): Promise<void> {
    const [dashboardData, componentData, treeData, scenarioData, tierData, physicalPartitionData, qualityIssueData, teamData] = await Promise.all([
      getDashboard(),
      getComponents(team),
      getComponentTree(team),
      getScenarios(),
      getTiers(),
      getPhysicalPartitions(team),
      getQualityIssues(team),
      getResponsibilityTeams(),
    ]);
    setDashboard(dashboardData);
    setBlocks(componentData);
    setTree(treeData);
    setScenarios(scenarioData);
    setTiers(tierData);
    setPhysicalPartitions(physicalPartitionData);
    setQualityIssues(qualityIssueData);
    setTeams(teamData);
  }

  async function handleImportWorkbook(file: File): Promise<void> {
    try {
      setImporting(true);
      setImportError(null);
      const result = await uploadImportWorkbook(file, selectedTeam);
      setImportResult(result);
      await refreshApiData(selectedTeam);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Unknown import error");
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadApiData(): Promise<void> {
      try {
        setLoading(true);
        const [dashboardData, componentData, treeData, scenarioData, tierData, physicalPartitionData, qualityIssueData, teamData] = await Promise.all([
          getDashboard(),
          getComponents(selectedTeam),
          getComponentTree(selectedTeam),
          getScenarios(),
          getTiers(),
          getPhysicalPartitions(selectedTeam),
          getQualityIssues(selectedTeam),
          getResponsibilityTeams(),
        ]);
        if (cancelled) return;
        setDashboard(dashboardData);
        setBlocks(componentData);
        setTree(treeData);
        setScenarios(scenarioData);
        setTiers(tierData);
        setPhysicalPartitions(physicalPartitionData);
        setQualityIssues(qualityIssueData);
        setTeams(teamData);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown API error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadApiData();
    return () => {
      cancelled = true;
    };
  }, [selectedTeam]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-5 lg:block">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-900 p-3 text-white">
              <Layers3 size={24} />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">SoC Cross-Die DB</div>
              <div className="text-xs text-slate-500">Phase-1 Prototype</div>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = active === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActive(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    selected ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                  type="button"
                >
                  <Icon size={18} />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-8 rounded-2xl bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">MVP Goal</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">把架构规划数据从PPT/Excel转成可管理、可比较、可追溯的工程数据库。</p>
          </div>
        </aside>

        <main className="flex-1 p-4 md:p-8">
          <header className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Database size={16} />
                  SoC Cross-Die / 3DIC Architecture Data Platform
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">{activeTab.label}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">第一阶段MVP：统一项目、方案、block层次、process/tier、核心指标、数据来源和质量检查，为后续AI解析和工程评估引擎打基础。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={selectedTeam}
                  onChange={(event) => setSelectedTeam(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:bg-white focus:border-slate-400"
                  aria-label="Team scope"
                >
                  {teams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
                <Badge tone="green">Data-first</Badge>
                <Badge tone="blue">3DIC Ready</Badge>
                <Badge tone="amber">AI Hooks Reserved</Badge>
              </div>
            </div>

            <div className="mt-5 flex gap-2 overflow-x-auto lg:hidden">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActive(tab.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${active === tab.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
                    type="button"
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </header>

          {active === "dashboard" && <Dashboard dashboard={dashboard} loading={loading} error={error} />}
          {active === "hierarchy" && <HierarchyView blocks={blocks} tree={tree} loading={loading} error={error} />}
          {active === "tiers" && <TiersView tiers={tiers} physicalPartitions={physicalPartitions} loading={loading} error={error} />}
          {active === "compare" && <CompareView scenarios={scenarios} loading={loading} error={error} />}
          {active === "imports" && (
            <ImportsView
              importing={importing}
              importResult={importResult}
              importError={importError}
              selectedTeam={selectedTeam}
              onImportWorkbook={handleImportWorkbook}
            />
          )}
          {active === "quality" && <QualityView qualityIssues={qualityIssues} loading={loading} error={error} />}
          {active === "schema" && <SchemaView />}
        </main>
      </div>
    </div>
  );
}
