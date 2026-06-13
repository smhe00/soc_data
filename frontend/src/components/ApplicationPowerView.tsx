import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Eye, Pencil, RefreshCw, RotateCcw, Save, Search, Trash2, Zap } from "lucide-react";
import type { ImplOption } from "../types/impl_option";
import type { TreeBlock } from "../types/component";
import type {
  ApplicationPowerSummary,
  ApplicationScenario,
  ApplicationScenarioSelection,
  ModulePowerUseCase,
  OperatingPointSet,
  PowerDataset,
} from "../types/power";
import { getComponentTree } from "../api/components";
import {
  createApplicationScenario,
  deleteApplicationScenario,
  deleteModulePowerUseCase,
  getApplicationPowerSummary,
  getApplicationScenarioComposition,
  getApplicationScenarios,
  getModulePowerUseCases,
  getOperatingPointSets,
  getPowerDatasets,
  updateApplicationScenario,
  updateApplicationScenarioComposition,
  upsertModulePowerUseCase,
} from "../api/power";
import { Badge, Card, FieldLabel, ResourceIcon } from "./ui";

interface ApplicationPowerViewProps {
  implOptions: ImplOption[];
}

interface RowDraft {
  included: boolean;
  useCaseName: string;
  operatingPointSetId: string;
  operatingPointSetName: string;
  powerMw: string;
}

interface ScenarioDraft {
  name: string;
  category: string;
  description: string;
}

const DEFAULT_USE_CASE = "Default";
const NEW_USE_CASE_VALUE = "__new_use_case__";
const DEFAULT_PROFILE_ID = "OP_DEFAULT";
const DEFAULT_PROFILE_NAME = "Default";
const NEW_PROFILE_VALUE = "__new_profile__";
const NEW_APPLICATION_SCENARIO_VALUE = "__new_application_scenario__";
const ALL_SCENARIO_CATEGORIES_VALUE = "__all_scenario_categories__";
const NEW_SCENARIO_CATEGORY_VALUE = "__new_scenario_category__";
type PowerTableMode = "view" | "edit";

function flattenTree(nodes: TreeBlock[], depth = 0): Array<{ node: TreeBlock; depth: number }> {
  return nodes.flatMap((node) => [{ node, depth }, ...flattenTree(node.children || [], depth + 1)]);
}

function descendantsMatch(node: TreeBlock, query: string): boolean {
  const text = [node.id, node.name, node.resource, node.hierarchy_path].join(" ").toLowerCase();
  if (text.includes(query)) return true;
  return (node.children || []).some((child) => descendantsMatch(child, query));
}

function filterTree(nodes: TreeBlock[], query: string): TreeBlock[] {
  if (!query) return nodes;
  return nodes
    .map((node) => ({ ...node, children: filterTree(node.children || [], query) }))
    .filter((node) => descendantsMatch(node, query));
}

function pruneTreeByIncludedSelection(nodes: TreeBlock[], includedIds: Set<string>): TreeBlock[] {
  return nodes
    .map((node) => {
      const children = pruneTreeByIncludedSelection(node.children || [], includedIds);
      if (includedIds.has(node.id) || children.length > 0) {
        return { ...node, children };
      }
      return null;
    })
    .filter((node): node is TreeBlock => node !== null);
}

function formatMw(powerW: number | null | undefined): string {
  if (powerW === null || powerW === undefined) return "-";
  return `${(powerW * 1000).toFixed(2)} mW`;
}

function rollupTone(status: ApplicationPowerSummary["hierarchy_rollups"][number]["status"]): "slate" | "green" | "amber" | "red" | "blue" {
  if (status === "closed") return "green";
  if (status === "unsplit") return "blue";
  if (status === "over_specified") return "red";
  return "amber";
}

function rollupLabel(rollup: ApplicationPowerSummary["hierarchy_rollups"][number]): string {
  if (rollup.status === "closed") return "Closed";
  if (rollup.status === "over_specified") return `Over ${formatMw(Math.abs(rollup.unsplit_power_w ?? rollup.residual_power_w ?? 0))}`;
  if (rollup.status === "incomplete") return "Incomplete";
  return `Unsplit ${formatMw(rollup.unsplit_power_w ?? rollup.residual_power_w)}`;
}

function profileIdFromName(name: string): string {
  const cleaned = name.trim() || DEFAULT_PROFILE_NAME;
  if (cleaned.toLowerCase() === "default") return DEFAULT_PROFILE_ID;
  return `OP_${cleaned.replace(/[\s/.-]+/g, "_").toUpperCase()}`;
}

