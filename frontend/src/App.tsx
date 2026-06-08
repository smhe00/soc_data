import React, { useEffect, useMemo, useState } from "react";
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
  ChevronDown,
  ChevronRight,
  FileText,
  Settings2,
  SplitSquareVertical,
  Gauge,
  Flame,
  Package,
  History,
  Moon,
  Sun,
} from "lucide-react";
import { getComponents, getComponentTree, getPhysicalPartitions, updateComponentDetail } from "./api/components";
import { importTemplateUrl, uploadImportWorkbook, type ImportResult } from "./api/imports";
import { getDashboard } from "./api/metrics";
import { getQualityIssues, type QualityIssue } from "./api/quality";
import { getResponsibilityTeams } from "./api/responsibilities";
import { getScenarioImplementation, getScenarios, updateScenarioImplementation, type ScenarioImplementationResponse } from "./api/scenarios";
import { getTiers } from "./api/tiers";
import type { DashboardData } from "./types/metric";

type ProjectPhase = "Architecture Planning" | "Pre-Study" | "Design" | "Review" | "Released";
type RiskLevel = "Low" | "Medium" | "High";
type ConfidenceLevel = "approved" | "review" | "draft";
type SeverityLevel = "High" | "Medium" | "Low";
type BadgeTone = "slate" | "blue" | "green" | "amber" | "red" | "violet";
type TabId = "dashboard" | "hierarchy" | "tiers" | "implementation" | "compare" | "imports" | "quality" | "schema";
type ThemeMode = "light" | "dark";
type PartitionResourceCategory = "logic" | "sram" | "block";

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
  resource_category: PartitionResourceCategory;
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

interface StackTierDefinition {
  id: string;
  name: string;
  role: string;
  process: string;
  thicknessUm: number;
  color: string;
}

interface StackInterfaceDefinition {
  id: string;
  fromTierId: string;
  toTierId: string;
  orientation: "Face-to-Face" | "Face-to-Back" | "Back-to-Face" | "Back-to-Back";
  interconnect: "HB" | "TSV" | "HB + TSV";
  hbPitchUm: number;
  upperTsvPitchUm: number;
  upperTsvKeepOutUm: number;
  lowerTsvPitchUm: number;
  lowerTsvKeepOutUm: number;
  description: string;
}

type StackImplementationType = "Monolithic" | "Wafer-to-Wafer" | "2.5D Interposer";

interface PackageEscapeDefinition {
  pitchUm: number;
  keepOutUm: number;
  description: string;
}

type DieSide = "Face" | "Back";

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

interface FieldLabelProps {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}

interface TextInputProps {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

interface UnitNumberInputProps {
  ariaLabel: string;
  value: number;
  onChange: (value: number) => void;
  unit: string;
  disabled?: boolean;
  id?: string;
  min?: number;
  max?: number;
  step?: number | string;
  tone?: "slate" | "amber";
}

interface SegmentedControlProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
}

interface StepperInputProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
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
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  depth?: number;
}

interface PartitionMappingEditorProps {
  component: BlockNode;
  tiers: TierInfo[];
  selectedScenarioId: string;
  selectedTeam: string;
  onSave: (component: BlockNode, logicalInstanceCount: number, partitions: PhysicalPartition[]) => Promise<void>;
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
  selectedScenarioId: string;
  selectedTeam: string;
  onSaveComponentDetail: (component: BlockNode, logicalInstanceCount: number, partitions: PhysicalPartition[]) => Promise<void>;
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
    fields: "id, logical_component_id, tier_id, resource_category, physical_instance_count, content_share",
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
  { id: "implementation", label: "实现方案", icon: Package },
  { id: "compare", label: "方案对比", icon: SplitSquareVertical },
  { id: "imports", label: "数据导入", icon: Upload },
  { id: "quality", label: "数据质量", icon: AlertTriangle },
  { id: "schema", label: "数据模型", icon: Database },
];

const defaultStackTiers: StackTierDefinition[] = [
  { id: "T1", name: "Tier 1", role: "Compute logic", process: "N3E", thicknessUm: 45, color: "bg-sky-100 border-sky-300 text-sky-950" },
  { id: "T2", name: "Tier 2", role: "SRAM / cache", process: "N5", thicknessUm: 55, color: "bg-emerald-100 border-emerald-300 text-emerald-950" },
  { id: "T3", name: "Tier 3", role: "IO / analog", process: "N6", thicknessUm: 70, color: "bg-amber-100 border-amber-300 text-amber-950" },
];

const defaultStackInterfaces: StackInterfaceDefinition[] = [
  {
    id: "I12",
    fromTierId: "T1",
    toTierId: "T2",
    orientation: "Face-to-Face",
    interconnect: "HB",
    hbPitchUm: 0.8,
    upperTsvPitchUm: 0,
    upperTsvKeepOutUm: 0,
    lowerTsvPitchUm: 0,
    lowerTsvKeepOutUm: 0,
    description: "Fine-pitch hybrid bonding for high-bandwidth compute/cache links.",
  },
  {
    id: "I23",
    fromTierId: "T2",
    toTierId: "T3",
    orientation: "Back-to-Face",
    interconnect: "HB + TSV",
    hbPitchUm: 0.8,
    upperTsvPitchUm: 5,
    upperTsvKeepOutUm: 8,
    lowerTsvPitchUm: 0,
    lowerTsvKeepOutUm: 0,
    description: "Hybrid bond plus TSV escape for lower tier power, IO, and control.",
  },
];

const defaultPackageEscape: PackageEscapeDefinition = {
  pitchUm: 10,
  keepOutUm: 12,
  description: "Package-side TSV escape from bottom die back side to bumps.",
};

const stackTierColors = [
  "bg-sky-100 border-sky-300 text-sky-950",
  "bg-emerald-100 border-emerald-300 text-emerald-950",
  "bg-amber-100 border-amber-300 text-amber-950",
  "bg-violet-100 border-violet-300 text-violet-950",
  "bg-rose-100 border-rose-300 text-rose-950",
];
const orientationOptions: StackInterfaceDefinition["orientation"][] = ["Face-to-Face", "Face-to-Back", "Back-to-Face", "Back-to-Back"];
const interconnectOptions: StackInterfaceDefinition["interconnect"][] = ["HB", "TSV", "HB + TSV"];
const stackTypeOptions: StackImplementationType[] = ["Monolithic", "Wafer-to-Wafer", "2.5D Interposer"];
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
const orientationShortLabels: Record<StackInterfaceDefinition["orientation"], string> = {
  "Face-to-Face": "F-F",
  "Face-to-Back": "F-B",
  "Back-to-Face": "B-F",
  "Back-to-Back": "B-B",
};

