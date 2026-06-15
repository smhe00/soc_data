import React, { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Database,
  Layers3,
  GitBranch,
  Upload,
  AlertTriangle,
  Package,
  Moon,
  Plus,
  Sun,
  Zap,
} from "lucide-react";

import { createLogicalComponent, deleteLogicalComponent, getComponents, getComponentTree, getPhysicalPartitions, updateComponentDetail, updateLogicalComponent, type LogicalComponentInput } from "./api/components";
import { uploadImportWorkbook, type ImportResult } from "./api/imports";
import { getQualityIssues, type QualityIssue } from "./api/quality";
import { getResponsibilityTeams } from "./api/responsibilities";
import { getImplOptions } from "./api/impl_options";
import { getTiers } from "./api/tiers";
import { createDatabase, getDatabases, selectDatabase, type DatabaseInfo } from "./api/databases";

import type { BlockNode, TreeBlock, PhysicalPartition } from "./types/component";
import type { ImplOption } from "./types/impl_option";
import type { TierInfo } from "./types/tier";

import { HierarchyView } from "./components/HierarchyView";
import { TiersView } from "./components/TiersView";
import { ImplementationView } from "./components/ImplementationView";
import { ImportsView } from "./components/ImportsView";
import { QualityView } from "./components/QualityView";
import { ApplicationPowerView } from "./components/ApplicationPowerView";

type TabId = "hierarchy" | "tiers" | "implementation" | "imports" | "quality" | "power";
type ThemeMode = "light" | "dark";

