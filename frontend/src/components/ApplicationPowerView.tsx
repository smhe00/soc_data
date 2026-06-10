import React, { useEffect, useState } from "react";
import { Zap, Cpu, Sliders, Database, Activity, FileText, AlertTriangle, RefreshCw } from "lucide-react";
import { Card, Badge, FieldLabel } from "./ui";
import type { ImplOption } from "../types/impl_option";
import {
  getApplicationScenarios,
  getPhysicalMappings,
  getOperatingPointSets,
  getPowerSummary,
} from "../api/power";
import type {
  ApplicationScenario,
  PhysicalMapping,
  OperatingPointSet,
  PowerSummary,
  PowerObservation,
} from "../types/power";

export interface ApplicationPowerViewProps {
  implOptions: ImplOption[];
}

export function ApplicationPowerView({ implOptions }: ApplicationPowerViewProps): JSX.Element {
  // Core filters state
  const [selectedImplOptionId, setSelectedImplOptionId] = useState<string>("S2");
  const [physicalMappings, setPhysicalMappings] = useState<PhysicalMapping[]>([]);
  const [selectedPhysicalMappingId, setSelectedPhysicalMappingId] = useState<string>("");
  const [applicationScenarios, setApplicationScenarios] = useState<ApplicationScenario[]>([]);
  const [selectedApplicationScenarioId, setSelectedApplicationScenarioId] = useState<string>("");
  const [operatingPointSets, setOperatingPointSets] = useState<OperatingPointSet[]>([]);
  const [selectedOperatingPointSetId, setSelectedOperatingPointSetId] = useState<string>("");

  // Advanced filters state
  const [statisticType, setStatisticType] = useState<string>("average");
  const [powerType, setPowerType] = useState<string>("total");
  const [timeWindowName, setTimeWindowName] = useState<string>("");
  const [developmentStage, setDevelopmentStage] = useState<string>("");

  // Power summary and loading states
  const [summary, setSummary] = useState<PowerSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch static lists on mount
  useEffect(() => {
    async function loadInitialLists() {
      try {
        const [scenariosData, opSetsData] = await Promise.all([
          getApplicationScenarios(),
          getOperatingPointSets(),
        ]);
        setApplicationScenarios(scenariosData);
        if (scenariosData.length > 0) {
          const hasCamera = scenariosData.some((s) => s.id === "AS_CAMERA_4K60");
          setSelectedApplicationScenarioId(hasCamera ? "AS_CAMERA_4K60" : scenariosData[0].id);
        }

        setOperatingPointSets(opSetsData);
        if (opSetsData.length > 0) {
          const hasCameraOP = opSetsData.some((op) => op.id === "OP_CAMERA_PERF");
          setSelectedOperatingPointSetId(hasCameraOP ? "OP_CAMERA_PERF" : opSetsData[0].id);
        }
      } catch (err) {
        console.error("Failed to load initial power lists:", err);
        setError("获取应用场景或工作点集合数据失败，请确保后端服务已启动。");
      }
    }
    loadInitialLists();
  }, []);

  // 2. Fetch physical mappings whenever implOptionId changes
  useEffect(() => {
    async function loadMappings() {
      if (!selectedImplOptionId) return;
      try {
        const mappingsData = await getPhysicalMappings(selectedImplOptionId);
        setPhysicalMappings(mappingsData);
        if (mappingsData.length > 0) {
          const has3DIC = mappingsData.some((m) => m.id === "PM_3DIC_A");
          const has2D = mappingsData.some((m) => m.id === "PM_2D_BASE");
          if (selectedImplOptionId === "S2" && has3DIC) {
            setSelectedPhysicalMappingId("PM_3DIC_A");
          } else if (selectedImplOptionId === "S1" && has2D) {
            setSelectedPhysicalMappingId("PM_2D_BASE");
          } else {
            setSelectedPhysicalMappingId(mappingsData[0].id);
          }
        } else {
          setSelectedPhysicalMappingId("");
        }
      } catch (err) {
        console.error("Failed to load physical mappings:", err);
      }
    }
    loadMappings();
  }, [selectedImplOptionId]);

  // 3. Fetch summary when filters change
  useEffect(() => {
    async function loadSummary() {
      if (
        !selectedImplOptionId ||
        !selectedPhysicalMappingId ||
        !selectedApplicationScenarioId ||
        !selectedOperatingPointSetId
      ) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const summaryData = await getPowerSummary({
          impl_option_id: selectedImplOptionId,
          physical_mapping_id: selectedPhysicalMappingId,
          application_scenario_id: selectedApplicationScenarioId,
          operating_point_set_id: selectedOperatingPointSetId,
          statistic_type: statisticType || undefined,
          power_type: powerType || undefined,
          time_window_name: timeWindowName || undefined,
          development_stage: developmentStage || undefined,
        });
        setSummary(summaryData);
      } catch (err) {
        console.error("Failed to fetch power summary:", err);
        setError("获取应用功耗分析汇总失败，请检查筛选条件或后端日志。");
        setSummary(null);
      } finally {
        setLoading(false);
      }
    }
    loadSummary();
  }, [
    selectedImplOptionId,
    selectedPhysicalMappingId,
    selectedApplicationScenarioId,
    selectedOperatingPointSetId,
    statisticType,
    powerType,
    timeWindowName,
    developmentStage,
  ]);

  const handleImplOptionChange = (id: string) => {
    setSelectedImplOptionId(id);
  };

  const displayW = (val: number | null | undefined) => {
    if (val === null || val === undefined) return "N/A";
    return `${val.toFixed(2)} W`;
  };

  const getStageLabel = (stage: string) => {
    const mapping: Record<string, string> = {
      architecture_estimate: "架构估算 (architecture_estimate)",
      rtl_power: "RTL前仿真 (rtl_power)",
      gate_level_power: "门级网表功耗 (gate_level_power)",
      post_pnr_power: "Layout后仿真 (post_pnr_power)",
      thermal_aware_power: "热分析校正 (thermal_aware_power)",
      silicon_measurement: "硅后实测 (silicon_measurement)",
    };
    return mapping[stage] || stage;
  };

  const getScopeTypeBadge = (type: string) => {
    const mapping: Record<string, { label: string; color: string }> = {
      soc: { label: "SoC 整体", color: "bg-blue-50 text-blue-700 border-blue-100" },
      component: { label: "逻辑模块", color: "bg-violet-50 text-violet-750 border-violet-100" },
      tier: { label: "叠层 Tier", color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
      power_rail: { label: "电源轨", color: "bg-amber-50 text-amber-700 border-amber-100" },
      shared_resource: { label: "共享资源", color: "bg-cyan-50 text-cyan-700 border-cyan-100" },
      interaction: { label: "交互开销", color: "bg-red-50 text-red-700 border-red-100" },
      residual: { label: "未解释剩余", color: "bg-slate-100 text-slate-700 border-slate-200" },
    };
    const spec = mapping[type] || { label: type, color: "bg-slate-100 text-slate-700 border-slate-200" };
    return (
      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${spec.color}`}>
        {spec.label}
      </span>
    );
  };

  const getConfidenceBadge = (confidence: string | null) => {
    if (!confidence) return null;
    const mapping: Record<string, "slate" | "blue" | "green" | "amber" | "violet" | "red"> = {
      draft: "blue",
      review: "amber",
      approved: "green",
      measured: "violet",
    };
    return <Badge tone={mapping[confidence] || "slate"}>{confidence.toUpperCase()}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Filters Control Card */}
      <Card title="应用功耗场景分析" subtitle="将功耗从逻辑模块的静态属性解耦，支持与应用场景、物理映射、DVFS工作点联动分析" icon={Zap}>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <FieldLabel htmlFor="impl-option-select" label="实现选项 (Design Option)">
              <select
                id="impl-option-select"
                className="mt-1 block w-full rounded-lg border border-slate-205 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                value={selectedImplOptionId}
                onChange={(e) => handleImplOptionChange(e.target.value)}
              >
                {implOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.id} - {opt.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
          </div>

          <div>
            <FieldLabel htmlFor="phys-mapping-select" label="物理映射版本 (Physical Mapping)">
              <select
                id="phys-mapping-select"
                className="mt-1 block w-full rounded-lg border border-slate-205 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                value={selectedPhysicalMappingId}
                onChange={(e) => setSelectedPhysicalMappingId(e.target.value)}
                disabled={physicalMappings.length === 0}
              >
                {physicalMappings.length === 0 ? (
                  <option value="">(无物理映射)</option>
                ) : (
                  physicalMappings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))
                )}
              </select>
            </FieldLabel>
          </div>

          <div>
            <FieldLabel htmlFor="app-scenario-select" label="应用场景 (Application Scenario)">
              <select
                id="app-scenario-select"
                className="mt-1 block w-full rounded-lg border border-slate-205 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                value={selectedApplicationScenarioId}
                onChange={(e) => setSelectedApplicationScenarioId(e.target.value)}
              >
                {applicationScenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
          </div>

          <div>
            <FieldLabel htmlFor="op-set-select" label="工作点配置 (Operating Point Set)">
              <select
                id="op-set-select"
                className="mt-1 block w-full rounded-lg border border-slate-205 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                value={selectedOperatingPointSetId}
                onChange={(e) => setSelectedOperatingPointSetId(e.target.value)}
              >
                {operatingPointSets.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
          </div>
        </div>

        {/* Advanced Filters */}
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
              <span className="flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5" />
                高级过滤条件 (Advanced Filters)
              </span>
              <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            
            <div className="mt-3 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <FieldLabel htmlFor="stat-type-select" label="统计类型 (Statistic)">
                  <select
                    id="stat-type-select"
                    className="mt-1 block w-full rounded-lg border border-slate-205 bg-white px-2.5 py-1.5 text-xs text-slate-850 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    value={statisticType}
                    onChange={(e) => setStatisticType(e.target.value)}
                  >
                    <option value="average">average (平均值)</option>
                    <option value="peak">peak (峰值)</option>
                    <option value="p95">p95 (95分位数)</option>
                    <option value="p99">p99 (99分位数)</option>
                    <option value="rms">rms (均方根)</option>
                  </select>
                </FieldLabel>
              </div>

              <div>
                <FieldLabel htmlFor="power-type-select" label="功耗分量 (Power Type)">
                  <select
                    id="power-type-select"
                    className="mt-1 block w-full rounded-lg border border-slate-205 bg-white px-2.5 py-1.5 text-xs text-slate-850 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    value={powerType}
                    onChange={(e) => setPowerType(e.target.value)}
                  >
                    <option value="total">total (总功耗)</option>
                    <option value="dynamic">dynamic (动态功耗)</option>
                    <option value="leakage">leakage (漏电功耗)</option>
                    <option value="interconnect">interconnect (互连开销)</option>
                  </select>
                </FieldLabel>
              </div>

              <div>
                <FieldLabel htmlFor="time-window-input" label="时间窗口 (Time Window)">
                  <select
                    id="time-window-input"
                    className="mt-1 block w-full rounded-lg border border-slate-205 bg-white px-2.5 py-1.5 text-xs text-slate-850 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    value={timeWindowName}
                    onChange={(e) => setTimeWindowName(e.target.value)}
                  >
                    <option value="">全部时间段 (All)</option>
                    <option value="steady_state">steady_state (常态运转)</option>
                    <option value="burst">burst (瞬间爆发)</option>
                  </select>
                </FieldLabel>
              </div>

              <div>
                <FieldLabel htmlFor="dev-stage-select" label="开发成熟度 (Stage)">
                  <select
                    id="dev-stage-select"
                    className="mt-1 block w-full rounded-lg border border-slate-205 bg-white px-2.5 py-1.5 text-xs text-slate-850 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    value={developmentStage}
                    onChange={(e) => setDevelopmentStage(e.target.value)}
                  >
                    <option value="">全部阶段 (All)</option>
                    <option value="architecture_estimate">architecture_estimate (架构估算)</option>
                    <option value="rtl_power">rtl_power (RTL仿真)</option>
                    <option value="post_pnr_power">post_pnr_power (板图仿真)</option>
                    <option value="silicon_measurement">silicon_measurement (硅后实测)</option>
                  </select>
                </FieldLabel>
              </div>
            </div>
          </details>
        </div>
      </Card>

      {/* Error state */}
      {error && (
        <Card title="功耗加载出错" subtitle="无法获取数据" icon={AlertTriangle}>
          <div className="text-sm text-red-600">{error}</div>
        </Card>
      )}

      {/* Main Analysis Display Panel */}
      {loading ? (
        <Card title="计算中..." subtitle="正在从 SQLite 数据库提取数据并进行层级聚合..." icon={RefreshCw}>
          <div className="flex h-32 items-center justify-center">
            <span className="animate-spin mr-2">🔄</span>
            <span className="text-sm text-slate-500">正在汇总功耗指标...</span>
          </div>
        </Card>
      ) : summary ? (
        <div className="space-y-6">
          
          {/* Region 1: Overview Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Cpu className="h-4 w-4 text-purple-500" />
                可加和模块总功耗 (Additive Total)
              </div>
              <div className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">
                {displayW(summary.total_additive_power_w)}
              </div>
              <div className="mt-1 text-xs text-slate-500">参与模块分解的独立观测功耗总和</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Database className="h-4 w-4 text-blue-500" />
                非加和总线参考 (SoC Reference)
              </div>
              <div className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">
                {displayW(summary.non_additive_reference_power_w)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {summary.non_additive_references.length > 0
                  ? `SoC 总功耗实测或基准参考值`
                  : "当前配置下无参考值"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Activity className="h-4 w-4 text-emerald-500" />
                未解释剩余功耗 (Residual)
              </div>
              <div className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">
                {displayW(summary.residual_power_w)}
              </div>
              <div className="mt-1 text-xs text-slate-500">基准参考值与子模块加总之间的差值</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <FileText className="h-4 w-4 text-amber-500" />
                观测指标总数 (Observations)
              </div>
              <div className="mt-3 text-3xl font-bold text-slate-950 dark:text-white">
                {summary.observations.length}
              </div>
              <div className="mt-1 text-xs text-slate-500">命中当前复合筛选条件的数据库记录行数</div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Region 2: Breakdown by Scope Type */}
            <Card title="按归属对象分解 (Scope Type Breakdown)" subtitle="展示逻辑子模块、物理层叠、共享资源及耦合开销的功耗占比" icon={Activity}>
              <div className="space-y-4">
                {(Object.entries(summary.by_scope_type) as [string, number][]).map(([type, val]) => {
                  const percent = summary.total_additive_power_w > 0
                    ? (val / summary.total_additive_power_w) * 105
                    : 0;
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {getScopeTypeBadge(type)}
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {val.toFixed(2)} W ({((val / (summary.total_additive_power_w || 1)) * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-2 rounded-full bg-indigo-600 transition-all"
                          style={{ width: `${Math.min(100, percent)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {Object.keys(summary.by_scope_type).length === 0 && (
                  <div className="py-6 text-center text-sm text-slate-500">没有查找到符合条件的累加观测值。</div>
                )}
              </div>
            </Card>

            {/* Region 3: Breakdown by Component */}
            <Card title="核心模块功耗排行 (Component Power Ranking)" subtitle="子系统内各逻辑 IP/Block 功耗贡献大小排序 (Additive)" icon={Cpu}>
              <div className="space-y-4">
                {(Object.entries(summary.by_component) as [string, number][])
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, val]) => {
                    const percent = summary.total_additive_power_w > 0
                      ? (val / summary.total_additive_power_w) * 100
                      : 0;
                    return (
                      <div key={name} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm last:border-0 last:pb-0 dark:border-slate-800">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500">{percent.toFixed(1)}%</span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{val.toFixed(2)} W</span>
                        </div>
                      </div>
                    );
                  })}
                {Object.keys(summary.by_component).length === 0 && (
                  <div className="py-6 text-center text-sm text-slate-500">当前工作点下，未记录独立模块的功耗。</div>
                )}
              </div>
            </Card>
          </div>

          {/* Region 4: Development Stage & References */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <Card title="成熟度与来源分布" subtitle="反映功耗评估的数据源与开发阶段" icon={Sliders}>
                <div className="space-y-3">
                  {(Object.entries(summary.by_stage) as [string, number][]).map(([stage, count]) => (
                    <div key={stage} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400 text-xs truncate max-w-[180px]" title={getStageLabel(stage)}>
                        {getStageLabel(stage).split(" ")[0]}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{count} 条记录</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card title="非加和基准观测 (Reference Checks)" subtitle="SoC 或电源轨测量的全局约束功耗，不直接加总" icon={Database}>
                <div className="space-y-3">
                  {summary.non_additive_references.map((ref: { scope_type: string; scope_name: string; power_value_w: number; development_stage: string | null }, idx: number) => (
                    <div key={idx} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        {getScopeTypeBadge(ref.scope_type)}
                        <span className="font-semibold text-slate-900 dark:text-white">{ref.scope_name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">[{ref.development_stage ? getStageLabel(ref.development_stage).split(" ")[0] : "N/A"}]</span>
                        <span className="font-bold text-indigo-700 dark:text-indigo-400">{ref.power_value_w.toFixed(2)} W</span>
                      </div>
                    </div>
                  ))}
                  {summary.non_additive_references.length === 0 && (
                    <div className="py-6 text-center text-sm text-slate-500">没有配置该场景下的全局参考功耗。</div>
                  )}
                </div>
              </Card>
            </div>
          </div>

          {/* Region 5: Observations List Table */}
          <Card title="功耗观测明细数据表 (Power Observations Table)" subtitle="SQLite 数据库中该场景工作状态下的原始功耗记录" icon={FileText}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-900 dark:text-slate-100">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">类型</th>
                    <th className="px-4 py-3">对象名称</th>
                    <th className="px-4 py-3">使用用例</th>
                    <th className="px-4 py-3">时间窗口</th>
                    <th className="px-4 py-3">功耗分量</th>
                    <th className="px-4 py-3">数值 (W)</th>
                    <th className="px-4 py-3">评估阶段</th>
                    <th className="px-4 py-3">可信度</th>
                    <th className="px-4 py-3">累加?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                  {summary.observations.map((obs: PowerObservation) => (
                    <tr key={obs.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">{obs.id}</td>
                      <td className="px-4 py-3">{getScopeTypeBadge(obs.scope_type)}</td>
                      <td className="px-4 py-3 font-medium">{obs.scope_name}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{obs.use_case_name || "N/A"}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{obs.time_window_name || "N/A"}</td>
                      <td className="px-4 py-3 text-xs capitalize">{obs.power_type}</td>
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                        {obs.power_value_w.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {obs.development_stage ? getStageLabel(obs.development_stage).split(" ")[0] : "N/A"}
                      </td>
                      <td className="px-4 py-3">{getConfidenceBadge(obs.confidence)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          obs.is_additive
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {obs.is_additive ? "Y" : "N"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {summary.observations.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-500">
                        当前筛选条件下无任何功耗观测记录。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <Card title="无可用 analysis" subtitle="请选择有效的筛选参数" icon={AlertTriangle}>
          <div className="text-sm text-slate-500">没有查找到符合条件的累加汇总。请检查设计选项和物理映射是否匹配。</div>
        </Card>
      )}
    </div>
  );
}
