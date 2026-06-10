import React from "react";
import { SplitSquareVertical, AlertTriangle, BarChart3 } from "lucide-react";
import { Badge, Card, riskTone, formatNumber } from "./ui";
import type { Scenario } from "../types/scenario";

export interface CompareViewProps {
  scenarios: Scenario[];
  loading: boolean;
  error: string | null;
}

export function CompareView({ scenarios, loading, error }: CompareViewProps): JSX.Element {
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
                  <div className="mt-1 text-xl font-semibold text-slate-900">{formatNumber(scenario.area)}</div>
                  <div className="text-xs text-slate-500">mm²</div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs text-slate-500">Power</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">{formatNumber(scenario.power)}</div>
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