interface TabItem {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

const tabs: TabItem[] = [
  { id: "hierarchy", label: "Block Hierarchy", icon: GitBranch },
  { id: "tiers", label: "3D Tier", icon: Layers3 },
  { id: "implementation", label: "Implementation", icon: Package },
  { id: "imports", label: "Import", icon: Upload },
  { id: "quality", label: "Quality", icon: AlertTriangle },
  { id: "power", label: "Application Power", icon: Zap },
];

export default function Soc3dicPhase1Prototype(): JSX.Element {
  const [active, setActive] = useState<TabId>("hierarchy");
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    const savedTheme = window.localStorage.getItem("soc-theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [blocks, setBlocks] = useState<BlockNode[]>([]);
  const [tree, setTree] = useState<TreeBlock[]>([]);
  const [implOptions, setImplOptions] = useState<ImplOption[]>([]);
  const [tiers, setTiers] = useState<TierInfo[]>([]);
  const [physicalPartitions, setPhysicalPartitions] = useState<PhysicalPartition[]>([]);
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[]>([]);
  const [teams, setTeams] = useState<string[]>(["Architecture Team"]);
  const [selectedImplOptionId, setSelectedImplOptionId] = useState<string>("S2");
  const [selectedTeam, setSelectedTeam] = useState<string>("Architecture Team");
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [activeDatabaseId, setActiveDatabaseId] = useState<string>("");

  // Keep track of base lookup data (implOptions list, teams list)
  const [loadedBase, setLoadedBase] = useState<boolean>(false);

  // Keep track of which specific data categories have been successfully loaded
  // for the current selectedTeam and selectedImplOptionId
  const [loadedCategories, setLoadedCategories] = useState<{
    hierarchy: boolean;
    tiers: boolean;
    quality: boolean;
  }>({
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

  function resetLoadedState(): void {
    setLoadedBase(false);
    setLoadedCategories({
      hierarchy: false,
      tiers: false,
      quality: false,
    });
    setBlocks([]);
    setTree([]);
    setImplOptions([]);
    setTiers([]);
    setPhysicalPartitions([]);
    setQualityIssues([]);
    setTeams(["Architecture Team"]);
    setSelectedImplOptionId("");
    setImportResult(null);
    setImportError(null);
  }

  useEffect(() => {
    window.localStorage.setItem("soc-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (implOptions.length > 0 && !implOptions.some((impl_option) => impl_option.id === selectedImplOptionId)) {
      setSelectedImplOptionId(implOptions[0].id);
    }
  }, [implOptions, selectedImplOptionId]);

  useEffect(() => {
    async function loadDatabases(): Promise<void> {
      try {
        const catalog = await getDatabases();
        setDatabases(catalog.databases);
        setActiveDatabaseId(catalog.active_id);
      } catch {
        // Keep the main API error surface focused on tab data.
      }
    }
    void loadDatabases();
  }, []);

  // Whenever the impl_option or team changes, invalidate the cache for all categories,
  // so they will reload fresh when that tab is visited.
  useEffect(() => {
    setLoadedCategories({
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
      let effectiveImplOptionId = implOptionId;
      if (!loadedBase || forceReload) {
        const implOptionsData = await getImplOptions();
        effectiveImplOptionId = implOptionsData.some((row) => row.id === implOptionId)
          ? implOptionId
          : (implOptionsData[0]?.id ?? "");
        const teamsData = effectiveImplOptionId ? await getResponsibilityTeams(effectiveImplOptionId) : ["Architecture Team"];
        setImplOptions(implOptionsData);
        setTeams(teamsData);
        setSelectedImplOptionId(effectiveImplOptionId);
        setLoadedBase(true);
      }

      if (!effectiveImplOptionId) {
        setBlocks([]);
        setTree([]);
        setTiers([]);
        setPhysicalPartitions([]);
        setQualityIssues([]);
        setLoading(false);
        return;
      }

      // 2. Load tab-specific data
      if (activeTab === "hierarchy") {
        if (!loadedCategories.hierarchy || forceReload) {
          const [componentData, treeData, tierData] = await Promise.all([
            getComponents(team, effectiveImplOptionId),
            getComponentTree(team, effectiveImplOptionId),
            getTiers(effectiveImplOptionId),
          ]);
          setBlocks(componentData);
          setTree(treeData);
          setTiers(tierData);
          setLoadedCategories(prev => ({ ...prev, hierarchy: true }));
        }
      } else if (activeTab === "tiers") {
        if (!loadedCategories.tiers || forceReload) {
          const [tierData, partitionData] = await Promise.all([
            getTiers(effectiveImplOptionId),
            getPhysicalPartitions(team, effectiveImplOptionId),
          ]);
          setTiers(tierData);
          setPhysicalPartitions(partitionData);
          setLoadedCategories(prev => ({ ...prev, tiers: true }));
        }
      } else if (activeTab === "quality") {
        if (!loadedCategories.quality || forceReload) {
          const qualityIssueData = await getQualityIssues(team, effectiveImplOptionId);
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

  async function handleSelectDatabase(databaseId: string): Promise<void> {
    try {
      setLoading(true);
      setError(null);
      const catalog = await selectDatabase(databaseId);
      setDatabases(catalog.databases);
      setActiveDatabaseId(catalog.active_id);
      resetLoadedState();
      await loadActiveTabData(active, "Architecture Team", "", true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to select database");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateDatabase(): Promise<void> {
    const name = window.prompt("New SQLite database name");
    if (!name?.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const catalog = await createDatabase(name.trim());
      setDatabases(catalog.databases);
      setActiveDatabaseId(catalog.active_id);
      resetLoadedState();
      await loadActiveTabData(active, "Architecture Team", "", true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create database");
    } finally {
      setLoading(false);
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
      hierarchy: false,
      tiers: false,
      quality: false,
    });
    await loadActiveTabData(active, selectedTeam, selectedImplOptionId, true);
  }

  async function refreshHierarchy(): Promise<void> {
    setLoadedCategories((current) => ({ ...current, hierarchy: false, tiers: false, quality: false }));
    await loadActiveTabData("hierarchy", selectedTeam, selectedImplOptionId, true);
  }

  async function handleCreateLogicalComponent(payload: LogicalComponentInput): Promise<void> {
    await createLogicalComponent(payload);
    await refreshHierarchy();
  }

  async function handleUpdateLogicalComponent(componentId: string, payload: LogicalComponentInput): Promise<void> {
    await updateLogicalComponent(componentId, payload);
    await refreshHierarchy();
  }

  async function handleDeleteLogicalComponent(componentId: string): Promise<void> {
    await deleteLogicalComponent(componentId, { impl_option_id: selectedImplOptionId, team: selectedTeam, cascade: true });
    await refreshHierarchy();
  }

  return (
    <div className={`min-h-screen bg-slate-100 text-slate-900 theme-${theme}`}>
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-5 lg:block">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-indigo-600 p-3 text-white">
              <Layers3 size={24} />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">SoC Cross-Die DB</div>
              <div className="text-xs text-slate-500">Architecture Data</div>
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
                    selected ? "bg-indigo-50 text-indigo-700 border border-indigo-100/30 font-semibold shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                  type="button"
                >
                  <Icon size={18} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 p-4 md:p-8">
          <header className="mb-6 border-b border-slate-200 bg-white/70 px-1 pb-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Database size={16} />
                  SoC Cross-Die Database
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">{activeTab.label}</h1>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label="SQLite database"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:bg-white focus:border-slate-400"
                  onChange={(event) => void handleSelectDatabase(event.target.value)}
                  title="SQLite database"
                  value={activeDatabaseId}
                >
                  {databases.map((database) => (
                    <option key={database.id} value={database.id}>
                      {database.is_demo ? "Demo" : "DB"} - {database.name} ({database.project_count ?? 0})
                    </option>
                  ))}
                </select>
                <button
                  aria-label="Create SQLite database"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                  onClick={() => void handleCreateDatabase()}
                  title="Create empty SQLite database"
                  type="button"
                >
                  <Plus size={14} />
                  New DB
                </button>
                <button
                  aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                  onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                  type="button"
                >
                  {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                  {theme === "dark" ? "Light" : "Dark"}
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
              </div>
            </div>

            <div className="mt-5 flex gap-2 overflow-x-auto lg:hidden">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActive(tab.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${active === tab.id ? "bg-indigo-50 text-indigo-700 border border-indigo-100/30 font-semibold shadow-sm" : "bg-slate-100 text-slate-700"}`}
                    type="button"
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </header>

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
              onCreateLogicalComponent={handleCreateLogicalComponent}
              onUpdateLogicalComponent={handleUpdateLogicalComponent}
              onDeleteLogicalComponent={handleDeleteLogicalComponent}
            />
          )}
          {active === "tiers" && <TiersView tiers={tiers} physicalPartitions={physicalPartitions} selectedImplOptionId={selectedImplOptionId} loading={loading} error={error} />}
          {active === "implementation" && <ImplementationView implOptions={implOptions} />}
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
          {active === "power" && <ApplicationPowerView implOptions={implOptions} />}
        </main>
      </div>
    </div>
  );
}