function getUpperInterfaceSide(orientation: StackInterfaceDefinition["orientation"]): DieSide {
  return orientation.startsWith("Face") ? "Face" : "Back";
}

function getLowerInterfaceSide(orientation: StackInterfaceDefinition["orientation"]): DieSide {
  return orientation.endsWith("Face") ? "Face" : "Back";
}

function getOppositeSide(side: DieSide): DieSide {
  return side === "Face" ? "Back" : "Face";
}

function usesUpperTsv(interfaceItem: StackInterfaceDefinition): boolean {
  return interfaceItem.interconnect.includes("TSV") && getUpperInterfaceSide(interfaceItem.orientation) === "Back";
}

function usesLowerTsv(interfaceItem: StackInterfaceDefinition): boolean {
  return interfaceItem.interconnect.includes("TSV") && getLowerInterfaceSide(interfaceItem.orientation) === "Back";
}

function makeOrientation(upperSide: DieSide, lowerSide: DieSide): StackInterfaceDefinition["orientation"] {
  return `${upperSide}-to-${lowerSide}` as StackInterfaceDefinition["orientation"];
}

function getAllowedOrientationOptions(index: number, interfaces: StackInterfaceDefinition[]): StackInterfaceDefinition["orientation"][] {
  if (index === 0) return orientationOptions;
  const previous = interfaces[index - 1];
  if (!previous) return orientationOptions;
  const requiredUpperSide = getOppositeSide(getLowerInterfaceSide(previous.orientation));
  return orientationOptions.filter((orientation) => getUpperInterfaceSide(orientation) === requiredUpperSide);
}

function normalizeInterfaceOrientations(interfaces: StackInterfaceDefinition[]): StackInterfaceDefinition[] {
  return interfaces.reduce<StackInterfaceDefinition[]>((normalized, item, index) => {
    if (index === 0) return [item];
    const previous = normalized[index - 1];
    const requiredUpperSide = getOppositeSide(getLowerInterfaceSide(previous.orientation));
    if (getUpperInterfaceSide(item.orientation) === requiredUpperSide) return [...normalized, item];
    return [...normalized, { ...item, orientation: makeOrientation(requiredUpperSide, getLowerInterfaceSide(item.orientation)) }];
  }, []);
}

function withInterfaceParameterDefaults(interfaceItem: StackInterfaceDefinition): StackInterfaceDefinition {
  return {
    ...interfaceItem,
    hbPitchUm: interfaceItem.interconnect.includes("HB") && interfaceItem.hbPitchUm === 0 ? 0.8 : interfaceItem.hbPitchUm,
    upperTsvPitchUm: usesUpperTsv(interfaceItem) && interfaceItem.upperTsvPitchUm === 0 ? 5 : interfaceItem.upperTsvPitchUm,
    upperTsvKeepOutUm: usesUpperTsv(interfaceItem) && interfaceItem.upperTsvKeepOutUm === 0 ? 8 : interfaceItem.upperTsvKeepOutUm,
    lowerTsvPitchUm: usesLowerTsv(interfaceItem) && interfaceItem.lowerTsvPitchUm === 0 ? 5 : interfaceItem.lowerTsvPitchUm,
    lowerTsvKeepOutUm: usesLowerTsv(interfaceItem) && interfaceItem.lowerTsvKeepOutUm === 0 ? 8 : interfaceItem.lowerTsvKeepOutUm,
  };
}

function normalizeInterfaces(interfaces: StackInterfaceDefinition[]): StackInterfaceDefinition[] {
  return normalizeInterfaceOrientations(interfaces).map(withInterfaceParameterDefaults);
}

function defaultInterfacesForTiers(tierDefinitions: StackTierDefinition[], current: StackInterfaceDefinition[] = []): StackInterfaceDefinition[] {
  return normalizeInterfaces(Array.from({ length: Math.max(0, tierDefinitions.length - 1) }, (_, index) => {
    const fromTierId = tierDefinitions[index].id;
    const toTierId = tierDefinitions[index + 1].id;
    return (
      current.find((item) => item.fromTierId === fromTierId && item.toTierId === toTierId) ?? {
        id: `I${index + 1}${index + 2}`,
        fromTierId,
        toTierId,
        orientation: index === 0 ? "Face-to-Face" : "Back-to-Face",
        interconnect: index === 0 ? "HB" : "HB + TSV",
        hbPitchUm: 0.8,
        upperTsvPitchUm: index === 0 ? 0 : 5,
        upperTsvKeepOutUm: index === 0 ? 0 : 8,
        lowerTsvPitchUm: 0,
        lowerTsvKeepOutUm: 0,
        description: "W2W interface definition.",
      }
    );
  }));
}

function implementationTypeFromApi(value: string): StackImplementationType {
  return stackTypeOptions.includes(value as StackImplementationType) ? (value as StackImplementationType) : "Wafer-to-Wafer";
}

function tiersFromImplementation(implementation: ScenarioImplementationResponse): StackTierDefinition[] {
  return implementation.tiers.map((tier, index) => ({
    id: tier.id,
    name: tier.name,
    process: tier.process,
    role: tier.role,
    thicknessUm: tier.thickness_um,
    color: stackTierColors[index] ?? stackTierColors[stackTierColors.length - 1],
  }));
}

function interfacesFromImplementation(implementation: ScenarioImplementationResponse): StackInterfaceDefinition[] {
  return normalizeInterfaces(implementation.interfaces.map((item) => ({
    id: item.id,
    fromTierId: item.from_tier_id,
    toTierId: item.to_tier_id,
    orientation: item.orientation as StackInterfaceDefinition["orientation"],
    interconnect: item.interconnect as StackInterfaceDefinition["interconnect"],
    hbPitchUm: item.hb_pitch_um,
    upperTsvPitchUm: item.upper_tsv_pitch_um,
    upperTsvKeepOutUm: item.upper_tsv_keepout_um,
    lowerTsvPitchUm: item.lower_tsv_pitch_um,
    lowerTsvKeepOutUm: item.lower_tsv_keepout_um,
    description: item.description,
  })));
}

function getBottomInterface(tiers: StackTierDefinition[], interfaces: StackInterfaceDefinition[]): StackInterfaceDefinition | undefined {
  if (tiers.length < 2) return undefined;
  const upperTier = tiers[tiers.length - 2];
  const bottomTier = tiers[tiers.length - 1];
  return interfaces.find((item) => item.fromTierId === upperTier.id && item.toTierId === bottomTier.id);
}

