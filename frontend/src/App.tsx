import React, { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Database,
  Layers3,
  GitBranch,
  BarChart3,
  Upload,
  AlertTriangle,
  SplitSquareVertical,
  Package,
  Moon,
  Sun,
} from "lucide-react";

import { getComponents, getComponentTree, getPhysicalPartitions, updateComponentDetail } from "./api/components";
import { uploadImportWorkbook, type ImportResult } from "./api/imports";
import { getDashboard } from "./api/metrics";
import { getQualityIssues, type QualityIssue } from "./api/quality";
import { getResponsibilityTeams } from "./api/responsibilities";
import { getImplOptions } from "./api/impl_options";
import { getTiers } from "./api/tiers";

import type { DashboardData } from "./types/metric";
import type { BlockNode, TreeBlock, PhysicalPartition } from "./types/component";
import type { ImplOption } from "./types/impl_option";
import type { TierInfo } from "./types/tier";

import { Badge } from "./components/ui";

import { Dashboard } from "./components/Dashboard";
import { HierarchyView } from "./components/HierarchyView";
import { TiersView } from "./components/TiersView";
import { ImplementationView } from "./components/ImplementationView";
import { CompareView } from "./components/CompareView";
import { ImportsView } from "./components/ImportsView";
import { QualityView } from "./components/QualityView";
import { SchemaView } from "./components/SchemaView";

type TabId = "dashboard" | "hierarchy" | "tiers" | "implementation" | "compare" | "imports" | "quality" | "schema";
type ThemeMode = "light" | "dark";

interface TabItem {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

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
  const [implOptions, setImplOptions] = useState<ImplOption[]>([]);
  const [tiers, setTiers] = useState<TierInfo[]>([]);
  const [physicalPartitions, setPhysicalPartitions] = useState<PhysicalPartition[]>([]);
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[]>([]);
  const [teams, setTeams] = useState<string[]>(["Architecture Team"]);
  const [selectedImplOptionId, setSelectedImplOptionId] = useState<string>("S2");
  const [selectedTeam, setSelectedTeam] = useState<string>("Architecture Team");

  // Keep track of base lookup data (implOptions list, teams list)
  const [loadedBase, setLoadedBase] = useState<boolean>(false);