export function ApplicationPowerView({ implOptions }: ApplicationPowerViewProps): JSX.Element {
  const [selectedImplOptionId, setSelectedImplOptionId] = useState("S2");
  const [powerDatasets, setPowerDatasets] = useState<PowerDataset[]>([]);
  const [selectedPowerDatasetId, setSelectedPowerDatasetId] = useState("");
  const [applicationScenarios, setApplicationScenarios] = useState<ApplicationScenario[]>([]);
  const [selectedApplicationScenarioId, setSelectedApplicationScenarioId] = useState("");
  const [operatingPointSets, setOperatingPointSets] = useState<OperatingPointSet[]>([]);
  const [componentTree, setComponentTree] = useState<TreeBlock[]>([]);
  const [moduleUseCases, setModuleUseCases] = useState<ModulePowerUseCase[]>([]);
  const [composition, setComposition] = useState<ApplicationScenarioSelection[]>([]);
  const [summary, setSummary] = useState<ApplicationPowerSummary | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [refreshId, setRefreshId] = useState(0);
  const [tableMode, setTableMode] = useState<PowerTableMode>("view");
  const [isCreatingScenario, setIsCreatingScenario] = useState(false);
  const [scenarioDraft, setScenarioDraft] = useState<ScenarioDraft>({ name: "", category: "Custom", description: "" });
  const [scenarioCategoryFilter, setScenarioCategoryFilter] = useState(ALL_SCENARIO_CATEGORIES_VALUE);
  const [activeNewUseCaseId, setActiveNewUseCaseId] = useState<string | null>(null);
  const rowDraftPins = useRef<Set<string>>(new Set());

  const selectedImplOption = implOptions.find((item) => item.id === selectedImplOptionId);
  const projectId = selectedImplOption?.project_id || "P001";
  const selectedPowerDataset = powerDatasets.find((item) => item.id === selectedPowerDatasetId);
  const selectedApplicationScenario = applicationScenarios.find((item) => item.id === selectedApplicationScenarioId);
  const scenarioCategories = useMemo(
    () => Array.from(new Set(applicationScenarios.map((item) => item.category || "Custom").filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [applicationScenarios],
  );
  const scenarioCategoryFilterActive = tableMode === "view" && scenarioCategoryFilter !== ALL_SCENARIO_CATEGORIES_VALUE;
  const scenarioSelectOptions = useMemo(() => {
    if (!scenarioCategoryFilterActive) return applicationScenarios;
    return applicationScenarios.filter((item) => (item.category || "Custom") === scenarioCategoryFilter);
  }, [applicationScenarios, scenarioCategoryFilter, scenarioCategoryFilterActive]);

  useEffect(() => {
    if (implOptions.length > 0 && !implOptions.some((item) => item.id === selectedImplOptionId)) {
      setSelectedImplOptionId(implOptions[0].id);
    }
  }, [implOptions, selectedImplOptionId]);

  useEffect(() => {
    if (!scenarioCategoryFilterActive) return;
    if (scenarioSelectOptions.length === 0) {
      setSelectedApplicationScenarioId("");
      return;
    }
    if (!scenarioSelectOptions.some((item) => item.id === selectedApplicationScenarioId)) {
      setSelectedApplicationScenarioId(scenarioSelectOptions[0].id);
    }
  }, [scenarioCategoryFilterActive, scenarioSelectOptions, selectedApplicationScenarioId]);

  useEffect(() => {
    async function loadBaseLists(): Promise<void> {
      try {
        setPageError(null);
        const [scenarioRows, opRows] = await Promise.all([getApplicationScenarios(), getOperatingPointSets()]);
        setApplicationScenarios(scenarioRows);
        setOperatingPointSets(opRows);
        if (!selectedApplicationScenarioId && scenarioRows.length > 0) {
          const camera = scenarioRows.find((row) => row.id === "AS_CAMERA_4K60");
          setSelectedApplicationScenarioId((camera || scenarioRows[0]).id);
        }
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "Failed to load power lookup data.");
      }
    }
    void loadBaseLists();
  }, [refreshId, selectedApplicationScenarioId]);

  useEffect(() => {
    if (isCreatingScenario) return;
    if (!selectedApplicationScenario) {
      setScenarioDraft({ name: "", category: "Custom", description: "" });
      return;
    }
    setScenarioDraft({
      name: selectedApplicationScenario.name,
      category: selectedApplicationScenario.category || "Custom",
      description: selectedApplicationScenario.description || "",
    });
  }, [isCreatingScenario, selectedApplicationScenario]);

  useEffect(() => {
    async function loadMappingsAndTree(): Promise<void> {
      if (!selectedImplOptionId) return;
      try {
        setPageError(null);
        const [mappings, tree] = await Promise.all([
          getPowerDatasets(selectedImplOptionId),
          getComponentTree(undefined, selectedImplOptionId),
        ]);
        setPowerDatasets(mappings);
        setComponentTree(tree);
        const nextDataset = mappings.find((item) => item.id === selectedPowerDatasetId) || mappings[0];
        setSelectedPowerDatasetId(nextDataset?.id || "");
        const nextExpanded: Record<string, boolean> = {};
        flattenTree(tree).forEach(({ node, depth }) => {
          if (depth < 2) nextExpanded[node.id] = true;
        });
        setExpanded(nextExpanded);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "Failed to load mapping data.");
      }
    }
    void loadMappingsAndTree();
  }, [selectedImplOptionId, refreshId]);

  useEffect(() => {
    async function loadPowerData(): Promise<void> {
      if (isCreatingScenario) {
        setComposition([]);
        setSummary(null);
        return;
      }
      if (!selectedImplOptionId || !selectedPowerDatasetId || !selectedApplicationScenarioId) {
        setComposition([]);
        setSummary(null);
        return;
      }
      try {
        setLoading(true);
        setPageError(null);
        const [useCases, selections, summaryData] = await Promise.all([
          getModulePowerUseCases(selectedImplOptionId, selectedPowerDatasetId),
          getApplicationScenarioComposition(selectedImplOptionId, selectedPowerDatasetId, selectedApplicationScenarioId),
          getApplicationPowerSummary(selectedImplOptionId, selectedPowerDatasetId, selectedApplicationScenarioId),
        ]);
        setModuleUseCases(useCases);
        setComposition(selections);
        setSummary(summaryData);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "Failed to load application power data.");
      } finally {
        setLoading(false);
      }
    }
    void loadPowerData();
  }, [isCreatingScenario, selectedImplOptionId, selectedPowerDatasetId, selectedApplicationScenarioId, refreshId]);

  useEffect(() => {
    const useCaseByComponent = new Map<string, ModulePowerUseCase[]>();
    moduleUseCases.forEach((row) => {
      if (!row.component_id) return;
      const rows = useCaseByComponent.get(row.component_id) || [];
      rows.push(row);
      useCaseByComponent.set(row.component_id, rows);
    });
    const pinnedIds = new Set(rowDraftPins.current);
    setDrafts((current) => {
      const next: Record<string, RowDraft> = {};
      flattenTree(componentTree).forEach(({ node }) => {
        const currentDraft = current[node.id];
        if (pinnedIds.has(node.id) && currentDraft) {
          const savedPower = moduleUseCases.find(
            (row) =>
              row.component_id === node.id &&
              row.use_case_name === currentDraft.useCaseName &&
              row.operating_point_set_id === currentDraft.operatingPointSetId,
          );
          next[node.id] = {
            ...currentDraft,
            powerMw: savedPower ? String(Number((savedPower.power_value_w * 1000).toFixed(4))) : currentDraft.powerMw,
          };
          return;
        }

        const selection = composition.find((row) => row.component_id === node.id);
        const firstUseCase = useCaseByComponent.get(node.id)?.[0];
        const useCaseName = selection?.use_case_name || firstUseCase?.use_case_name || DEFAULT_USE_CASE;
        const opId = selection?.operating_point_set_id || firstUseCase?.operating_point_set_id || DEFAULT_PROFILE_ID;
        const opName =
          operatingPointSets.find((item) => item.id === opId)?.name ||
          firstUseCase?.operating_point_set_name ||
          (opId === DEFAULT_PROFILE_ID ? DEFAULT_PROFILE_NAME : opId);
        const power = moduleUseCases.find(
          (row) => row.component_id === node.id && row.use_case_name === useCaseName && row.operating_point_set_id === opId,
        );
        next[node.id] = {
          included: selection?.included || false,
          useCaseName,
          operatingPointSetId: opId,
          operatingPointSetName: opName,
          powerMw: power ? String(Number((power.power_value_w * 1000).toFixed(4))) : "",
        };
      });
      return next;
    });
    pinnedIds.forEach((id) => rowDraftPins.current.delete(id));
  }, [componentTree, composition, moduleUseCases, operatingPointSets]);

  const useCasesByComponent = useMemo(() => {
    const map = new Map<string, string[]>();
    moduleUseCases.forEach((row) => {
      if (!row.component_id) return;
      const rows = map.get(row.component_id) || [DEFAULT_USE_CASE];
      rows.push(row.use_case_name || DEFAULT_USE_CASE);
      map.set(row.component_id, Array.from(new Set(rows)));
    });
    flattenTree(componentTree).forEach(({ node }) => {
      if (!map.has(node.id)) map.set(node.id, [DEFAULT_USE_CASE]);
    });
    return map;
  }, [componentTree, moduleUseCases]);

  const componentById = useMemo(() => {
    const map = new Map<string, TreeBlock>();
    flattenTree(componentTree).forEach(({ node }) => map.set(node.id, node));
    return map;
  }, [componentTree]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, TreeBlock[]>();
    flattenTree(componentTree).forEach(({ node }) => {
      if (!node.parent) return;
      const rows = map.get(node.parent) || [];
      rows.push(node);
      map.set(node.parent, rows);
    });
    return map;
  }, [componentTree]);

  const profileById = useMemo(() => {
    const map = new Map<string, OperatingPointSet>();
    operatingPointSets.forEach((op) => map.set(op.id, op));
    if (!map.has(DEFAULT_PROFILE_ID)) {
      map.set(DEFAULT_PROFILE_ID, {
        id: DEFAULT_PROFILE_ID,
        project_id: projectId,
        name: DEFAULT_PROFILE_NAME,
        description: "Default module Profile",
        op_json: "{}",
      });
    }
    return map;
  }, [operatingPointSets, projectId]);

  const profilesByComponent = useMemo(() => {
    const map = new Map<string, Set<string>>();
    moduleUseCases.forEach((row) => {
      if (!row.component_id || !row.operating_point_set_id) return;
      const ids = map.get(row.component_id) || new Set<string>();
      ids.add(row.operating_point_set_id);
      map.set(row.component_id, ids);
    });
    return map;
  }, [moduleUseCases]);

  const includedComponentIds = useMemo(() => new Set(composition.filter((row) => row.included).map((row) => row.component_id)), [composition]);
  const ancestorsByComponent = useMemo(() => {
    const parentById = new Map<string, string | null>();
    flattenTree(componentTree).forEach(({ node }) => parentById.set(node.id, node.parent));
    const map = new Map<string, string[]>();
    parentById.forEach((_parent, componentId) => {
      const ancestors: string[] = [];
      let current = parentById.get(componentId) || null;
      while (current) {
        ancestors.push(current);
        current = parentById.get(current) || null;
      }
      map.set(componentId, ancestors);
    });
    return map;
  }, [componentTree]);
  const descendantsByComponent = useMemo(() => {
    const map = new Map<string, string[]>();
    function collect(node: TreeBlock): string[] {
      const descendants = (node.children || []).flatMap((child) => [child.id, ...collect(child)]);
      map.set(node.id, descendants);
      return descendants;
    }
    componentTree.forEach((node) => collect(node));
    return map;
  }, [componentTree]);
  const rollupsByComponent = useMemo(() => {
    const map = new Map<string, ApplicationPowerSummary["hierarchy_rollups"][number]>();
    (summary?.hierarchy_rollups || []).forEach((row) => map.set(row.parent_component_id, row));
    return map;
  }, [summary]);
  const tableTree = useMemo(() => {
    const baseTree = tableMode === "view" ? pruneTreeByIncludedSelection(componentTree, includedComponentIds) : componentTree;
    return filterTree(baseTree, search.trim().toLowerCase());
  }, [componentTree, includedComponentIds, search, tableMode]);
  const visibleRows = useMemo(() => flattenTree(tableTree), [tableTree]);
  const visibleRowIds = new Set(visibleRows.map(({ node }) => node.id));

  function profileOptionsForNode(node: TreeBlock): OperatingPointSet[] {
    const ids = new Set<string>([DEFAULT_PROFILE_ID]);
    const addProfiles = (componentId: string | null | undefined): void => {
      if (!componentId) return;
      profilesByComponent.get(componentId)?.forEach((id) => ids.add(id));
    };
    addProfiles(node.id);
    addProfiles(node.parent);
    if (node.parent) {
      (childrenByParent.get(node.parent) || []).forEach((sibling) => addProfiles(sibling.id));
    }
    return Array.from(ids)
      .map((id) => profileById.get(id) || {
        id,
        project_id: projectId,
        name: id === DEFAULT_PROFILE_ID ? DEFAULT_PROFILE_NAME : id.replace(/^OP_/, "").replace(/_/g, " "),
        description: "",
        op_json: "{}",
      })
      .sort((a, b) => (a.id === DEFAULT_PROFILE_ID ? -1 : b.id === DEFAULT_PROFILE_ID ? 1 : a.name.localeCompare(b.name)));
  }

  function parentSuggestedUseCase(node: TreeBlock): string | null {
    let currentParentId = node.parent;
    while (currentParentId) {
      const parentDraft = drafts[currentParentId];
      const parentSelection = composition.find((row) => row.component_id === currentParentId);
      const candidate = parentDraft?.useCaseName?.trim() || parentSelection?.use_case_name?.trim();
      if (candidate) return candidate;
      currentParentId = componentById.get(currentParentId)?.parent || null;
    }
    return null;
  }

  function useCaseOptionsForNode(node: TreeBlock): string[] {
    const ownUseCases = useCasesByComponent.get(node.id) || [DEFAULT_USE_CASE];
    const suggested = parentSuggestedUseCase(node);
    if (!suggested || !ownUseCases.includes(suggested)) return ownUseCases;
    return [suggested, ...ownUseCases.filter((item) => item !== suggested)];
  }

  function resolvedUseCaseName(node: TreeBlock, draft: RowDraft | undefined): string {
    const explicit = draft?.useCaseName?.trim();
    if (explicit) return explicit;
    return parentSuggestedUseCase(node) || DEFAULT_USE_CASE;
  }

  function findSavedPower(componentId: string, useCaseName: string, operatingPointSetId: string): ModulePowerUseCase | undefined {
    return moduleUseCases.find(
      (row) => row.component_id === componentId && row.use_case_name === useCaseName && row.operating_point_set_id === operatingPointSetId,
    );
  }

  function selectionForNode(node: TreeBlock): ApplicationScenarioSelection | undefined {
    return composition.find((row) => row.included && row.component_id === node.id);
  }

  function reloadModuleUseCase(node: TreeBlock): void {
    const selection = composition.find((row) => row.component_id === node.id);
    const ownUseCases = moduleUseCases.filter((row) => row.component_id === node.id);
    const firstUseCase = ownUseCases[0];
    const useCaseName = selection?.use_case_name || firstUseCase?.use_case_name || DEFAULT_USE_CASE;
    const opId = selection?.operating_point_set_id || firstUseCase?.operating_point_set_id || DEFAULT_PROFILE_ID;
    const opName =
      profileById.get(opId)?.name ||
      firstUseCase?.operating_point_set_name ||
      (opId === DEFAULT_PROFILE_ID ? DEFAULT_PROFILE_NAME : opId);
    const savedPower = findSavedPower(node.id, useCaseName, opId);
    updateDraft(node.id, {
      included: selection?.included || false,
      useCaseName,
      operatingPointSetId: opId,
      operatingPointSetName: opName,
      powerMw: savedPower ? String(Number((savedPower.power_value_w * 1000).toFixed(4))) : "",
    });
    setActiveNewUseCaseId((current) => (current === node.id ? null : current));
  }

  useEffect(() => {
    if (!activeNewUseCaseId) return;
    const node = componentById.get(activeNewUseCaseId);
    if (!node) return;
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      reloadModuleUseCase(node);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [activeNewUseCaseId, componentById, composition, moduleUseCases, operatingPointSets, profileById]);

  function updateDraft(componentId: string, patch: Partial<RowDraft>): void {
    const emptyDraft: RowDraft = {
      included: false,
      useCaseName: DEFAULT_USE_CASE,
      operatingPointSetId: DEFAULT_PROFILE_ID,
      operatingPointSetName: DEFAULT_PROFILE_NAME,
      powerMw: "",
    };
    setDrafts((current) => ({
      ...current,
      [componentId]: {
        ...emptyDraft,
        ...(current[componentId] || {}),
        ...patch,
      },
    }));
  }

  function setIncludedWithHierarchy(componentId: string, included: boolean): void {
    setDrafts((current) => {
      const next = { ...current };
      const defaultDraft: RowDraft = {
        included: false,
        useCaseName: DEFAULT_USE_CASE,
        operatingPointSetId: DEFAULT_PROFILE_ID,
        operatingPointSetName: DEFAULT_PROFILE_NAME,
        powerMw: "",
      };
      const ensure = (id: string): RowDraft => ({ ...defaultDraft, ...(next[id] || {}) });
      next[componentId] = { ...ensure(componentId), included };
      if (included) {
        (descendantsByComponent.get(componentId) || []).forEach((id) => {
          next[id] = { ...ensure(id), included: false };
        });
        (ancestorsByComponent.get(componentId) || []).forEach((id) => {
          next[id] = { ...ensure(id), included: false };
        });
      }
      return next;
    });
  }

  async function reloadApplicationScenarios(nextSelectedId?: string): Promise<ApplicationScenario[]> {
    const rows = await getApplicationScenarios();
    setApplicationScenarios(rows);
    const nextScenario = rows.find((row) => row.id === nextSelectedId) || rows.find((row) => row.id === selectedApplicationScenarioId) || rows[0];
    setSelectedApplicationScenarioId(nextScenario?.id || "");
    return rows;
  }

  function startNewApplicationScenario(): void {
    setIsCreatingScenario(true);
    setScenarioDraft({ name: "New Application Scenario", category: "Custom", description: "" });
    setComposition([]);
    setSummary(null);
    setTableMode("edit");
  }

  function reloadApplicationScenarioDraft(): void {
    setIsCreatingScenario(false);
    if (!selectedApplicationScenario) {
      setScenarioDraft({ name: "", category: "Custom", description: "" });
      return;
    }
    setScenarioDraft({
      name: selectedApplicationScenario.name,
      category: selectedApplicationScenario.category || "Custom",
      description: selectedApplicationScenario.description || "",
    });
    setRefreshId((current) => current + 1);
  }

  async function saveApplicationScenario(): Promise<void> {
    if (!scenarioDraft.name.trim()) {
      setPageError("Application scenario name is required.");
      return;
    }
    try {
      setSaving("application-scenario");
      setPageError(null);
      const payload = {
        project_id: projectId,
        name: scenarioDraft.name.trim(),
        category: scenarioDraft.category.trim() || "Custom",
        description: scenarioDraft.description,
      };
      const savedScenario = isCreatingScenario || !selectedApplicationScenarioId
        ? await createApplicationScenario(payload)
        : await updateApplicationScenario(selectedApplicationScenarioId, payload);
      setIsCreatingScenario(false);
      await reloadApplicationScenarios(savedScenario.id);
      setRefreshId((current) => current + 1);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to save application scenario.");
    } finally {
      setSaving(null);
    }
  }

  async function removeApplicationScenario(): Promise<void> {
    if (!selectedApplicationScenarioId || isCreatingScenario) return;
    if (!window.confirm(`Delete application scenario "${selectedApplicationScenario?.name || selectedApplicationScenarioId}" and its saved composition?`)) return;
    try {
      setSaving("application-scenario");
      setPageError(null);
      await deleteApplicationScenario(selectedApplicationScenarioId);
      setIsCreatingScenario(false);
      await reloadApplicationScenarios();
      setRefreshId((current) => current + 1);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to delete application scenario.");
    } finally {
      setSaving(null);
    }
  }

  async function saveModuleUseCase(node: TreeBlock): Promise<void> {
    const draft = drafts[node.id];
    if (!draft) return;
    const powerMw = Number(draft.powerMw);
    const useCaseName = resolvedUseCaseName(node, draft);
    if (!useCaseName.trim()) {
      setPageError("Use case name is required.");
      return;
    }
    const isNewProfile = draft.operatingPointSetId === NEW_PROFILE_VALUE;
    const profileName = isNewProfile ? draft.operatingPointSetName.trim() : (profileById.get(draft.operatingPointSetId)?.name || draft.operatingPointSetName || DEFAULT_PROFILE_NAME);
    const profileId = isNewProfile ? profileIdFromName(profileName) : (draft.operatingPointSetId || DEFAULT_PROFILE_ID);
    if (!profileName.trim()) {
      setPageError("Profile is required before saving a module use case.");
      return;
    }
    if (!Number.isFinite(powerMw) || powerMw < 0) {
      setPageError("Power value must be a non-negative number in mW.");
      return;
    }
    try {
      setSaving(node.id);
      setPageError(null);
      const savedUseCase = await upsertModulePowerUseCase({
        project_id: projectId,
        impl_option_id: selectedImplOptionId,
        physical_mapping_id: selectedPowerDatasetId,
        component_id: node.id,
        component_name: node.name,
        use_case_name: useCaseName,
        operating_point_set_id: profileId,
        operating_point_set_name: profileName,
        power_value_w: powerMw / 1000,
        confidence: "draft",
      });
      rowDraftPins.current.add(node.id);
      setModuleUseCases((current) => [
        savedUseCase,
        ...current.filter((row) => row.id !== savedUseCase.id),
      ]);
      setOperatingPointSets((current) => {
        if (current.some((item) => item.id === savedUseCase.operating_point_set_id)) return current;
        return [
          ...current,
          {
            id: savedUseCase.operating_point_set_id,
            project_id: savedUseCase.project_id,
            name: savedUseCase.operating_point_set_name,
            description: "",
            op_json: "{}",
          },
        ];
      });
      updateDraft(node.id, {
        useCaseName: savedUseCase.use_case_name || DEFAULT_USE_CASE,
        operatingPointSetId: savedUseCase.operating_point_set_id,
        operatingPointSetName: savedUseCase.operating_point_set_name,
        powerMw: String(Number((savedUseCase.power_value_w * 1000).toFixed(4))),
      });
      if (
        selectedApplicationScenarioId &&
        composition.some(
          (row) =>
            row.included &&
            row.component_id === savedUseCase.component_id &&
            row.use_case_name === savedUseCase.use_case_name &&
            row.operating_point_set_id === savedUseCase.operating_point_set_id,
        )
      ) {
        const summaryData = await getApplicationPowerSummary(selectedImplOptionId, selectedPowerDatasetId, selectedApplicationScenarioId);
        setSummary(summaryData);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to save module use case.");
    } finally {
      setSaving(null);
    }
  }

  async function saveComposition(): Promise<void> {
    const selections = flattenTree(componentTree)
      .map(({ node }) => {
        const draft = drafts[node.id];
        const existing = composition.find((row) => row.component_id === node.id);
        const savedPower = draft && draft.operatingPointSetId !== NEW_PROFILE_VALUE
          ? findSavedPower(node.id, draft.useCaseName, draft.operatingPointSetId)
          : undefined;
        return { node, draft, existing, savedPower };
      })
      .filter(({ draft, existing, savedPower }) => Boolean(draft && draft.operatingPointSetId !== NEW_PROFILE_VALUE && (draft.included || existing || savedPower)))
      .map(({ node, draft }) => ({
        component_id: node.id,
        component_name: node.name,
        use_case_name: resolvedUseCaseName(node, draft),
        operating_point_set_id: draft!.operatingPointSetId,
        included: draft!.included,
      }));
    try {
      setSaving("composition");
      setPageError(null);
      const result = await updateApplicationScenarioComposition({
        project_id: projectId,
        impl_option_id: selectedImplOptionId,
        physical_mapping_id: selectedPowerDatasetId,
        application_scenario_id: selectedApplicationScenarioId,
        selections,
      });
      setComposition(result.selections);
      setSummary(result.summary);
      setRefreshId((current) => current + 1);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to save application scenario composition.");
    } finally {
      setSaving(null);
    }
  }

  async function removeModuleUseCase(node: TreeBlock, savedPower: ModulePowerUseCase | undefined): Promise<void> {
    if (!savedPower) return;
    try {
      setSaving(node.id);
      setPageError(null);
      await deleteModulePowerUseCase(savedPower.id);
      rowDraftPins.current.add(node.id);
      setModuleUseCases((current) => current.filter((row) => row.id !== savedPower.id));
      setComposition((current) =>
        current.filter(
          (row) =>
            !(
              row.component_id === savedPower.component_id &&
              row.use_case_name === savedPower.use_case_name &&
              row.operating_point_set_id === savedPower.operating_point_set_id
            ),
        ),
      );
      updateDraft(node.id, {
        included: false,
        useCaseName: DEFAULT_USE_CASE,
        operatingPointSetId: DEFAULT_PROFILE_ID,
        operatingPointSetName: DEFAULT_PROFILE_NAME,
        powerMw: "",
      });
      if (selectedApplicationScenarioId) {
        const summaryData = await getApplicationPowerSummary(selectedImplOptionId, selectedPowerDatasetId, selectedApplicationScenarioId);
        setSummary(summaryData);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to delete module use case.");
    } finally {
      setSaving(null);
    }
  }

  function toggleExpand(id: string): void {
    setExpanded((current) => ({ ...current, [id]: !current[id] }));
  }

  function expandAll(): void {
    const nextExpanded: Record<string, boolean> = {};
    flattenTree(componentTree).forEach(({ node }) => {
      if ((node.children || []).length > 0) nextExpanded[node.id] = true;
    });
    setExpanded(nextExpanded);
  }

  function collapseToSubsystems(): void {
    const nextExpanded: Record<string, boolean> = {};
    flattenTree(componentTree).forEach(({ node, depth }) => {
      if ((node.children || []).length > 0) nextExpanded[node.id] = depth === 0;
    });
    setExpanded(nextExpanded);
  }

  function renderRows(nodes: TreeBlock[], depth = 0): React.ReactNode[] {
    return nodes.flatMap((node) => {
      if (!visibleRowIds.has(node.id)) return [];
      const draft = drafts[node.id] || {
        included: false,
        useCaseName: DEFAULT_USE_CASE,
        operatingPointSetId: DEFAULT_PROFILE_ID,
        operatingPointSetName: DEFAULT_PROFILE_NAME,
        powerMw: "",
      };
      const hasChildren = (node.children || []).length > 0;
      const isOpen = tableMode === "view" ? true : (expanded[node.id] ?? false);
      const useCases = useCaseOptionsForNode(node);
      const suggestedUseCase = parentSuggestedUseCase(node);
      const canUseParentPlaceholder = Boolean(suggestedUseCase && !useCases.includes(suggestedUseCase));
      const selectedUseCaseExists = useCases.includes(draft.useCaseName);
      const useCaseSelectValue = selectedUseCaseExists ? draft.useCaseName : NEW_USE_CASE_VALUE;
      const profileOptions = profileOptionsForNode(node);
      const selectedProfileExists = profileOptions.some((op) => op.id === draft.operatingPointSetId);
      const profileSelectValue = selectedProfileExists ? draft.operatingPointSetId : NEW_PROFILE_VALUE;
      const savedPower = draft.operatingPointSetId === NEW_PROFILE_VALUE ? undefined : findSavedPower(node.id, draft.useCaseName, draft.operatingPointSetId);
      const savedPowerMw = savedPower ? Number((savedPower.power_value_w * 1000).toFixed(4)) : null;
      const draftPowerMw = draft.powerMw === "" ? null : Number(draft.powerMw);
      const powerDirty = savedPowerMw !== null && draftPowerMw !== null && Number.isFinite(draftPowerMw) && Math.abs(draftPowerMw - savedPowerMw) > 0.0001;
      const selectedRow = selectionForNode(node);
      const selectedPower = selectedRow ? findSavedPower(node.id, selectedRow.use_case_name, selectedRow.operating_point_set_id) : undefined;
      const selectedProfileName = selectedRow ? profileById.get(selectedRow.operating_point_set_id)?.name || selectedRow.operating_point_set_id : "-";
      const rollup = rollupsByComponent.get(node.id);
      const rollupBadge = rollup ? <Badge tone={rollupTone(rollup.status)}>{rollupLabel(rollup)}</Badge> : null;
      if (tableMode === "view") {
        const row = (
          <tr key={node.id} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="w-[32rem] px-3 py-2">
              <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 18}px` }}>
                {hasChildren ? <span className="grid h-7 w-7 place-items-center text-slate-400"><ChevronDown size={15} /></span> : <span className="h-7 w-7" />}
                <ResourceIcon resource={node.resource} />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`truncate font-medium ${selectedRow ? "text-slate-900" : "text-slate-500"}`}>{node.name}</span>
                    {selectedRow?.included && hasChildren && <Badge tone="violet">replaces subtree</Badge>}
                    {rollupBadge}
                  </div>
                </div>
              </div>
            </td>
            <td className="w-[18rem] px-3 py-2 text-sm text-slate-700">{selectedRow?.use_case_name || "-"}</td>
            <td className="w-[18rem] px-3 py-2 text-sm text-slate-700">{selectedProfileName}</td>
            <td className="w-36 px-3 py-2 text-sm font-semibold text-slate-900">{selectedRow ? formatMw(selectedPower?.power_value_w ?? null) : "-"}</td>
          </tr>
        );
        return [row, ...(hasChildren ? renderRows(node.children, depth + 1) : [])];
      }
      const row = (
        <tr key={node.id} className="border-b border-slate-100 hover:bg-slate-50">
          <td className="w-[32rem] px-3 py-2">
            <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 18}px` }}>
              {hasChildren ? (
                <button className="grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-white" onClick={() => toggleExpand(node.id)} type="button">
                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
              ) : (
                <span className="h-7 w-7" />
              )}
              <ResourceIcon resource={node.resource} />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-slate-900">{node.name}</span>
                  {draft.included && hasChildren && <Badge tone="violet">replaces subtree</Badge>}
                  {rollupBadge}
                </div>
              </div>
            </div>
          </td>
          <td className="w-[18rem] px-3 py-2">
            <div className="space-y-2">
              <select
                className="h-9 w-full min-w-[16rem] rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-indigo-400"
                value={useCaseSelectValue}
                onChange={(event) => {
                  if (event.target.value === NEW_USE_CASE_VALUE) {
                    setActiveNewUseCaseId(node.id);
                    updateDraft(node.id, { included: false, useCaseName: "", powerMw: "" });
                  } else {
                    setActiveNewUseCaseId((current) => (current === node.id ? null : current));
                    const nextPower = findSavedPower(node.id, event.target.value, draft.operatingPointSetId);
                    updateDraft(node.id, {
                      included: false,
                      useCaseName: event.target.value,
                      powerMw: nextPower ? String(Number((nextPower.power_value_w * 1000).toFixed(4))) : "",
                    });
                  }
                }}
              >
                {useCases.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
                <option value={NEW_USE_CASE_VALUE}>+ New use case...</option>
              </select>
              {!selectedUseCaseExists && (
                <input
                  autoFocus
                  className="h-9 w-full rounded-lg border border-indigo-200 bg-indigo-50/40 px-2 text-sm outline-none focus:border-indigo-400"
                  placeholder={canUseParentPlaceholder ? `Use parent: ${suggestedUseCase}` : "Enter new use case name"}
                  value={draft.useCaseName}
                  onChange={(event) => updateDraft(node.id, { useCaseName: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key !== "Escape") return;
                    event.stopPropagation();
                    reloadModuleUseCase(node);
                  }}
                />
              )}
            </div>
          </td>
          <td className="w-[18rem] px-3 py-2">
            <div className="space-y-2">
              <select
                className="h-9 w-full min-w-[16rem] rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-indigo-400"
                value={profileSelectValue}
                onChange={(event) => {
                  if (event.target.value === NEW_PROFILE_VALUE) {
                    updateDraft(node.id, {
                      included: false,
                      operatingPointSetId: NEW_PROFILE_VALUE,
                      operatingPointSetName: "",
                      powerMw: "",
                    });
                    return;
                  }
                  const selectedProfile = profileById.get(event.target.value);
                  const nextPower = findSavedPower(node.id, draft.useCaseName, event.target.value);
                  updateDraft(node.id, {
                    included: false,
                    operatingPointSetId: event.target.value,
                    operatingPointSetName: selectedProfile?.name || event.target.value,
                    powerMw: nextPower ? String(Number((nextPower.power_value_w * 1000).toFixed(4))) : "",
                  });
                }}
              >
                {profileOptions.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name}
                  </option>
                ))}
                <option value={NEW_PROFILE_VALUE}>+ New profile...</option>
              </select>
              {!selectedProfileExists && (
                <input
                  className="h-9 w-full rounded-lg border border-indigo-200 bg-indigo-50/40 px-2 text-sm outline-none focus:border-indigo-400"
                  placeholder="Enter new profile name"
                  value={draft.operatingPointSetName}
                  onChange={(event) => updateDraft(node.id, { operatingPointSetName: event.target.value })}
                />
              )}
            </div>
          </td>
          <td className="w-36 px-3 py-2">
            <input
              className="h-9 w-28 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm outline-none focus:border-indigo-400"
              min={0}
              step="0.1"
              type="number"
              value={draft.powerMw}
              onChange={(event) => updateDraft(node.id, { powerMw: event.target.value })}
            />
          </td>
          <td className="w-36 px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={saving === node.id}
                onClick={() => void saveModuleUseCase(node)}
                type="button"
                title={savedPower ? "Update saved module power" : "Create saved module power"}
              >
                <Save size={14} />
              </button>
              <button
                className={`grid h-9 w-9 place-items-center rounded-lg border bg-white hover:bg-slate-50 disabled:opacity-60 ${
                  powerDirty ? "border-amber-200 text-amber-600 shadow-sm shadow-amber-100" : "border-slate-200 text-slate-500"
                }`}
                disabled={saving === node.id}
                onClick={() => reloadModuleUseCase(node)}
                type="button"
                title={powerDirty && savedPowerMw !== null ? `Reload saved value: ${savedPowerMw} mW` : "Reload this row from saved data"}
              >
                <RotateCcw size={14} />
              </button>
              <button
                className="grid h-9 w-9 place-items-center rounded-lg border border-rose-100 bg-white text-rose-500 hover:bg-rose-50 disabled:opacity-40"
                disabled={!savedPower || saving === node.id}
                onClick={() => void removeModuleUseCase(node, savedPower)}
                type="button"
                title={savedPower ? "Delete this saved module use case" : "Save a module use case before deleting"}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </td>
          <td className="w-32 px-3 py-2 text-center">
            <input
              checked={draft.included}
              className="h-4 w-4 accent-indigo-600"
              disabled={!savedPower}
              title={savedPower ? "Include this module use case in the application scenario" : "Save a real Profile/power value before including"}
              type="checkbox"
              onChange={(event) => setIncludedWithHierarchy(node.id, event.target.checked)}
            />
          </td>
        </tr>
      );
      return [row, ...(hasChildren && isOpen ? renderRows(node.children, depth + 1) : [])];
    });
  }

  return (
    <div className="space-y-6">
      <Card title="Application Power" subtitle="Module use case/Profile power library plus scenario composition across power datasets." icon={Zap}>
        <div className="grid gap-4 xl:grid-cols-3">
          <FieldLabel htmlFor="power-impl" label="Implementation">
            <select id="power-impl" className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" value={selectedImplOptionId} onChange={(e) => setSelectedImplOptionId(e.target.value)}>
              {implOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} - {item.name}
                </option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel htmlFor="power-dataset" label="Power Dataset">
            <select id="power-dataset" className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" value={selectedPowerDatasetId} onChange={(e) => setSelectedPowerDatasetId(e.target.value)}>
              {powerDatasets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <div className="text-xs text-slate-500">
              {selectedPowerDataset
                ? `${selectedPowerDataset.development_stage.replace(/_/g, " ")} / ${selectedPowerDataset.source_type.replace(/_/g, " ")} / ${selectedPowerDataset.dataset_version} / ${selectedPowerDataset.confidence}`
                : "No power dataset"}
            </div>
          </FieldLabel>
          <div className="flex items-end">
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => setRefreshId((current) => current + 1)} type="button">
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
        </div>
      </Card>

      {pageError && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={16} />
            {pageError}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Scenario Total</div>
          <div className="mt-2 text-3xl font-semibold text-slate-950">{formatMw(summary?.total_additive_power_w)}</div>
          <div className="mt-1 text-sm text-slate-500">Sum of checked module use cases</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Selected Modules</div>
          <div className="mt-2 text-3xl font-semibold text-slate-950">{summary?.selected_count ?? 0}</div>
          <div className="mt-1 text-sm text-slate-500">Included in this application scenario</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Missing Power Values</div>
          <div className="mt-2 text-3xl font-semibold text-slate-950">{summary?.missing_count ?? 0}</div>
          <div className="mt-1 text-sm text-slate-500">Checked rows must have saved Profile power</div>
        </div>
      </div>

      <Card
        title="Module Use Case Library and Scenario Composition"
        subtitle={tableMode === "view" ? "Read-only scenario composition: selected modules plus their parent hierarchy." : "Save module use case/Profile power first, then check rows to include them in the selected application scenario."}
        icon={CheckCircle2}
        right={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
              <button
                className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium ${tableMode === "view" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}
                onClick={() => {
                  setIsCreatingScenario(false);
                  setTableMode("view");
                }}
                type="button"
              >
                <Eye size={14} />
                View
              </button>
              <button
                className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium ${tableMode === "edit" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}
                onClick={() => setTableMode("edit")}
                type="button"
              >
                <Pencil size={14} />
                Edit
              </button>
            </div>
            {tableMode === "edit" && (
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
                disabled={isCreatingScenario || !selectedApplicationScenarioId || saving === "composition"}
                onClick={() => void saveComposition()}
                title={isCreatingScenario ? "Save the application scenario before saving composition" : "Save scenario composition"}
                type="button"
              >
                <Save size={15} />
                Save Scenario Composition
              </button>
            )}
          </div>
        }
      >
        <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 xl:grid-cols-[1.4fr_0.8fr_1.6fr_auto]">
          <FieldLabel htmlFor="scenario-select" label="Application Scenario">
            <select
              id="scenario-select"
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              value={
                isCreatingScenario
                  ? NEW_APPLICATION_SCENARIO_VALUE
                  : scenarioSelectOptions.some((item) => item.id === selectedApplicationScenarioId)
                    ? selectedApplicationScenarioId
                    : ""
              }
              onChange={(event) => {
                if (event.target.value === NEW_APPLICATION_SCENARIO_VALUE) {
                  startNewApplicationScenario();
                  return;
                }
                setIsCreatingScenario(false);
                setSelectedApplicationScenarioId(event.target.value);
              }}
            >
              {scenarioSelectOptions.length === 0 && <option value="">No scenarios in this category</option>}
              {scenarioSelectOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              {tableMode === "edit" && <option value={NEW_APPLICATION_SCENARIO_VALUE}>+ New application scenario...</option>}
            </select>
            {isCreatingScenario && (
              <input
                className="mt-2 h-10 rounded-xl border border-indigo-200 bg-indigo-50/40 px-3 text-sm outline-none focus:border-indigo-400"
                placeholder="Enter new scenario name"
                value={scenarioDraft.name}
                onChange={(event) => setScenarioDraft((current) => ({ ...current, name: event.target.value }))}
              />
            )}
          </FieldLabel>
          <FieldLabel htmlFor="scenario-category" label="Category">
            {tableMode === "edit" ? (
              <>
                <select
                  id="scenario-category"
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400"
                  value={scenarioCategories.includes(scenarioDraft.category) ? scenarioDraft.category : NEW_SCENARIO_CATEGORY_VALUE}
                  onChange={(event) => {
                    if (event.target.value === NEW_SCENARIO_CATEGORY_VALUE) {
                      setScenarioDraft((current) => ({ ...current, category: "" }));
                      return;
                    }
                    setScenarioDraft((current) => ({ ...current, category: event.target.value }));
                  }}
                >
                  {scenarioCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                  <option value={NEW_SCENARIO_CATEGORY_VALUE}>+ New category...</option>
                </select>
                {!scenarioCategories.includes(scenarioDraft.category) && (
                  <input
                    className="mt-2 h-10 rounded-xl border border-indigo-200 bg-indigo-50/40 px-3 text-sm outline-none focus:border-indigo-400"
                    placeholder="Enter new category"
                    value={scenarioDraft.category}
                    onChange={(event) => setScenarioDraft((current) => ({ ...current, category: event.target.value }))}
                  />
                )}
              </>
            ) : (
              <select
                id="scenario-category"
                className={`h-10 rounded-xl border px-3 text-sm outline-none ${
                  scenarioCategoryFilterActive ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700"
                }`}
                value={scenarioCategoryFilter}
                onChange={(event) => setScenarioCategoryFilter(event.target.value)}
              >
                <option value={ALL_SCENARIO_CATEGORIES_VALUE}>All categories</option>
                {scenarioCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            )}
          </FieldLabel>
          <FieldLabel htmlFor="scenario-description" label="Description">
            <input
              id="scenario-description"
              className={`h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 ${tableMode === "view" ? "bg-slate-100 text-slate-500" : "bg-white"}`}
              readOnly={tableMode === "view"}
              value={scenarioDraft.description}
              onChange={(event) => setScenarioDraft((current) => ({ ...current, description: event.target.value }))}
            />
          </FieldLabel>
          <div className="flex items-end gap-2">
            {tableMode === "edit" && (
              <button
                aria-label="Save application scenario"
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={saving === "application-scenario"}
                onClick={() => void saveApplicationScenario()}
                title={isCreatingScenario ? "Create application scenario" : "Save application scenario"}
                type="button"
              >
                <Save size={16} />
              </button>
            )}
            <button
              aria-label="Reload application scenario"
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-60"
              disabled={saving === "application-scenario"}
              onClick={reloadApplicationScenarioDraft}
              title="Reload application scenario"
              type="button"
            >
              <RotateCcw size={16} />
            </button>
            {tableMode === "edit" && (
              <button
                aria-label="Delete application scenario"
                className="grid h-10 w-10 place-items-center rounded-xl border border-rose-100 bg-white text-rose-500 hover:bg-rose-50 disabled:opacity-40"
                disabled={isCreatingScenario || !selectedApplicationScenarioId || saving === "application-scenario"}
                onClick={() => void removeApplicationScenario()}
                title="Delete application scenario"
                type="button"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {tableMode === "edit" && (
            <div className="flex items-center gap-2">
              <button
                aria-label="Collapse to first-level subsystems"
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={collapseToSubsystems}
                title="Collapse to first-level subsystems"
                type="button"
              >
                <ChevronRight size={15} />
              </button>
              <button
                aria-label="Expand all modules"
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={expandAll}
                title="Expand all modules"
                type="button"
              >
                <ChevronDown size={15} />
              </button>
            </div>
          )}
          <div className="flex min-w-[20rem] max-w-md flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search size={16} className="text-slate-400" />
            <input className="w-full bg-transparent text-sm outline-none" placeholder="Search module" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className={`w-full table-fixed text-left ${tableMode === "view" ? "min-w-[860px]" : "min-w-[1280px]"}`}>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              {tableMode === "view" ? (
                <tr>
                  <th className="w-[32rem] px-3 py-3">Module</th>
                  <th className="w-[18rem] px-3 py-3">Use Case</th>
                  <th className="w-[18rem] px-3 py-3">Profile</th>
                  <th className="w-36 px-3 py-3">Power</th>
                </tr>
              ) : (
                <tr>
                  <th className="w-[32rem] px-3 py-3">Module</th>
                  <th className="w-[18rem] px-3 py-3">Use Case</th>
                  <th className="w-[18rem] px-3 py-3">Profile</th>
                  <th className="w-36 px-3 py-3">Power</th>
                  <th className="w-36 px-3 py-3">Library</th>
                  <th className="w-32 px-3 py-3 text-center">Use In Scenario</th>
                </tr>
              )}
            </thead>
            <tbody>{loading ? <tr><td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={tableMode === "view" ? 4 : 6}>Loading power data...</td></tr> : renderRows(tableTree)}</tbody>
          </table>
        </div>

        {tableMode === "edit" ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <Badge tone="blue">Default is only a use case name</Badge>
            <Badge tone="amber">A row can be checked only after Profile and power are saved</Badge>
            <Badge tone="green">Scenario total is checked-row sum</Badge>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <Badge tone="green">Read-only selected scenario composition</Badge>
            <Badge tone="blue">Parent rows preserve hierarchy</Badge>
            {scenarioCategoryFilterActive && <Badge tone="amber">Category filter: {scenarioCategoryFilter}</Badge>}
          </div>
        )}
      </Card>
    </div>
  );
}