function getDerivedBottomBumpSide(tiers: StackTierDefinition[], interfaces: StackInterfaceDefinition[]): "Face" | "Back" {
  const bottomInterface = getBottomInterface(tiers, interfaces);
  if (!bottomInterface) return "Face";
  return getLowerInterfaceSide(bottomInterface.orientation) === "Face" ? "Back" : "Face";
}

function requiresPackageTsv(tiers: StackTierDefinition[], interfaces: StackInterfaceDefinition[]): boolean {
  return getDerivedBottomBumpSide(tiers, interfaces) === "Back";
}

function getTierSurfaceSides(tiers: StackTierDefinition[], interfaces: StackInterfaceDefinition[], index: number): { top: DieSide; bottom: DieSide } {
  const tier = tiers[index];
  const interfaceAbove = interfaces.find((item) => item.fromTierId === tiers[index - 1]?.id && item.toTierId === tier.id);
  const interfaceBelow = interfaces.find((item) => item.fromTierId === tier.id && item.toTierId === tiers[index + 1]?.id);
  const top = interfaceAbove ? getLowerInterfaceSide(interfaceAbove.orientation) : interfaceBelow ? getOppositeSide(getUpperInterfaceSide(interfaceBelow.orientation)) : getOppositeSide(getDerivedBottomBumpSide(tiers, interfaces));
  const bottom = interfaceBelow ? getUpperInterfaceSide(interfaceBelow.orientation) : getOppositeSide(top);
  return { top, bottom };
}

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