  // Keep track of which specific data categories have been successfully loaded
  // for the current selectedTeam and selectedImplOptionId
  const [loadedCategories, setLoadedCategories] = useState<{
    dashboard: boolean;
    hierarchy: boolean;
    tiers: boolean;
    quality: boolean;
  }>({
    dashboard: false,
    hierarchy: false,
    tiers: false,
    quality: false,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const selectedImplOption = implOptions.find((impl_option) => impl_option.id === selectedImplOptionId);

  useEffect(() => {
    window.localStorage.setItem("soc-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (implOptions.length > 0 && !implOptions.some((impl_option) => impl_option.id === selectedImplOptionId)) {
      setSelectedImplOptionId(implOptions[0].id);
    }
  }, [implOptions, selectedImplOptionId]);

  // Whenever the impl_option or team changes, invalidate the cache for all categories,
  // so they will reload fresh when that tab is visited.
  useEffect(() => {
    setLoadedCategories({
      dashboard: false,
      hierarchy: false,
      tiers: false,
      quality: false,
    });
  }, [selectedTeam, selectedImplOptionId]);

  // Load the active tab data
  const loadActiveTabData = async (
    activeTab: TabId,
    team: string,
    implOptionId: string,
    forceReload: boolean = false
  ) => {
    try {
      setLoading(true);
      setError(null);

      // 1. Ensure base lookup data is loaded
      if (!loadedBase || forceReload) {
        const [implOptionsData, teamsData] = await Promise.all([
          getImplOptions(),
          getResponsibilityTeams(implOptionId),
        ]);
        setImplOptions(implOptionsData);
        setTeams(teamsData);
        setLoadedBase(true);
      }

      // 2. Load tab-specific data
      if (activeTab === "dashboard") {
        if (!loadedCategories.dashboard || forceReload) {
          const dashboardData = await getDashboard(implOptionId);
          setDashboard(dashboardData);
          setLoadedCategories(prev => ({ ...prev, dashboard: true }));
        }
      } else if (activeTab === "hierarchy") {
        if (!loadedCategories.hierarchy || forceReload) {
          const [componentData, treeData, tierData] = await Promise.all([
            getComponents(team, implOptionId),
            getComponentTree(team, implOptionId),
            getTiers(implOptionId),
          ]);
          setBlocks(componentData);
          setTree(treeData);
          setTiers(tierData);
          setLoadedCategories(prev => ({ ...prev, hierarchy: true }));
        }
      } else if (activeTab === "tiers") {
        if (!loadedCategories.tiers || forceReload) {
          const [tierData, partitionData] = await Promise.all([
            getTiers(implOptionId),
            getPhysicalPartitions(team, implOptionId),
          ]);
          setTiers(tierData);
          setPhysicalPartitions(partitionData);
          setLoadedCategories(prev => ({ ...prev, tiers: true }));
        }
      } else if (activeTab === "quality") {
        if (!loadedCategories.quality || forceReload) {
          const qualityIssueData = await getQualityIssues(team, implOptionId);
          setQualityIssues(qualityIssueData);
          setLoadedCategories(prev => ({ ...prev, quality: true }));
        }
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown API error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadActiveTabData(active, selectedTeam, selectedImplOptionId);
  }, [active, selectedTeam, selectedImplOptionId]);

  async function handleImportWorkbook(file: File): Promise<void> {
    try {
      setImporting(true);
      setImportError(null);
      const result = await uploadImportWorkbook(file, selectedTeam, selectedImplOptionId);
      setImportResult(result);
      
      // Invalidate cache and reload current active tab
      setLoadedCategories({
        dashboard: false,
        hierarchy: false,
        tiers: false,
        quality: false,
      });
      await loadActiveTabData(active, selectedTeam, selectedImplOptionId, true);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Unknown import error");
    } finally {
      setImporting(false);
    }
  }

  async function handleSaveComponentDetail(
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
  ): Promise<void> {
    await updateComponentDetail(component.id, {
      impl_option_id: selectedImplOptionId,
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
      ...logicalMetrics,
    });

    // Invalidate cache and reload current active tab
    setLoadedCategories({
      dashboard: false,
      hierarchy: false,
      tiers: false,
      quality: false,
    });
    await loadActiveTabData(active, selectedTeam, selectedImplOptionId, true);
  }

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
                    selected ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-955"
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
                  aria-label="ImplOption scope"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:bg-white focus:border-slate-400"
                  onChange={(event) => {
                    setSelectedImplOptionId(event.target.value);
                    setImportResult(null);
                    setImportError(null);
                  }}
                  title={selectedImplOption?.name ?? selectedImplOptionId}
                  value={selectedImplOptionId}
                >
                  {implOptions.map((impl_option) => (
                    <option key={impl_option.id} value={impl_option.id}>
                      {impl_option.id} - {impl_option.name}
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
              selectedImplOptionId={selectedImplOptionId}
              selectedTeam={selectedTeam}
              loading={loading}
              error={error}
              onSaveComponentDetail={handleSaveComponentDetail}
            />
          )}
          {active === "tiers" && <TiersView tiers={tiers} physicalPartitions={physicalPartitions} selectedImplOptionId={selectedImplOptionId} loading={loading} error={error} />}
          {active === "implementation" && <ImplementationView implOptions={implOptions} />}
          {active === "compare" && <CompareView implOptions={implOptions} loading={loading} error={error} />}
          {active === "imports" && (
            <ImportsView
              importing={importing}
              importResult={importResult}
              importError={importError}
              selectedImplOptionId={selectedImplOptionId}
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
