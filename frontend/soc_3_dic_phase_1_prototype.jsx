import React, { useMemo, useState } from "react";
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

type ProjectPhase = "Architecture Planning" | "Pre-Study" | "Design" | "Review" | "Released";
type RiskLevel = "Low" | "Medium" | "High";
type ConfidenceLevel = "approved" | "review" | "draft";
type SeverityLevel = "High" | "Medium" | "Low";
type BadgeTone = "slate" | "blue" | "green" | "amber" | "red" | "violet";
type TabId = "dashboard" | "hierarchy" | "tiers" | "compare" | "imports" | "quality" | "schema";

interface Project {
  id: string;
  name: string;
  family: string;
  phase: ProjectPhase;
  owner: string;
  updated: string;
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
  logicMTr: number;
  memoryMb: number;
  area: number;
  power: number;
  tier: string;
  confidence: ConfidenceLevel;
}

interface TreeBlock extends BlockNode {
  children: TreeBlock[];
}

interface ImportArtifact {
  file: string;
  type: string;
  status: "Parsed" | "Need Review" | "Draft Mapping";
  extracted: string;
  issues: number;
  owner: string;
}

interface DataIssue {
  severity: SeverityLevel;
  title: string;
  detail: string;
  action: string;
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

const projects: Project[] = [
  {
    id: "P001",
    name: "Mobile SoC Gen-A",
    family: "Flagship Mobile SoC",
    phase: "Architecture Planning",
    owner: "Architecture Team",
    updated: "2026-05-24",
  },
  {
    id: "P002",
    name: "Mobile SoC Gen-B",
    family: "Flagship Mobile SoC",
    phase: "Pre-Study",
    owner: "Product + Architecture",
    updated: "2026-05-18",
  },
];

const scenarios: Scenario[] = [
  {
    id: "S1",
    name: "2D Baseline",
    process: "N5 monolithic",
    die: "1 die",
    area: 118.4,
    power: 16.8,
    risk: "Low",
    cost: "Medium",
    thermal: "Medium",
    description: "Current 2D planning baseline for cross-generation comparison.",
  },
  {
    id: "S2",
    name: "3DIC Option A",
    process: "N5 + N7 + N7",
    die: "3 tiers W2W",
    area: 74.6,
    power: 15.2,
    risk: "High",
    cost: "High",
    thermal: "High",
    description: "Top N5 logic, middle N7 logic/memory, bottom N7 IO/PHY/PDN.",
  },
  {
    id: "S3",
    name: "Cost-Reduced Option",
    process: "N7 + N7",
    die: "2 tiers W2W",
    area: 91.8,
    power: 17.1,
    risk: "Medium",
    cost: "Medium",
    thermal: "Medium",
    description: "More conservative 2-tier split with lower process cost.",
  },
];

const tierData: TierInfo[] = [
  {
    id: "T0",
    name: "Top Tier",
    process: "TSMC N5",
    role: "High-performance logic",
    orientation: "Face-down",
    interconnect: "HB < 1um",
    area: 28.2,
    power: 7.6,
    utilization: 72,
  },
  {
    id: "T1",
    name: "Middle Tier",
    process: "TSMC N7",
    role: "Memory + medium logic",
    orientation: "Face-up / Face-to-face",
    interconnect: "HB + TSV",
    area: 31.4,
    power: 4.8,
    utilization: 66,
  },
  {
    id: "T2",
    name: "Bottom Tier",
    process: "TSMC N7",
    role: "IO / PHY / PDN / logic",
    orientation: "Backside PDN",
    interconnect: "TSV < 5um",
    area: 15.0,
    power: 2.8,
    utilization: 58,
  },
];

const blocks: BlockNode[] = [
  {
    id: "B0",
    parent: null,
    name: "SOC_TOP",
    type: "top",
    domain: "SoC",
    resource: "mixed",
    logicMTr: 0,
    memoryMb: 0,
    area: 74.6,
    power: 15.2,
    tier: "Split",
    confidence: "approved",
  },
  {
    id: "B1",
    parent: "B0",
    name: "CPU_CLUSTER",
    type: "subsystem",
    domain: "Compute",
    resource: "logic",
    logicMTr: 1850,
    memoryMb: 24,
    area: 12.8,
    power: 4.1,
    tier: "T0",
    confidence: "review",
  },
  {
    id: "B2",
    parent: "B0",
    name: "GPU_TOP",
    type: "subsystem",
    domain: "Graphics",
    resource: "logic",
    logicMTr: 3100,
    memoryMb: 18,
    area: 18.7,
    power: 5.5,
    tier: "T0/T1",
    confidence: "review",
  },
  {
    id: "B3",
    parent: "B0",
    name: "NPU_TOP",
    type: "subsystem",
    domain: "AI",
    resource: "logic+memory",
    logicMTr: 2400,
    memoryMb: 64,
    area: 21.2,
    power: 3.8,
    tier: "T0/T1",
    confidence: "draft",
  },
  {
    id: "B4",
    parent: "B0",
    name: "ISP_TOP",
    type: "subsystem",
    domain: "Camera",
    resource: "logic",
    logicMTr: 980,
    memoryMb: 12,
    area: 7.4,
    power: 1.4,
    tier: "T1",
    confidence: "approved",
  },
  {
    id: "B5",
    parent: "B0",
    name: "DDR_PHY",
    type: "phy",
    domain: "Memory IO",
    resource: "phy_analog",
    logicMTr: 0,
    memoryMb: 0,
    area: 4.8,
    power: 0.9,
    tier: "T2",
    confidence: "approved",
  },
  {
    id: "B6",
    parent: "B0",
    name: "PCIE_USB_PHY",
    type: "phy",
    domain: "External IO",
    resource: "phy_analog",
    logicMTr: 0,
    memoryMb: 0,
    area: 3.1,
    power: 0.6,
    tier: "T2",
    confidence: "approved",
  },
  {
    id: "B7",
    parent: "B1",
    name: "CPU_CORE_0",
    type: "block",
    domain: "CPU",
    resource: "logic",
    logicMTr: 420,
    memoryMb: 2,
    area: 2.7,
    power: 0.95,
    tier: "T0",
    confidence: "review",
  },
  {
    id: "B8",
    parent: "B3",
    name: "NPU_SRAM_BANKS",
    type: "macro_group",
    domain: "AI Memory",
    resource: "memory",
    logicMTr: 0,
    memoryMb: 48,
    area: 8.2,
    power: 0.8,
    tier: "T1",
    confidence: "draft",
  },
];

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

const dataIssues: DataIssue[] = [
  {
    severity: "High",
    title: "NPU_TOP split ratio missing",
    detail: "NPU_TOP is assigned to T0/T1 but lacks transistor_ratio and memory_ratio allocation.",
    action: "Add component_allocation record before area roll-up.",
  },
  {
    severity: "Medium",
    title: "GPU_TOP power density needs validation",
    detail: "GPU_TOP estimated power density is higher than historical Gen-A baseline.",
    action: "Compare with latest PnR power report or add scenario-specific activity factor.",
  },
  {
    severity: "Medium",
    title: "PHY block should remain fixed",
    detail: "DDR_PHY is correctly placed on bottom tier, but no keepout/edge constraint is recorded.",
    action: "Add PHY physical constraint before 3D floorplan exploration.",
  },
  {
    severity: "Low",
    title: "Alias mapping candidate",
    detail: "AI Engine, AIE, and NPU_TOP appear to refer to the same subsystem in uploaded documents.",
    action: "Approve canonical alias mapping.",
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
    table: "component_instance",
    purpose: "Block层次结构与功能域",
    fields: "instance_id, parent_id, name, type, resource_type, hierarchy_path",
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
    table: "component_metric",
    purpose: "面积、晶体管数、功耗、频率等指标",
    fields: "metric_id, instance_id, scenario_id, metric_type, value, unit, source_id",
  },
  {
    table: "component_allocation",
    purpose: "一个逻辑block在多个tier上的物理分配",
    fields: "allocation_id, instance_id, tier_id, area_ratio, transistor_ratio, memory_ratio",
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

function buildTree(items: BlockNode[], parent: string | null = null): TreeBlock[] {
  return items
    .filter((item) => item.parent === parent)
    .map((item) => ({ ...item, children: buildTree(items, item.id) }));
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

function Dashboard(): JSX.Element {
  const targetScenario = scenarios.find((scenario) => scenario.id === "S2") ?? scenarios[0];
  const totalArea = targetScenario.area;
  const totalPower = targetScenario.power;
  const memoryTotal = blocks.reduce((sum, block) => sum + block.memoryMb, 0);
  const phyArea = blocks.filter((block) => block.resource.includes("phy")).reduce((sum, block) => sum + block.area, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="3DIC Option A 估算总面积" value={totalArea} unit="mm²" icon={Package} hint="Scenario S2" />
        <MetricCard label="Peak场景总功耗估计" value={totalPower} unit="W" icon={Gauge} hint="Draft" />
        <MetricCard label="已建模Memory容量" value={memoryTotal} unit="Mb" icon={MemoryStick} hint="Macro+Cache" />
        <MetricCard label="PHY/Analog固定面积" value={phyArea.toFixed(1)} unit="mm²" icon={RadioTower} hint="Fixed" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="当前项目" subtitle="第一阶段原型：项目、版本、方案、来源追溯" icon={Cpu}>
          <div className="space-y-3">
            {projects.map((project) => (
              <div key={project.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{project.name}</div>
                    <div className="mt-1 text-sm text-slate-500">{project.family}</div>
                  </div>
                  <Badge tone="blue">{project.phase}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500">
                  <div>
                    Owner: <span className="text-slate-700">{project.owner}</span>
                  </div>
                  <div>
                    Updated: <span className="text-slate-700">{project.updated}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="面积构成" subtitle="Logic / Memory / PHY分开建模，避免单纯mm²失真" icon={BarChart3}>
          <div className="space-y-4">
            {[
              { label: "Logic + mixed", value: 58, tone: "bg-slate-900" },
              { label: "Memory macro", value: 27, tone: "bg-slate-500" },
              { label: "PHY / Analog", value: 15, tone: "bg-slate-300" },
            ].map((item) => (
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

function HierarchyView(): JSX.Element {
  const tree = useMemo<TreeBlock[]>(() => buildTree(blocks), []);
  const [selectedId, setSelectedId] = useState<string>("B3");
  const selected = blocks.find((block) => block.id === selectedId) ?? blocks[0];
  const children = blocks.filter((block) => block.parent === selected.id);
  const SelectedIcon = selected.resource.includes("phy") ? RadioTower : selected.resource.includes("memory") ? MemoryStick : Cpu;

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card title="Block Hierarchy" subtitle="component_instance支持无限层次结构" icon={GitBranch}>
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
          subtitle={`${selected.domain} / ${selected.type}`}
          icon={SelectedIcon}
          right={<Badge tone={confidenceTone(selected.confidence)}>{selected.confidence}</Badge>}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Resource Type</div>
              <div className="mt-2 font-semibold text-slate-900">{selected.resource}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Logic Scale</div>
              <div className="mt-2 font-semibold text-slate-900">{selected.logicMTr || "-"} MTr</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Memory</div>
              <div className="mt-2 font-semibold text-slate-900">{selected.memoryMb || "-"} Mb</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Tier Assignment</div>
              <div className="mt-2 font-semibold text-slate-900">{selected.tier}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-900">Area / Power</div>
              <div className="mt-3 flex items-end gap-6">
                <div>
                  <div className="text-2xl font-semibold text-slate-950">{selected.area}</div>
                  <div className="text-xs text-slate-500">mm²</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-slate-950">{selected.power}</div>
                  <div className="text-xs text-slate-500">W</div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-900">Child Blocks</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {children.length > 0 ? children.map((child) => <Badge key={child.id}>{child.name}</Badge>) : <span className="text-sm text-slate-500">No child blocks</span>}
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

function TiersView(): JSX.Element {
  return (
    <div className="space-y-6">
      <Card title="3D Stack Definition" subtitle="Scenario S2: N5 + N7 + N7, Wafer-to-Wafer, Face-to-Face + TSV" icon={Layers3}>
        <div className="grid gap-4 xl:grid-cols-3">
          {tierData.map((tier, index) => (
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

      <Card title="Tier Allocation Preview" subtitle="第一阶段只记录分配事实和约束，不做复杂自动partition" icon={SplitSquareVertical}>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Block</th>
                <th className="px-4 py-3">Resource</th>
                <th className="px-4 py-3">Assigned Tier</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Constraint</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {blocks.filter((block) => block.parent === "B0").map((block) => (
                <tr key={block.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{block.name}</td>
                  <td className="px-4 py-3 text-slate-600">{block.resource}</td>
                  <td className="px-4 py-3"><Badge tone={block.tier.includes("/") ? "amber" : "blue"}>{block.tier}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{block.area} mm²</td>
                  <td className="px-4 py-3 text-slate-600">{block.resource.includes("phy") ? "Fixed edge / keepout required" : block.tier.includes("/") ? "Need split ratio" : "Movable"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CompareView(): JSX.Element {
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

function ImportsView(): JSX.Element {
  return (
    <div className="space-y-6">
      <Card title="Data Ingestion Workbench" subtitle="第一阶段支持文件上传、字段映射、来源追溯；AI解析作为P1扩展接口预留" icon={Upload}>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <Upload className="mx-auto text-slate-400" size={34} />
          <div className="mt-4 text-base font-semibold text-slate-900">Upload Excel / PPT / PDF / EDA Report</div>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">原型阶段先完成source_artifact、字段映射和人工确认流程。后续P1加入AI自动解析、命名对齐和异常检测。</p>
          <button className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800" type="button">
            Select Files
          </button>
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

function QualityView(): JSX.Element {
  return (
    <div className="space-y-6">
      <Card title="Data Quality Gate" subtitle="正式数据库只接受已确认数据；AI和自动解析结果先进入待审核区" icon={AlertTriangle}>
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Approved Metrics" value="126" unit="" icon={CheckCircle2} hint="Official" />
          <MetricCard label="Need Review" value="34" unit="" icon={History} hint="Queue" />
          <MetricCard label="Open Issues" value="10" unit="" icon={AlertTriangle} hint="Action" />
          <MetricCard label="Source Files" value="18" unit="" icon={FileText} hint="Traceable" />
        </div>
      </Card>

      <Card title="Quality Issues" subtitle="规则检查 + 人工确认；后续P1可加入AI anomaly detection" icon={AlertTriangle}>
        <div className="space-y-3">
          {dataIssues.map((issue) => (
            <div key={issue.title} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={severityTone(issue.severity)}>{issue.severity}</Badge>
                    <div className="font-semibold text-slate-900">{issue.title}</div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{issue.detail}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">Recommended action: {issue.action}</p>
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
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-5 lg:block">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-900 p-3 text-white">
              <Layers3 size={24} />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">SoC跨代数据库</div>
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
            <div className="text-sm font-semibold text-slate-900">Prototype Goal</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">把架构规划数据从PPT/Excel转成可管理、可比较、可追溯的工程数据库。</p>
          </div>
        </aside>

        <main className="flex-1 p-4 md:p-8">
          <header className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Database size={16} />
                  Mobile SoC / 3DIC Architecture Data Platform
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">{activeTab.label}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">第一阶段MVP：统一项目、方案、block层次、process/tier、核心指标、数据来源和质量检查，为后续AI解析和工程评估引擎打基础。</p>
              </div>
              <div className="flex flex-wrap gap-2">
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

          {active === "dashboard" && <Dashboard />}
          {active === "hierarchy" && <HierarchyView />}
          {active === "tiers" && <TiersView />}
          {active === "compare" && <CompareView />}
          {active === "imports" && <ImportsView />}
          {active === "quality" && <QualityView />}
          {active === "schema" && <SchemaView />}
        </main>
      </div>
    </div>
  );
}