function FieldLabel({ label, htmlFor, children }: FieldLabelProps): JSX.Element {
  return (
    <label className="grid gap-1" htmlFor={htmlFor}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function TextInput({ ariaLabel, id, value, onChange }: TextInputProps): JSX.Element {
  return (
    <input
      aria-label={ariaLabel}
      className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
      id={id}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  );
}

function UnitNumberInput({
  ariaLabel,
  disabled = false,
  id,
  max,
  min,
  onChange,
  step = "0.1",
  tone = "slate",
  unit,
  value,
}: UnitNumberInputProps): JSX.Element {
  const toneClass = tone === "amber" ? "border-amber-200 bg-amber-50/70 focus-within:border-amber-300" : "border-slate-200 bg-slate-50 focus-within:border-slate-400";

  return (
    <div
      className={`flex h-8 items-center overflow-hidden rounded-md border transition focus-within:bg-white focus-within:ring-2 ${
        tone === "amber" ? "focus-within:ring-amber-100" : "focus-within:ring-slate-200"
      } ${disabled ? "bg-slate-100 text-slate-400" : toneClass}`}
    >
      <input
        aria-label={ariaLabel}
        className="numeric-input h-full min-w-0 flex-1 border-0 bg-transparent px-1.5 text-right text-sm font-medium outline-none disabled:text-slate-400"
        disabled={disabled}
        id={id}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={value}
      />
      <span className="border-l border-inherit px-1.5 text-[10px] font-semibold uppercase text-slate-400">{unit}</span>
    </div>
  );
}

function SegmentedControl<T extends string>({ ariaLabel, onChange, options, value }: SegmentedControlProps<T>): JSX.Element {
  return (
    <div aria-label={ariaLabel} className="inline-grid h-8 w-full grid-flow-col overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-0.5" role="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-checked={selected}
            className={`min-w-0 rounded px-2 text-xs font-semibold transition ${
              selected ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
            }`}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            title={option.title ?? option.label}
            type="button"
          >
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StepperInput({ id, label, max, min, onChange, value }: StepperInputProps): JSX.Element {
  const clamp = (nextValue: number): number => Math.max(min, Math.min(max, nextValue));

  return (
    <FieldLabel htmlFor={id} label={label}>
      <div className="grid h-9 grid-cols-[32px_1fr_32px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <button className="text-slate-500 transition hover:bg-white hover:text-slate-900" onClick={() => onChange(clamp(value - 1))} type="button">
          -
        </button>
        <input
          className="min-w-0 border-x border-slate-200 bg-transparent px-2 text-center text-sm font-semibold text-slate-800 outline-none"
          id={id}
          max={max}
          min={min}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
          type="number"
          value={value}
        />
        <button className="text-slate-500 transition hover:bg-white hover:text-slate-900" onClick={() => onChange(clamp(value + 1))} type="button">
          +
        </button>
      </div>
    </FieldLabel>
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

function AreaTriplet({ logic, sram, block, compact = false }: { logic: number; sram: number; block: number; compact?: boolean }): JSX.Element {
  const numberClass = compact ? "text-base font-semibold text-slate-950" : "text-2xl font-semibold text-slate-950";
  const labelClass = compact ? "text-[11px] text-slate-500" : "text-xs text-slate-500";
  return (
    <div className={compact ? "mt-2 grid grid-cols-3 gap-2" : "mt-3 flex items-end gap-6"}>
      <div>
        <div className={numberClass}>{logic}</div>
        <div className={labelClass}>logic mm²</div>
      </div>
      <div>
        <div className={numberClass}>{sram}</div>
        <div className={labelClass}>SRAM mm²</div>
      </div>
      <div>
        <div className={numberClass}>{block}</div>
        <div className={labelClass}>block mm²</div>
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

function PartitionMappingEditor({ component, tiers, selectedScenarioId, selectedTeam, onSave }: PartitionMappingEditorProps): JSX.Element {
  const [logicalCount, setLogicalCount] = useState<number>(component.logical_instance_count);
  const [partitions, setPartitions] = useState<PhysicalPartition[]>(component.partitions);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requiredCategories = useMemo(() => requiredPartitionCategories(component), [component]);

  useEffect(() => {
    setLogicalCount(component.logical_instance_count);
    const normalizedPartitions = component.partitions.map((partition) => ({ ...partition, resource_category: partition.resource_category ?? "block" }));
    const missingCategories = requiredPartitionCategories(component).filter((category) => !normalizedPartitions.some((partition) => partition.resource_category === category));
    setPartitions([
      ...normalizedPartitions,
      ...missingCategories.map((category, index) => makeDefaultPartition(component, selectedScenarioId, component.logical_instance_count, tiers, category, normalizedPartitions.length + index + 1)),
    ]);
    setSaveError(null);
  }, [component, selectedScenarioId, tiers]);

  const categoryCoverage = partitionResourceCategories.map((category) => {
    const equivalent = partitions
      .filter((partition) => partition.resource_category === category.id)
      .reduce((sum, partition) => sum + Number(partition.physical_instance_count || 0) * Number(partition.content_share || 0), 0);
    const rowCount = partitions.filter((partition) => partition.resource_category === category.id).length;
    return {
      ...category,
      equivalent,
      rowCount,
      required: requiredCategories.includes(category.id),
      closed: !requiredCategories.includes(category.id) && rowCount === 0 ? true : Math.abs(equivalent - logicalCount) < 0.001,
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
    const resourceCategory = requiredCategories.find((category) => !partitions.some((partition) => partition.resource_category === category)) ?? partitionResourceCategories.find((category) => !partitions.some((partition) => partition.resource_category === category.id))?.id ?? "logic";
    setPartitions((rows) => [
      ...rows,
      makeDefaultPartition(component, selectedScenarioId, logicalCount, tiers, resourceCategory, suffix),
    ]);
  }

  async function save(): Promise<void> {
    try {
      setSaving(true);
      setSaveError(null);
      await onSave(component, component.logical_instance_count, canonicalizePartitionNames(component, sortPartitionsForDisplay(partitions)));
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
    <Card title="Physical Partition Mapping" subtitle={mappingSubtitle} icon={SplitSquareVertical}>
      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">Logical Instances</div>
          <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
            {logicalCount}x
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2">
          <div className="text-xs text-slate-500">Mapped Equivalent by Category</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {categoryCoverage.map((category) => (
              <Badge key={category.id} tone={category.closed ? "green" : "amber"}>
                {category.label} {category.required ? `${category.equivalent.toFixed(2)}/${logicalCount}` : category.rowCount === 0 ? "optional" : `${category.equivalent.toFixed(2)}/${logicalCount}`}
              </Badge>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">Input Rule</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">category + full/partial</span>
            <Badge tone={coverageClosed ? "green" : "amber"}>{coverageClosed ? "closed" : "open"}</Badge>
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-xs text-slate-500">Tier Summary</div>
          <div className="mt-2 text-sm font-semibold text-slate-900">{tierSummary || "-"}</div>
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

function HierarchyView({
  blocks,
  tree,
  tiers,
  selectedScenarioId,
  selectedTeam,
  loading,
  error,
  onSaveComponentDetail,
}: Pick<DataPageProps, "blocks" | "tree" | "tiers" | "selectedScenarioId" | "selectedTeam" | "loading" | "error" | "onSaveComponentDetail">): JSX.Element {
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
              <div className="mt-2 font-semibold text-slate-900">{selected.logical_instance_count}x</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Tier Assignment</div>
              <div className="mt-2 font-semibold text-slate-900">{selected.tier}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-900">Total Logic / SRAM / Block Area</div>
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
              {selected.has_children && (
                <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Children Sum</div>
                    <AreaTriplet compact logic={selected.child_logic_area} sram={selected.child_sram_area} block={selected.child_block_area} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Residual / Self</div>
                    <AreaTriplet compact logic={selected.residual_logic_area} sram={selected.residual_sram_area} block={selected.residual_block_area} />
                  </div>
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-900">Physical Coverage</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="blue">physical {selected.physical_instance_count}x</Badge>
                <Badge tone={Math.abs(selected.instance_share - 1) < 0.001 ? "green" : "amber"}>
                  mapped {(selected.instance_share * 100).toFixed(0)}%
                </Badge>
                {children.length > 0 && <Badge>{children.length} child rows</Badge>}
              </div>
            </div>
          </div>
        </Card>

        <PartitionMappingEditor component={selected} tiers={tiers} selectedScenarioId={selectedScenarioId} selectedTeam={selectedTeam} onSave={onSaveComponentDetail} />

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

function TiersView({ tiers, physicalPartitions, selectedScenarioId, loading, error }: Pick<DataPageProps, "tiers" | "physicalPartitions" | "selectedScenarioId" | "loading" | "error">): JSX.Element {
  if (loading) return <Card title="Loading 3D Stack" subtitle="Fetching tier data..." icon={Layers3}><div className="text-sm text-slate-500">Loading...</div></Card>;
  if (error) return <Card title="API Error" subtitle="FastAPI backend is not reachable yet." icon={AlertTriangle}><div className="text-sm text-red-600">{error}</div></Card>;

  return (
    <div className="space-y-6">
      <Card title="3D Stack Definition" subtitle={`Scenario ${selectedScenarioId}: tier definitions bound to this implementation scenario`} icon={Layers3}>
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
          {tiers.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">No tier definitions for scenario {selectedScenarioId}.</div>}
        </div>
      </Card>

      <Card title="Physical Partitions" subtitle="physical_instance_count is quantity; content_share is only meaningful for partial content split." icon={SplitSquareVertical}>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Partition</th>
                <th className="px-4 py-3">Logical Block</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Physical Count</th>
                <th className="px-4 py-3">Content Share</th>
                <th className="px-4 py-3">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {physicalPartitions.map((partition) => (
                <tr key={partition.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{partition.partition_name}</td>
                  <td className="px-4 py-3 text-slate-600">{partition.logical_component_name}</td>
                  <td className="px-4 py-3 text-slate-600">{partition.resource_category ?? "block"}</td>
                  <td className="px-4 py-3"><Badge tone="blue">{partition.tier_id}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{partition.physical_instance_count}</td>
                  <td className="px-4 py-3 text-slate-600">{(partition.content_share * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3">
                    <Badge tone={partition.partition_type === "partial" ? "amber" : "green"}>
                      {partition.partition_type}
                    </Badge>
                  </td>
                </tr>
              ))}
              {physicalPartitions.length === 0 && (
                <tr>
                  <td className="px-4 py-5 text-sm text-slate-500" colSpan={7}>
                    No physical partitions for scenario {selectedScenarioId}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StackCrossSection({
  tiers,
  interfaces,
  stackType,
  packageEscape,
}: {
  tiers: StackTierDefinition[];
  interfaces: StackInterfaceDefinition[];
  stackType: StackImplementationType;
  packageEscape: PackageEscapeDefinition;
}): JSX.Element {
  const stackLabel = stackType === "Monolithic" ? "Single die" : stackType === "Wafer-to-Wafer" ? "W2W" : "2.5D";
  const bottomBumpSide = getDerivedBottomBumpSide(tiers, interfaces);
  const bottomRequiresTsv = requiresPackageTsv(tiers, interfaces);
  const bottomTier = tiers[tiers.length - 1];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{stackLabel} Section</div>
          <div className="text-xs text-slate-500">{tiers.length} layer{tiers.length > 1 ? "s" : ""}, top to bottom</div>
        </div>
        <Badge tone="blue">{stackLabel}</Badge>
      </div>

      <div className="space-y-1.5">
        {tiers.map((tier, index) => {
          const interfaceBelow = interfaces.find((item) => item.fromTierId === tier.id && item.toTierId === tiers[index + 1]?.id);
          const surfaceSides = getTierSurfaceSides(tiers, interfaces, index);
          const tierHeight = Math.max(40, Math.min(68, tier.thicknessUm * 0.8));

          return (
            <div key={tier.id}>
              <div className={`relative flex items-center justify-between overflow-hidden rounded-md border px-3 ${tier.color}`} style={{ height: `${tierHeight}px` }}>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{tier.name}</div>
                  <div className="truncate text-[11px] opacity-75">{tier.role}</div>
                </div>
                <div className="grid text-right text-[11px]">
                  <span>{tier.process}</span>
                  <span>{tier.thicknessUm} um</span>
                </div>
                <div className="pointer-events-none absolute inset-x-2 top-1.5 flex items-center gap-1">
                  <span className="rounded bg-white/40 px-1 text-[9px] font-bold leading-3 text-slate-900/70">{surfaceSides.top === "Face" ? "F" : "B"}</span>
                  <span className={`h-px flex-1 ${surfaceSides.top === "Face" ? "bg-white/80" : "border-t border-dashed border-slate-900/30"}`} />
                </div>
                <div className="pointer-events-none absolute inset-x-2 bottom-1.5 flex items-center gap-1">
                  <span className={`h-px flex-1 ${surfaceSides.bottom === "Face" ? "bg-white/80" : "border-t border-dashed border-slate-900/30"}`} />
                  <span className="rounded bg-white/40 px-1 text-[9px] font-bold leading-3 text-slate-900/70">{surfaceSides.bottom === "Face" ? "F" : "B"}</span>
                </div>
              </div>

              {interfaceBelow && (
                <div className="relative mx-4 flex min-h-9 items-center">
                  <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-slate-300" />
                  <div className="mx-auto grid min-w-72 grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 shadow-sm">
                    <div className="text-right text-[11px] font-medium text-slate-600">{interfaceBelow.orientation}</div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: interfaceBelow.interconnect.includes("HB") ? 9 : 5 }).map((_, dotIndex) => (
                        <span key={dotIndex} className="h-1 w-1 rounded-full bg-slate-800" />
                      ))}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {interfaceBelow.interconnect.includes("HB") && `HB ${interfaceBelow.hbPitchUm} um`}
                      {interfaceBelow.interconnect.includes("HB") && interfaceBelow.interconnect.includes("TSV") && " / "}
                      {usesUpperTsv(interfaceBelow) && `U-TSV ${interfaceBelow.upperTsvPitchUm} um`}
                      {usesUpperTsv(interfaceBelow) && usesLowerTsv(interfaceBelow) && " / "}
                      {usesLowerTsv(interfaceBelow) && `L-TSV ${interfaceBelow.lowerTsvPitchUm} um`}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="font-medium text-slate-600">Package bump side</span>
          <span className="text-slate-500">bottom die {bottomBumpSide.toLowerCase()} side toward bumps</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          {Array.from({ length: 12 }).map((_, bumpIndex) => (
            <span key={bumpIndex} className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          ))}
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${bottomRequiresTsv ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
            {bottomRequiresTsv ? `${bottomTier?.id ?? "Bottom"}-to-BUMP TSV / ${packageEscape.pitchUm} um` : "direct bump escape"}
          </span>
        </div>
      </div>
    </div>
  );
}

function ImplementationView({ scenarios }: Pick<DataPageProps, "scenarios">): JSX.Element {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("S2");
  const [stackType, setStackType] = useState<StackImplementationType>("Wafer-to-Wafer");
  const [tiers, setTiers] = useState<StackTierDefinition[]>(defaultStackTiers);
  const [interfaces, setInterfaces] = useState<StackInterfaceDefinition[]>(defaultStackInterfaces);
  const [packageEscape, setPackageEscape] = useState<PackageEscapeDefinition>(defaultPackageEscape);
  const [implementationLoading, setImplementationLoading] = useState(false);
  const [implementationSaving, setImplementationSaving] = useState(false);
  const [implementationMessage, setImplementationMessage] = useState<string | null>(null);
  const [implementationError, setImplementationError] = useState<string | null>(null);
  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0];
  const bottomRequiresPackageTsv = requiresPackageTsv(tiers, interfaces);
  const derivedBottomBumpSide = getDerivedBottomBumpSide(tiers, interfaces);
  const bottomTierId = tiers[tiers.length - 1]?.id ?? "BOTTOM";

  const setTierCount = (count: number): void => {
    const boundedCount = Math.max(1, Math.min(5, count));
    const nextTiers = [...tiers];
    while (nextTiers.length < boundedCount) {
      const index = nextTiers.length + 1;
      nextTiers.push({
        id: `T${index}`,
        name: `Tier ${index}`,
        role: index === 1 ? "Compute logic" : "Memory / IO",
        process: index === 1 ? "N3E" : "N5",
        thicknessUm: 55,
        color: stackTierColors[index - 1] ?? stackTierColors[stackTierColors.length - 1],
      });
    }
    const clippedTiers = nextTiers.slice(0, boundedCount);
    setTiers(clippedTiers);
    setInterfaces((current) => defaultInterfacesForTiers(clippedTiers, current));
  };

  useEffect(() => {
    let cancelled = false;
    async function loadImplementation(): Promise<void> {
      if (!selectedScenarioId) return;
      setImplementationLoading(true);
      setImplementationError(null);
      setImplementationMessage(null);
      try {
        const implementation = await getScenarioImplementation(selectedScenarioId);
        if (cancelled) return;
        const loadedTiers = tiersFromImplementation(implementation);
        if (implementation.exists) {
          setStackType(implementationTypeFromApi(implementation.implementation_type));
        }
        if (loadedTiers.length > 0) {
          setTiers(loadedTiers);
          setInterfaces(implementation.interfaces.length > 0 ? interfacesFromImplementation(implementation) : defaultInterfacesForTiers(loadedTiers));
        }
        setPackageEscape({
          pitchUm: implementation.package_escape.pitch_um || defaultPackageEscape.pitchUm,
          keepOutUm: implementation.package_escape.keepout_um || defaultPackageEscape.keepOutUm,
          description: implementation.package_escape.description || defaultPackageEscape.description,
        });
        if (implementation.exists) {
          setImplementationMessage(`Loaded saved implementation v${implementation.version}`);
        }
      } catch (error) {
        if (cancelled) return;
        setImplementationError(error instanceof Error ? error.message : "Failed to load implementation.");
      } finally {
        if (!cancelled) setImplementationLoading(false);
      }
    }
    loadImplementation();
    return () => {
      cancelled = true;
    };
  }, [selectedScenarioId]);

  const applyScenarioDefaults = (scenarioId: string): void => {
    setSelectedScenarioId(scenarioId);
    if (scenarioId === "S1") {
      setStackType("Monolithic");
      setTiers([{ ...defaultStackTiers[0], id: "T1", name: "Single Die", role: "Monolithic SoC", process: "N3E", thicknessUm: 70 }]);
      setInterfaces([]);
      setPackageEscape(defaultPackageEscape);
      return;
    }
    if (scenarioId === "S3") {
      setStackType("2.5D Interposer");
      setTiers([
        { ...defaultStackTiers[0], id: "T1", name: "Compute Die", role: "Advanced logic chiplet", process: "N4P", thicknessUm: 55 },
        { ...defaultStackTiers[1], id: "T2", name: "IO / Memory Die", role: "IO, PHY, and memory companion", process: "N6", thicknessUm: 70 },
      ]);
      setInterfaces(normalizeInterfaces([
        {
          id: "I12",
          fromTierId: "T1",
          toTierId: "T2",
          orientation: "Back-to-Face",
          interconnect: "TSV",
          hbPitchUm: 0,
          upperTsvPitchUm: 40,
          upperTsvKeepOutUm: 20,
          lowerTsvPitchUm: 0,
          lowerTsvKeepOutUm: 0,
          description: "Interposer-level connection placeholder for cost-optimized option.",
        },
      ]));
      setPackageEscape({ pitchUm: 40, keepOutUm: 20, description: "Package escape through interposer-level TSV path." });
      return;
    }
    setStackType("Wafer-to-Wafer");
    setTiers(defaultStackTiers);
    setInterfaces(normalizeInterfaces(defaultStackInterfaces));
    setPackageEscape(defaultPackageEscape);
  };

  const updateStackType = (nextType: StackImplementationType): void => {
    setStackType(nextType);
    if (nextType === "Monolithic") {
      setTierCount(1);
    } else if (tiers.length === 1) {
      setTierCount(2);
    }
  };

  const updateTier = <K extends keyof StackTierDefinition>(id: string, key: K, value: StackTierDefinition[K]): void => {
    setTiers((current) => current.map((tier) => (tier.id === id ? { ...tier, [key]: value } : tier)));
  };

  const updateInterface = <K extends keyof StackInterfaceDefinition>(id: string, key: K, value: StackInterfaceDefinition[K]): void => {
    setInterfaces((current) => normalizeInterfaces(current.map((item) => (item.id === id ? { ...item, [key]: value } : item))));
  };

  const updatePackageEscape = <K extends keyof PackageEscapeDefinition>(key: K, value: PackageEscapeDefinition[K]): void => {
    setPackageEscape((current) => ({ ...current, [key]: value }));
  };

  const saveImplementation = async (): Promise<void> => {
    setImplementationSaving(true);
    setImplementationError(null);
    setImplementationMessage(null);
    try {
      const result = await updateScenarioImplementation(selectedScenarioId, {
        implementation_type: stackType,
        status: "draft",
        tiers: tiers.map((tier) => ({
          id: tier.id,
          name: tier.name,
          process: tier.process,
          role: tier.role,
          thickness_um: tier.thicknessUm,
        })),
        interfaces: interfaces.map((item) => ({
          id: item.id,
          from_tier_id: item.fromTierId,
          to_tier_id: item.toTierId,
          orientation: item.orientation,
          interconnect: item.interconnect,
          hb_pitch_um: item.hbPitchUm,
          upper_tsv_pitch_um: item.upperTsvPitchUm,
          upper_tsv_keepout_um: item.upperTsvKeepOutUm,
          lower_tsv_pitch_um: item.lowerTsvPitchUm,
          lower_tsv_keepout_um: item.lowerTsvKeepOutUm,
          description: item.description,
        })),
        package_escape: {
          bottom_tier_id: bottomTierId,
          requires_tsv: bottomRequiresPackageTsv,
          pitch_um: packageEscape.pitchUm,
          keepout_um: packageEscape.keepOutUm,
          description: packageEscape.description,
        },
      });
      setImplementationMessage(`Saved implementation v${result.implementation.version}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save implementation.";
      try {
        const parsed = JSON.parse(message) as { errors?: string[] };
        setImplementationError(parsed.errors?.join(" ") || message);
      } catch {
        setImplementationError(message);
      }
    } finally {
      setImplementationSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card
        title="Scenario Implementation"
        subtitle="Implementation form for one project scenario"
        icon={Package}
        right={
          <button
            className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={implementationLoading || implementationSaving || !selectedScenarioId}
            onClick={saveImplementation}
            type="button"
          >
            {implementationSaving ? "Saving..." : "Save"}
          </button>
        }
      >
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_170px_110px_1fr]">
          <FieldLabel htmlFor="implementation-scenario" label="Scenario">
            <select
              id="implementation-scenario"
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
              onChange={(event) => applyScenarioDefaults(event.target.value)}
              value={selectedScenario?.id ?? selectedScenarioId}
            >
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.id} - {scenario.name}
                </option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel htmlFor="stack-type" label="Stack Type">
            <select
              id="stack-type"
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
              onChange={(event) => updateStackType(event.target.value as StackImplementationType)}
              value={stackType}
            >
              {stackTypeOptions.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </FieldLabel>
          <StepperInput id="tier-count" label="Layer Count" max={5} min={1} onChange={setTierCount} value={tiers.length} />
          <div className="grid content-end">
            <div className="flex flex-wrap gap-2">
              <Badge tone="blue">{tiers.length} layer{tiers.length > 1 ? "s" : ""}</Badge>
              <Badge tone="green">{interfaces.filter((item) => item.interconnect.includes("HB")).length} HB</Badge>
              <Badge tone="amber">{interfaces.filter((item) => item.interconnect.includes("TSV")).length} TSV</Badge>
              <Badge tone="slate">bump side: {derivedBottomBumpSide}</Badge>
              <Badge tone={bottomRequiresPackageTsv ? "amber" : "green"}>{bottomRequiresPackageTsv ? `${bottomTierId}-to-BUMP TSV` : "direct bump"}</Badge>
            </div>
          </div>
        </div>
        {(implementationLoading || implementationMessage || implementationError) && (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${implementationError ? "border-red-100 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
            {implementationLoading ? "Loading implementation..." : implementationError ?? implementationMessage}
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card title="Layer / Die Definitions" subtitle="Top to bottom physical implementation order" icon={Layers3}>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-14 px-3 py-2">Layer</th>
                  <th className="w-28 px-3 py-2">Name</th>
                  <th className="w-20 px-3 py-2">Process</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="w-24 px-3 py-2">Thick um</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {tiers.map((tier, index) => (
                  <tr key={tier.id}>
                    <td className="px-3 py-2">
                      <div className="text-xs font-semibold text-slate-900">{tier.id}</div>
                      <div className="text-[11px] text-slate-500">L{index + 1}</div>
                    </td>
                    <td className="px-3 py-2">
                      <TextInput ariaLabel={`${tier.id} name`} onChange={(value) => updateTier(tier.id, "name", value)} value={tier.name} />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput ariaLabel={`${tier.id} process`} onChange={(value) => updateTier(tier.id, "process", value)} value={tier.process} />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput ariaLabel={`${tier.id} role`} onChange={(value) => updateTier(tier.id, "role", value)} value={tier.role} />
                    </td>
                    <td className="px-3 py-2">
                      <UnitNumberInput ariaLabel={`${tier.id} thickness`} onChange={(value) => updateTier(tier.id, "thicknessUm", value)} step="1" unit="um" value={tier.thicknessUm} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Cross Section" subtitle="Live implementation preview" icon={SplitSquareVertical}>
          <StackCrossSection tiers={tiers} interfaces={interfaces} stackType={stackType} packageEscape={packageEscape} />
        </Card>
      </div>

      <Card title="Inter-Layer Interfaces" subtitle="Direction, bonding type, TSV usage, and pitch" icon={Gauge}>
        <div className={`mb-3 rounded-xl border px-3 py-2 text-sm ${bottomRequiresPackageTsv ? "border-amber-100 bg-amber-50 text-amber-800" : "border-emerald-100 bg-emerald-50 text-emerald-800"}`}>
          Bottom bump side is derived from the last die-to-die orientation. {bottomRequiresPackageTsv ? `${bottomTierId}-to-BUMP TSV is required because the bottom die back side faces bumps.` : `Bottom die face side faces bumps, so direct bump escape is allowed.`}
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          {interfaces.length === 0 ? (
            <div className="bg-white px-4 py-5 text-sm text-slate-500">Single-layer implementation: no inter-layer interface is required for this scenario.</div>
          ) : (
            <table className="w-[1120px] table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-24 px-3 py-2">Interface</th>
                  <th className="w-40 px-3 py-2">Direction</th>
                  <th className="w-32 px-3 py-2">Type</th>
                  <th className="w-24 px-3 py-2">HB Pitch</th>
                  <th className="w-24 px-3 py-2">Upper TSV</th>
                  <th className="w-24 px-3 py-2">Upper KO</th>
                  <th className="w-24 px-3 py-2">Lower TSV</th>
                  <th className="w-24 px-3 py-2">Lower KO</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {interfaces.map((item, index) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-semibold text-slate-900">
                      {item.fromTierId}-{item.toTierId}
                    </td>
                    <td className="px-3 py-2">
                      <SegmentedControl
                        ariaLabel={`${item.fromTierId} to ${item.toTierId} direction`}
                        onChange={(value) => updateInterface(item.id, "orientation", value)}
                        options={getAllowedOrientationOptions(index, interfaces).map((orientation) => ({
                          label: orientationShortLabels[orientation],
                          title: orientation,
                          value: orientation,
                        }))}
                        value={item.orientation}
                      />
                      {index > 0 && <div className="mt-1 text-[10px] text-slate-400">upper side: {getUpperInterfaceSide(item.orientation)}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <SegmentedControl
                        ariaLabel={`${item.fromTierId} to ${item.toTierId} interconnect`}
                        onChange={(value) => updateInterface(item.id, "interconnect", value)}
                        options={interconnectOptions.map((interconnect) => ({ label: interconnect.replace(" + ", "+"), value: interconnect }))}
                        value={item.interconnect}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <UnitNumberInput
                        ariaLabel={`${item.fromTierId} to ${item.toTierId} HB pitch`}
                        disabled={!item.interconnect.includes("HB")}
                        onChange={(value) => updateInterface(item.id, "hbPitchUm", value)}
                        step="0.1"
                        unit="um"
                        value={item.hbPitchUm}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <UnitNumberInput
                        ariaLabel={`${item.fromTierId} to ${item.toTierId} upper TSV pitch`}
                        disabled={!usesUpperTsv(item)}
                        onChange={(value) => updateInterface(item.id, "upperTsvPitchUm", value)}
                        step="0.1"
                        unit="um"
                        value={item.upperTsvPitchUm}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <UnitNumberInput
                        ariaLabel={`${item.fromTierId} to ${item.toTierId} upper TSV keep-out`}
                        disabled={!usesUpperTsv(item)}
                        onChange={(value) => updateInterface(item.id, "upperTsvKeepOutUm", value)}
                        step="0.5"
                        unit="um"
                        value={item.upperTsvKeepOutUm}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <UnitNumberInput
                        ariaLabel={`${item.fromTierId} to ${item.toTierId} lower TSV pitch`}
                        disabled={!usesLowerTsv(item)}
                        onChange={(value) => updateInterface(item.id, "lowerTsvPitchUm", value)}
                        step="0.1"
                        unit="um"
                        value={item.lowerTsvPitchUm}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <UnitNumberInput
                        ariaLabel={`${item.fromTierId} to ${item.toTierId} lower TSV keep-out`}
                        disabled={!usesLowerTsv(item)}
                        onChange={(value) => updateInterface(item.id, "lowerTsvKeepOutUm", value)}
                        step="0.5"
                        unit="um"
                        value={item.lowerTsvKeepOutUm}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput ariaLabel={`${item.fromTierId} to ${item.toTierId} note`} onChange={(value) => updateInterface(item.id, "description", value)} value={item.description} />
                    </td>
                  </tr>
                ))}
                {bottomRequiresPackageTsv && (
                  <tr className="bg-amber-50">
                    <td className="px-3 py-2 font-semibold text-slate-900">{bottomTierId}-BUMP</td>
                    <td className="px-3 py-2 text-sm text-slate-600">Back-to-Bump</td>
                    <td className="px-3 py-2">
                      <Badge tone="amber">TSV</Badge>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-400">-</td>
                    <td className="px-3 py-2 text-sm text-slate-400">-</td>
                    <td className="px-3 py-2 text-sm text-slate-400">-</td>
                    <td className="px-3 py-2">
                      <UnitNumberInput
                        ariaLabel={`${bottomTierId} to bump TSV pitch`}
                        onChange={(value) => updatePackageEscape("pitchUm", value)}
                        step="0.1"
                        tone="amber"
                        unit="um"
                        value={packageEscape.pitchUm}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <UnitNumberInput
                        ariaLabel={`${bottomTierId} to bump keep-out`}
                        onChange={(value) => updatePackageEscape("keepOutUm", value)}
                        step="0.5"
                        tone="amber"
                        unit="um"
                        value={packageEscape.keepOutUm}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        ariaLabel={`${bottomTierId} to bump note`}
                        onChange={(value) => updatePackageEscape("description", value)}
                        value={packageEscape.description}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
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
  selectedScenarioId,
  selectedTeam,
  onImportWorkbook,
}: Pick<DataPageProps, "importing" | "importResult" | "importError" | "selectedScenarioId" | "selectedTeam" | "onImportWorkbook">): JSX.Element {
  const scopedTemplateUrl = importTemplateUrl(selectedTeam, selectedScenarioId);
  return (
    <div className="space-y-6">
      <Card title="Excel Import Workbench" subtitle="Phase-1 imports use a controlled workbook template mapped to the SQLite schema." icon={Upload}>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <Upload className="mx-auto text-slate-400" size={34} />
          <div className="mt-4 text-base font-semibold text-slate-900">Upload SoC Import Workbook</div>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Download the {selectedScenarioId} workbook for {selectedTeam}, edit logical_components / physical_partitions / metrics, then upload the .xlsx file. The backend validates references and team scope before upserting into SQLite.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <a className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" href={scopedTemplateUrl}>
              Download {selectedTeam} / {selectedScenarioId} Template
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
              No open quality issues for the selected demo scenario. Equivalent instance coverage and numeric metrics are closed.
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
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    const savedTheme = window.localStorage.getItem("soc-theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [blocks, setBlocks] = useState<BlockNode[]>([]);
  const [tree, setTree] = useState<TreeBlock[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [tiers, setTiers] = useState<TierInfo[]>([]);
  const [physicalPartitions, setPhysicalPartitions] = useState<PhysicalPartition[]>([]);
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[]>([]);
  const [teams, setTeams] = useState<string[]>(["Architecture Team"]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("S2");
  const [selectedTeam, setSelectedTeam] = useState<string>("Architecture Team");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId);

  useEffect(() => {
    window.localStorage.setItem("soc-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (scenarios.length > 0 && !scenarios.some((scenario) => scenario.id === selectedScenarioId)) {
      setSelectedScenarioId(scenarios[0].id);
    }
  }, [scenarios, selectedScenarioId]);

  async function refreshApiData(team = selectedTeam, scenarioId = selectedScenarioId): Promise<void> {
    const [dashboardData, componentData, treeData, scenarioData, tierData, physicalPartitionData, qualityIssueData, teamData] = await Promise.all([
      getDashboard(scenarioId),
      getComponents(team, scenarioId),
      getComponentTree(team, scenarioId),
      getScenarios(),
      getTiers(scenarioId),
      getPhysicalPartitions(team, scenarioId),
      getQualityIssues(team, scenarioId),
      getResponsibilityTeams(scenarioId),
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
      const result = await uploadImportWorkbook(file, selectedTeam, selectedScenarioId);
      setImportResult(result);
      await refreshApiData(selectedTeam, selectedScenarioId);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Unknown import error");
    } finally {
      setImporting(false);
    }
  }

  async function handleSaveComponentDetail(component: BlockNode, logicalInstanceCount: number, partitions: PhysicalPartition[]): Promise<void> {
    await updateComponentDetail(component.id, {
      scenario_id: selectedScenarioId,
      team: selectedTeam,
      logical_instance_count: logicalInstanceCount,
      partitions: partitions.map((partition) => ({
        id: partition.id,
        tier_id: partition.tier_id,
        partition_name: partition.partition_name,
        partition_type: partition.partition_type,
        resource_category: partition.resource_category ?? "block",
        physical_instance_count: partition.physical_instance_count,
        content_share: partition.partition_type === "full" ? 1 : partition.content_share,
        description: partition.description,
      })),
    });
    await refreshApiData(selectedTeam, selectedScenarioId);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadApiData(): Promise<void> {
      try {
        setLoading(true);
        const [dashboardData, componentData, treeData, scenarioData, tierData, physicalPartitionData, qualityIssueData, teamData] = await Promise.all([
          getDashboard(selectedScenarioId),
          getComponents(selectedTeam, selectedScenarioId),
          getComponentTree(selectedTeam, selectedScenarioId),
          getScenarios(),
          getTiers(selectedScenarioId),
          getPhysicalPartitions(selectedTeam, selectedScenarioId),
          getQualityIssues(selectedTeam, selectedScenarioId),
          getResponsibilityTeams(selectedScenarioId),
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
  }, [selectedTeam, selectedScenarioId]);

  return (
    <div className={`min-h-screen bg-slate-100 text-slate-900 theme-${theme}`}>
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
                <button
                  aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                  onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                  type="button"
                >
                  {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                  {theme === "dark" ? "白天" : "夜晚"}
                </button>
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
                <select
                  aria-label="Scenario scope"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:bg-white focus:border-slate-400"
                  onChange={(event) => {
                    setSelectedScenarioId(event.target.value);
                    setImportResult(null);
                    setImportError(null);
                  }}
                  title={selectedScenario?.name ?? selectedScenarioId}
                  value={selectedScenarioId}
                >
                  {scenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.id} - {scenario.name}
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
          {active === "hierarchy" && (
            <HierarchyView
              blocks={blocks}
              tree={tree}
              tiers={tiers}
              selectedScenarioId={selectedScenarioId}
              selectedTeam={selectedTeam}
              loading={loading}
              error={error}
              onSaveComponentDetail={handleSaveComponentDetail}
            />
          )}
          {active === "tiers" && <TiersView tiers={tiers} physicalPartitions={physicalPartitions} selectedScenarioId={selectedScenarioId} loading={loading} error={error} />}
          {active === "implementation" && <ImplementationView scenarios={scenarios} />}
          {active === "compare" && <CompareView scenarios={scenarios} loading={loading} error={error} />}
          {active === "imports" && (
            <ImportsView
              importing={importing}
              importResult={importResult}
              importError={importError}
              selectedScenarioId={selectedScenarioId}
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
