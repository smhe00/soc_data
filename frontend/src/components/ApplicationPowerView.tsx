import React, { useEffect, useState, useMemo } from "react";
import { Zap, Cpu, Sliders, Database, Activity, FileText, AlertTriangle, RefreshCw, Plus, Trash2 } from "lucide-react";
import { Card, Badge, FieldLabel } from "./ui";
import type { ImplOption } from "../types/impl_option";
import {
  getApplicationScenarios,
  getPhysicalMappings,
  getOperatingPointSets,
  getPowerSummary,
  createPowerObservation,
  deletePowerObservation,
} from "../api/power";
import type {
  ApplicationScenario,
  PhysicalMapping,
  OperatingPointSet,
  PowerSummary,
  PowerObservation,
} from "../types/power";
import { getComponentTree } from "../api/components";
import type { TreeBlock } from "../types/component";

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

  // Refresh trigger to reload summary
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Component tree for scope component dropdown
  const [componentTree, setComponentTree] = useState<TreeBlock[]>([]);

  // Add modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [scopeType, setScopeType] = useState<string>("component");
  const [scopeId, setScopeId] = useState<string>("");
  const [scopeName, setScopeName] = useState<string>("");
  const [useCaseName, setUseCaseName] = useState<string>("");
  const [timeWindowNameInput, setTimeWindowNameInput] = useState<string>("");
  const [powerValueW, setPowerValueW] = useState<string>("0.0");
  const [formStatisticType, setFormStatisticType] = useState<string>("average");
  const [formPowerType, setFormPowerType] = useState<string>("total");
  const [formDevStage, setFormDevStage] = useState<string>("architecture_estimate");
  const [formConfidence, setFormConfidence] = useState<string>("draft");
  const [isAdditiveInput, setIsAdditiveInput] = useState<boolean>(true);
  const [formNote, setFormNote] = useState<string>("");

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Expanded nodes and dropdown state for tree selector
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [isTreeDropdownOpen, setIsTreeDropdownOpen] = useState<boolean>(false);

  // Automatically expand all component tree nodes by default on load
  useEffect(() => {
    if (componentTree.length > 0) {
      const initial: Record<string, boolean> = {};
      const autoExpand = (nodes: TreeBlock[]) => {
        for (const node of nodes) {
          initial[node.id] = true;
          if (node.children && node.children.length > 0) {
            autoExpand(node.children);
          }
        }
      };
      autoExpand(componentTree);
      setExpandedNodes(initial);
    }
  }, [componentTree]);

  // Load component tree when design option changes
  useEffect(() => {
    async function loadTree() {
      if (!selectedImplOptionId) return;
      try {
        const data = await getComponentTree(undefined, selectedImplOptionId);
        setComponentTree(data);
      } catch (err) {
        console.error("Failed to load component tree:", err);
      }
    }
    loadTree();
  }, [selectedImplOptionId]);

  // Helper to get descendants of a TreeBlock
  const getDescendants = (node: TreeBlock): TreeBlock[] => {
    let list: TreeBlock[] = [node];
    if (node.children) {
      for (const child of node.children) {
        list = list.concat(getDescendants(child));
      }
    }
    return list;
  };

  // Flatten the component tree into dropdown options with indentation and completion status
  const dropdownOptions = useMemo(() => {
    const flatten = (nodes: TreeBlock[], depth: number = 0): Array<{ id: string; name: string; displayLabel: string; hasDirectObs: boolean }> => {
      let result: Array<{ id: string; name: string; displayLabel: string; hasDirectObs: boolean }> = [];
      
      for (const node of nodes) {
        const descendants = getDescendants(node);
        const totalCount = descendants.length;
        const observedCount = descendants.filter((d) =>
          summary?.observations.some((obs) => obs.scope_type === "component" && obs.scope_id === d.id)
        ).length;
        
        const hasDirectObs = summary?.observations.some(
          (obs) => obs.scope_type === "component" && obs.scope_id === node.id
        ) ?? false;

        let completionLabel = "";
        if (observedCount === totalCount) {
          completionLabel = "100% 已闭合";
        } else if (observedCount > 0) {
          const pct = Math.round((observedCount / totalCount) * 100);
          completionLabel = `${pct}% 部分录入`;
        } else {
          completionLabel = "未录入";
        }

        const indent = "\u00A0\u00A0\u00A0\u00A0".repeat(depth); // 4 spaces per depth level
        const prefix = depth > 0 ? "├─ " : "";
        const displayLabel = `${indent}${prefix}${node.name} (${node.id}) [${completionLabel}]`;

        result.push({
          id: node.id,
          name: node.name,
          displayLabel,
          hasDirectObs,
        });

        if (node.children && node.children.length > 0) {
          result = result.concat(flatten(node.children, depth + 1));
        }
      }
      return result;
    };
    return flatten(componentTree);
  }, [componentTree, summary?.observations]);

  // Flat list of all TreeBlocks to easily query name by selected ID
  const flatComponents = useMemo(() => {
    const flatten = (nodes: TreeBlock[]): TreeBlock[] => {
      let res: TreeBlock[] = [];
      for (const n of nodes) {
        res.push(n);
        if (n.children && n.children.length > 0) {
          res = res.concat(flatten(n.children));
        }
      }
      return res;
    };
    return flatten(componentTree);
  }, [componentTree]);

  // Selected component hierarchical path
  const selectedComponentPath = useMemo(() => {
    if (scopeType === "component" && scopeId) {
      const comp = flatComponents.find(c => c.id === scopeId);
      return comp ? comp.hierarchy_path : null;
    }
    return null;
  }, [scopeType, scopeId, flatComponents]);

  // Render a conic-gradient based tiny pie chart indicator for completion status
  const PieChartIndicator = ({ percent }: { percent: number }): JSX.Element => {
    const activeColor = percent === 100 ? "#10b981" : "#f59e0b"; // emerald-500 or amber-500
    const inactiveColor = "#f1f5f9"; // slate-100
    
    return (
      <div
        className="w-3.5 h-3.5 rounded-full border border-slate-350 shrink-0 inline-block align-middle shadow-sm"
        style={{
          background: `conic-gradient(${activeColor} 0% ${percent}%, ${inactiveColor} ${percent}% 100%)`
        }}
        title={`功耗录入完成度: ${percent}%`}
      />
    );
  };

  // Toggle expand/collapse of tree node
  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Render tree options recursively
  const renderTreeOptions = (nodes: TreeBlock[], depth: number = 0): JSX.Element[] => {
    let elements: JSX.Element[] = [];

    for (const node of nodes) {
      const isExpanded = !!expandedNodes[node.id];
      const hasChildren = node.children && node.children.length > 0;
      
      // Calculate completion percentage
      const descendants = getDescendants(node);
      const totalCount = descendants.length;
      const observedCount = descendants.filter((d) =>
        summary?.observations.some((obs) => obs.scope_type === "component" && obs.scope_id === d.id)
      ).length;
      const pct = totalCount > 0 ? Math.round((observedCount / totalCount) * 100) : 0;
      
      // Check if selected
      const isSelected = scopeId === node.id;

      elements.push(
        <div
          key={node.id}
          className={`flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg cursor-pointer transition ${
            isSelected ? "bg-indigo-50 text-indigo-900 font-semibold" : "hover:bg-slate-50 text-slate-700"
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          onClick={() => {
            setScopeId(node.id);
            setScopeName(node.name);
            setIsTreeDropdownOpen(false);
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                className="w-3.5 h-3.5 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200/50"
                onClick={(e) => toggleExpand(node.id, e)}
              >
                <span className={`text-[8px] transform transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                  ▶
                </span>
              </button>
            ) : (
              <div className="w-3.5 h-3.5" /> // spacer
            )}
            <span className="truncate" title={node.name}>
              {node.name} <span className="text-[9px] text-slate-400 font-mono">({node.id})</span>
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0 pl-2">
            <PieChartIndicator percent={pct} />
            <span className="text-[9px] text-slate-450 font-medium">{pct}%</span>
          </div>
        </div>
      );

      if (hasChildren && isExpanded) {
        elements = elements.concat(renderTreeOptions(node.children, depth + 1));
      }
    }

    return elements;
  };

  const handleDeleteObservation = async (obsId: string) => {
    if (!window.confirm("确定要删除该条功耗观测记录吗？")) {
      return;
    }
    try {
      await deletePowerObservation(obsId);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: any) {
      alert(`删除失败: ${err?.message || err}`);
    }
  };

  const handleAddObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const activeImplOption = implOptions.find((o) => o.id === selectedImplOptionId);
    const projectId = activeImplOption ? activeImplOption.project_id : "P001";

    const valueNum = parseFloat(powerValueW);
    if (isNaN(valueNum) || valueNum < 0) {
      setFormError("功耗值必须是大于或等于 0 的数字");
      setSubmitting(false);
      return;
    }

    if (scopeType === "component" && !scopeId) {
      setFormError("请选择一个逻辑模块");
      setSubmitting(false);
      return;
    }

    if (!scopeName.trim()) {
      setFormError("范围名称不能为空");
      setSubmitting(false);
      return;
    }

    try {
      await createPowerObservation({
        project_id: projectId,
        impl_option_id: selectedImplOptionId,
        physical_mapping_id: selectedPhysicalMappingId,
        application_scenario_id: selectedApplicationScenarioId,
        operating_point_set_id: selectedOperatingPointSetId,
        scope_type: scopeType,
        scope_id: scopeType === "component" ? scopeId : null,
        scope_name: scopeName,
        use_case_name: useCaseName || null,
        time_window_name: timeWindowNameInput || null,
        statistic_type: formStatisticType,
        power_type: formPowerType,
        power_value_w: valueNum,
        development_stage: formDevStage || null,
        confidence: formConfidence || null,
        is_additive: isAdditiveInput,
        note: formNote || null,
      });

      // Reset form
      setScopeType("component");
      setScopeId("");
      setScopeName("");
      setUseCaseName("");
      setTimeWindowNameInput("");
      setPowerValueW("0.0");
      setFormStatisticType("average");
      setFormPowerType("total");
      setFormDevStage("architecture_estimate");
      setFormConfidence("draft");
      setIsAdditiveInput(true);
      setFormNote("");
      setShowAddModal(false);

      // Trigger refresh
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: any) {
      console.error(err);
      setFormError(`创建功耗观测失败: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

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
    refreshTrigger,
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
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
        <div className="mt-4 border-t border-slate-100 pt-4">
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800">
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
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
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
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
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
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
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
                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
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
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Cpu className="h-4 w-4 text-purple-500" />
                可加和模块总功耗 (Additive Total)
              </div>
              <div className="mt-3 text-3xl font-bold text-slate-950">
                {displayW(summary.total_additive_power_w)}
              </div>
              <div className="mt-1 text-xs text-slate-500">参与模块分解的独立观测功耗总和</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Database className="h-4 w-4 text-blue-500" />
                非加和总线参考 (SoC Reference)
              </div>
              <div className="mt-3 text-3xl font-bold text-slate-950">
                {displayW(summary.non_additive_reference_power_w)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {summary.non_additive_references.length > 0
                  ? `SoC 总功耗实测或基准参考值`
                  : "当前配置下无参考值"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Activity className="h-4 w-4 text-emerald-500" />
                未解释剩余功耗 (Residual)
              </div>
              <div className="mt-3 text-3xl font-bold text-slate-950">
                {displayW(summary.residual_power_w)}
              </div>
              <div className="mt-1 text-xs text-slate-500">基准参考值与子模块加总之间的差值</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <FileText className="h-4 w-4 text-amber-500" />
                观测指标总数 (Observations)
              </div>
              <div className="mt-3 text-3xl font-bold text-slate-950">
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
                  const getProgressBarColor = (scopeType: string) => {
                    const colorMapping: Record<string, string> = {
                      soc: "bg-gradient-to-r from-blue-500 to-indigo-650",
                      component: "bg-gradient-to-r from-violet-500 to-purple-600",
                      tier: "bg-gradient-to-r from-emerald-500 to-teal-600",
                      power_rail: "bg-gradient-to-r from-amber-400 to-orange-500",
                      shared_resource: "bg-gradient-to-r from-cyan-400 to-blue-500",
                      interaction: "bg-gradient-to-r from-rose-500 to-red-600",
                      residual: "bg-gradient-to-r from-slate-400 to-slate-600",
                    };
                    return colorMapping[scopeType] || "bg-indigo-600";
                  };
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {getScopeTypeBadge(type)}
                        </div>
                        <span className="font-semibold text-slate-900">
                          {val.toFixed(2)} W ({((val / (summary.total_additive_power_w || 1)) * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100">
                        <div
                          className={`h-2 rounded-full transition-all ${getProgressBarColor(type)}`}
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
                      <div key={name} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm last:border-0 last:pb-0">
                        <span className="font-medium text-slate-800">{name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500">{percent.toFixed(1)}%</span>
                          <span className="font-semibold text-slate-900">{val.toFixed(2)} W</span>
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
                      <span className="text-slate-600 text-xs truncate max-w-[180px]" title={getStageLabel(stage)}>
                        {getStageLabel(stage).split(" ")[0]}
                      </span>
                      <span className="font-semibold text-slate-800">{count} 条记录</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card title="非加和基准观测 (Reference Checks)" subtitle="SoC 或电源轨测量的全局约束功耗，不直接加总" icon={Database}>
                <div className="space-y-3">
                  {summary.non_additive_references.map((ref: { scope_type: string; scope_name: string; power_value_w: number; development_stage: string | null }, idx: number) => (
                    <div key={idx} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm border border-slate-100">
                      <div className="flex items-center gap-2">
                        {getScopeTypeBadge(ref.scope_type)}
                        <span className="font-semibold text-slate-900">{ref.scope_name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">[{ref.development_stage ? getStageLabel(ref.development_stage).split(" ")[0] : "N/A"}]</span>
                        <span className="font-bold text-indigo-700">{ref.power_value_w.toFixed(2)} W</span>
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
          <Card
            title="功耗观测明细数据表 (Power Observations Table)"
            subtitle="SQLite 数据库中该场景工作状态下的原始功耗记录"
            icon={FileText}
            right={
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
              >
                <Plus size={14} />
                新建功耗观测
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-900">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
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
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {summary.observations.map((obs: PowerObservation) => (
                    <tr key={obs.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">{obs.id}</td>
                      <td className="px-4 py-3">{getScopeTypeBadge(obs.scope_type)}</td>
                      <td className="px-4 py-3 font-medium">{obs.scope_name}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{obs.use_case_name || "N/A"}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{obs.time_window_name || "N/A"}</td>
                      <td className="px-4 py-3 text-xs capitalize">{obs.power_type}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {obs.power_value_w.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {obs.development_stage ? getStageLabel(obs.development_stage).split(" ")[0] : "N/A"}
                      </td>
                      <td className="px-4 py-3">{getConfidenceBadge(obs.confidence)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          obs.is_additive
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}>
                          {obs.is_additive ? "Y" : "N"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteObservation(obs.id)}
                          className="text-slate-400 hover:text-red-600 transition p-1 rounded-md hover:bg-slate-100"
                          title="删除观测记录"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {summary.observations.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-sm text-slate-500">
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

      {/* Region 6: Add Power Observation Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">新建功耗观测记录 (New Power Observation)</h3>
                <p className="text-xs text-slate-500 mt-0.5">为特定工作状态、应用场景和物理映射添加测试/估算分量</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-medium p-1"
              >
                &times;
              </button>
            </div>

            {formError && (
              <div className="mb-4 rounded-lg bg-rose-50 border border-rose-100 p-3 text-sm text-rose-700 flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddObservation} className="space-y-4 text-slate-700 text-sm">
              {/* Context info (Read-only) */}
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/60 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">实现选项: </span>
                  <span className="text-slate-800 font-semibold">{implOptions.find(o => o.id === selectedImplOptionId)?.name || selectedImplOptionId}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">物理映射: </span>
                  <span className="text-slate-800 font-semibold">{physicalMappings.find(m => m.id === selectedPhysicalMappingId)?.name || selectedPhysicalMappingId}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">应用场景: </span>
                  <span className="text-slate-800 font-semibold">{applicationScenarios.find(s => s.id === selectedApplicationScenarioId)?.name || selectedApplicationScenarioId}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">工作点集: </span>
                  <span className="text-slate-800 font-semibold">{operatingPointSets.find(op => op.id === selectedOperatingPointSetId)?.name || selectedOperatingPointSetId}</span>
                </div>
              </div>

              {/* Form inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">范围类型 (Scope Type)</label>
                  <select
                    className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={scopeType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setScopeType(newType);
                      if (newType !== "component") {
                        setScopeId("");
                        setScopeName("");
                      }
                    }}
                  >
                    <option value="component">逻辑模块 (component)</option>
                    <option value="shared_resource">共享资源 (shared_resource)</option>
                    <option value="interaction">交互开销 (interaction)</option>
                    <option value="power_rail">电源轨 (power_rail)</option>
                    <option value="soc">SoC整体 (soc)</option>
                    <option value="residual">未解释剩余 (residual)</option>
                  </select>
                </div>

                {scopeType === "component" ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">选择逻辑模块 (Component)</label>
                    <div className="relative">
                      <button
                        type="button"
                        className="flex items-center justify-between w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-left transition"
                        onClick={() => setIsTreeDropdownOpen(!isTreeDropdownOpen)}
                      >
                        <span className="truncate">
                          {scopeId ? (
                            <span>
                              {scopeName} <span className="text-xs text-slate-400 font-mono">({scopeId})</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">-- 请选择模块 --</span>
                          )}
                        </span>
                        <span className="text-slate-400 text-[10px] transform transition-transform duration-200">
                          {isTreeDropdownOpen ? "▲" : "▼"}
                        </span>
                      </button>

                      {isTreeDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setIsTreeDropdownOpen(false)}
                          />
                          <div className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-250 bg-white p-1 shadow-lg space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                            {componentTree.length > 0 ? (
                              renderTreeOptions(componentTree)
                            ) : (
                              <div className="px-3 py-2 text-xs text-slate-400 text-center">无可用组件树</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">范围名称 (Scope Name)</label>
                    <input
                      type="text"
                      className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="例如: NoC, VDD_GPU"
                      value={scopeName}
                      onChange={(e) => setScopeName(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {scopeType === "component" && scopeId && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    模块确认与层次路径 (Component Scope & Path)
                  </label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 font-medium">范围名称: </span>
                      <span className="text-slate-800 font-semibold font-mono">{scopeName}</span>
                    </div>
                    {selectedComponentPath && (
                      <div className="flex items-start gap-1.5">
                        <span className="text-slate-400 font-medium shrink-0 mt-0.5">层次路径: </span>
                        <span className="text-indigo-600 font-semibold font-mono break-all">{selectedComponentPath}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">使用用例 (Use Case, 可选)</label>
                  <input
                    type="text"
                    className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="例如: GPU_RENDER_BURST"
                    value={useCaseName}
                    onChange={(e) => setUseCaseName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">时间窗口 (Time Window, 可选)</label>
                  <input
                    type="text"
                    className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="例如: steady_state, burst"
                    value={timeWindowNameInput}
                    onChange={(e) => setTimeWindowNameInput(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">功耗数值 (Power Value, W)</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 font-bold focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={powerValueW}
                    onChange={(e) => setPowerValueW(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">功耗分量 (Power Type)</label>
                  <select
                    className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={formPowerType}
                    onChange={(e) => setFormPowerType(e.target.value)}
                  >
                    <option value="total">总功耗 (total)</option>
                    <option value="dynamic">动态功耗 (dynamic)</option>
                    <option value="leakage">漏电功耗 (leakage)</option>
                    <option value="clock">时钟功耗 (clock)</option>
                    <option value="memory">内存功耗 (memory)</option>
                    <option value="interconnect">互连功耗 (interconnect)</option>
                    <option value="io">I/O 功耗 (io)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">统计方式 (Statistic)</label>
                  <select
                    className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={formStatisticType}
                    onChange={(e) => setFormStatisticType(e.target.value)}
                  >
                    <option value="average">平均值 (average)</option>
                    <option value="peak">峰值 (peak)</option>
                    <option value="p95">P95 (p95)</option>
                    <option value="p99">P99 (p99)</option>
                    <option value="rms">有效值 (rms)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">评估阶段 (Dev Stage)</label>
                  <select
                    className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={formDevStage}
                    onChange={(e) => setFormDevStage(e.target.value)}
                  >
                    <option value="architecture_estimate">架构估算</option>
                    <option value="rtl_power">RTL仿真</option>
                    <option value="gate_level_power">门级网表</option>
                    <option value="post_pnr_power">PNR物理实现后</option>
                    <option value="thermal_aware_power">热分析后</option>
                    <option value="silicon_measurement">硅后实测</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">可信度 (Confidence)</label>
                  <select
                    className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={formConfidence}
                    onChange={(e) => setFormConfidence(e.target.value)}
                  >
                    <option value="draft">草稿 (DRAFT)</option>
                    <option value="review">待评审 (REVIEW)</option>
                    <option value="approved">已批准 (APPROVED)</option>
                    <option value="measured">硅后实测 (MEASURED)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 py-2 border-y border-slate-100">
                <input
                  type="checkbox"
                  id="is-additive-checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  checked={isAdditiveInput}
                  onChange={(e) => setIsAdditiveInput(e.target.checked)}
                />
                <label htmlFor="is-additive-checkbox" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  参与功耗累加汇总 (Is Additive)?
                </label>
                <span className="text-xs text-slate-400 font-normal">
                  （若选否，该项将作为非累加参考项，如 SoC 整体参考功耗）
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">备注/数据来源 (Note)</label>
                <textarea
                  className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  rows={2}
                  placeholder="可记录数据来源文件、参考的测试报告或计算备注..."
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 transition"
                  disabled={submitting}
                >
                  {submitting ? "正在提交..." : "提交保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


