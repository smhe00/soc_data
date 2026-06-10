import React, { useEffect, useState } from "react";
import { Layers3, SplitSquareVertical, Package, Gauge } from "lucide-react";
import { Badge, Card, FieldLabel, TextInput, UnitNumberInput, SegmentedControl, StepperInput } from "./ui";
import { getImplOptionDetail, updateImplOptionDetail, type ImplOptionDetailResponse } from "../api/impl_options";
import type { ImplOption } from "../types/impl_option";

export interface StackTierDefinition {
  id: string;
  name: string;
  role: string;
  process: string;
  thicknessUm: number;
  color: string;
}

export interface StackInterfaceDefinition {
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

export type StackImplementationType = "Monolithic" | "Wafer-to-Wafer" | "2.5D Interposer";

export interface PackageEscapeDefinition {
  pitchUm: number;
  keepOutUm: number;
  description: string;
}

export type DieSide = "Face" | "Back";

export interface ImplementationViewProps {
  implOptions: ImplOption[];
}

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

const orientationShortLabels: Record<StackInterfaceDefinition["orientation"], string> = {
  "Face-to-Face": "F-F",
  "Face-to-Back": "F-B",
  "Back-to-Face": "B-F",
  "Back-to-Back": "B-B",
};

export function getUpperInterfaceSide(orientation: StackInterfaceDefinition["orientation"]): DieSide {
  return orientation.startsWith("Face") ? "Face" : "Back";
}

export function getLowerInterfaceSide(orientation: StackInterfaceDefinition["orientation"]): DieSide {
  return orientation.endsWith("Face") ? "Face" : "Back";
}

export function getOppositeSide(side: DieSide): DieSide {
  return side === "Face" ? "Back" : "Face";
}

export function usesUpperTsv(interfaceItem: StackInterfaceDefinition): boolean {
  return interfaceItem.interconnect.includes("TSV") && getUpperInterfaceSide(interfaceItem.orientation) === "Back";
}

export function usesLowerTsv(interfaceItem: StackInterfaceDefinition): boolean {
  return interfaceItem.interconnect.includes("TSV") && getLowerInterfaceSide(interfaceItem.orientation) === "Back";
}

export function makeOrientation(upperSide: DieSide, lowerSide: DieSide): StackInterfaceDefinition["orientation"] {
  return `${upperSide}-to-${lowerSide}` as StackInterfaceDefinition["orientation"];
}

export function getAllowedOrientationOptions(index: number, interfaces: StackInterfaceDefinition[]): StackInterfaceDefinition["orientation"][] {
  if (index === 0) return orientationOptions;
  const previous = interfaces[index - 1];
  if (!previous) return orientationOptions;
  const requiredUpperSide = getOppositeSide(getLowerInterfaceSide(previous.orientation));
  return orientationOptions.filter((orientation) => getUpperInterfaceSide(orientation) === requiredUpperSide);
}

export function normalizeInterfaceOrientations(interfaces: StackInterfaceDefinition[]): StackInterfaceDefinition[] {
  return interfaces.reduce<StackInterfaceDefinition[]>((normalized, item, index) => {
    if (index === 0) return [item];
    const previous = normalized[index - 1];
    const requiredUpperSide = getOppositeSide(getLowerInterfaceSide(previous.orientation));
    if (getUpperInterfaceSide(item.orientation) === requiredUpperSide) return [...normalized, item];
    return [...normalized, { ...item, orientation: makeOrientation(requiredUpperSide, getLowerInterfaceSide(item.orientation)) }];
  }, []);
}

export function withInterfaceParameterDefaults(interfaceItem: StackInterfaceDefinition): StackInterfaceDefinition {
  return {
    ...interfaceItem,
    hbPitchUm: interfaceItem.interconnect.includes("HB") && interfaceItem.hbPitchUm === 0 ? 0.8 : interfaceItem.hbPitchUm,
    upperTsvPitchUm: usesUpperTsv(interfaceItem) && interfaceItem.upperTsvPitchUm === 0 ? 5 : interfaceItem.upperTsvPitchUm,
    upperTsvKeepOutUm: usesUpperTsv(interfaceItem) && interfaceItem.upperTsvKeepOutUm === 0 ? 8 : interfaceItem.upperTsvKeepOutUm,
    lowerTsvPitchUm: usesLowerTsv(interfaceItem) && interfaceItem.lowerTsvPitchUm === 0 ? 5 : interfaceItem.lowerTsvPitchUm,
    lowerTsvKeepOutUm: usesLowerTsv(interfaceItem) && interfaceItem.lowerTsvKeepOutUm === 0 ? 8 : interfaceItem.lowerTsvKeepOutUm,
  };
}

export function normalizeInterfaces(interfaces: StackInterfaceDefinition[]): StackInterfaceDefinition[] {
  return normalizeInterfaceOrientations(interfaces).map(withInterfaceParameterDefaults);
}

export function defaultInterfacesForTiers(tierDefinitions: StackTierDefinition[], current: StackInterfaceDefinition[] = []): StackInterfaceDefinition[] {
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

export function implementationTypeFromApi(value: string): StackImplementationType {
  return stackTypeOptions.includes(value as StackImplementationType) ? (value as StackImplementationType) : "Wafer-to-Wafer";
}

export function tiersFromImplementation(implementation: ImplOptionDetailResponse): StackTierDefinition[] {
  return implementation.tiers.map((tier, index) => ({
    id: tier.id,
    name: tier.name,
    process: tier.process,
    role: tier.role,
    thicknessUm: tier.thickness_um,
    color: stackTierColors[index] ?? stackTierColors[stackTierColors.length - 1],
  }));
}

export function interfacesFromImplementation(implementation: ImplOptionDetailResponse): StackInterfaceDefinition[] {
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

export function getBottomInterface(tiers: StackTierDefinition[], interfaces: StackInterfaceDefinition[]): StackInterfaceDefinition | undefined {
  if (tiers.length < 2) return undefined;
  const upperTier = tiers[tiers.length - 2];
  const bottomTier = tiers[tiers.length - 1];
  return interfaces.find((item) => item.fromTierId === upperTier.id && item.toTierId === bottomTier.id);
}

export function getDerivedBottomBumpSide(tiers: StackTierDefinition[], interfaces: StackInterfaceDefinition[]): "Face" | "Back" {
  const bottomInterface = getBottomInterface(tiers, interfaces);
  if (!bottomInterface) return "Face";
  return getLowerInterfaceSide(bottomInterface.orientation) === "Face" ? "Back" : "Face";
}

export function requiresPackageTsv(tiers: StackTierDefinition[], interfaces: StackInterfaceDefinition[]): boolean {
  return getDerivedBottomBumpSide(tiers, interfaces) === "Back";
}

export function getTierSurfaceSides(tiers: StackTierDefinition[], interfaces: StackInterfaceDefinition[], index: number): { top: DieSide; bottom: DieSide } {
  const tier = tiers[index];
  const interfaceAbove = interfaces.find((item) => item.fromTierId === tiers[index - 1]?.id && item.toTierId === tier.id);
  const interfaceBelow = interfaces.find((item) => item.fromTierId === tier.id && item.toTierId === tiers[index + 1]?.id);
  const top = interfaceAbove ? getLowerInterfaceSide(interfaceAbove.orientation) : interfaceBelow ? getOppositeSide(getUpperInterfaceSide(interfaceBelow.orientation)) : getOppositeSide(getDerivedBottomBumpSide(tiers, interfaces));
  const bottom = interfaceBelow ? getUpperInterfaceSide(interfaceBelow.orientation) : getOppositeSide(top);
  return { top, bottom };
}

export function StackCrossSection({
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

export function ImplementationView({ implOptions }: ImplementationViewProps): JSX.Element {
  const [selectedImplOptionId, setSelectedImplOptionId] = useState<string>("S2");
  const [stackType, setStackType] = useState<StackImplementationType>("Wafer-to-Wafer");
  const [tiers, setTiers] = useState<StackTierDefinition[]>(defaultStackTiers);
  const [interfaces, setInterfaces] = useState<StackInterfaceDefinition[]>(defaultStackInterfaces);
  const [packageEscape, setPackageEscape] = useState<PackageEscapeDefinition>(defaultPackageEscape);
  const [implementationLoading, setImplementationLoading] = useState(false);
  const [implementationSaving, setImplementationSaving] = useState(false);
  const [implementationMessage, setImplementationMessage] = useState<string | null>(null);
  const [implementationError, setImplementationError] = useState<string | null>(null);
  const selectedImplOption = implOptions.find((impl_option) => impl_option.id === selectedImplOptionId) ?? implOptions[0];
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
      if (!selectedImplOptionId) return;
      setImplementationLoading(true);
      setImplementationError(null);
      setImplementationMessage(null);
      try {
        const implementation = await getImplOptionDetail(selectedImplOptionId);
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
  }, [selectedImplOptionId]);

  const applyImplOptionDefaults = (implOptionId: string): void => {
    setSelectedImplOptionId(implOptionId);
    if (implOptionId === "S1") {
      setStackType("Monolithic");
      setTiers([{ ...defaultStackTiers[0], id: "T1", name: "Single Die", role: "Monolithic SoC", process: "N3E", thicknessUm: 70 }]);
      setInterfaces([]);
      setPackageEscape(defaultPackageEscape);
      return;
    }
    if (implOptionId === "S3") {
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
      const result = await updateImplOptionDetail(selectedImplOptionId, {
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
        title="实现方案物理架构/配置"
        subtitle="项目实现选项对应的封装与叠层配置"
        icon={Package}
        right={
          <button
            className="inline-flex h-9 items-center rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={implementationLoading || implementationSaving || !selectedImplOptionId}
            onClick={saveImplementation}
            type="button"
          >
            {implementationSaving ? "Saving..." : "Save"}
          </button>
        }
      >
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_170px_110px_1fr]">
          <FieldLabel htmlFor="implementation-impl_option" label="实现选项">
            <select
              id="implementation-impl_option"
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
              onChange={(event) => applyImplOptionDefaults(event.target.value)}
              value={selectedImplOption?.id ?? selectedImplOptionId}
            >
              {implOptions.map((impl_option) => (
                <option key={impl_option.id} value={impl_option.id}>
                  {impl_option.id} - {impl_option.name}
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
            <div className="bg-white px-4 py-5 text-sm text-slate-500">Single-layer implementation: no inter-layer interface is required for this impl_option.</div>
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
