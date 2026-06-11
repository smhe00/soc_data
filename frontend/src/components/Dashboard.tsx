import React from "react";
import { Database, AlertTriangle, Package, Gauge, MemoryStick, SplitSquareVertical, Cpu, BarChart3, CheckCircle2 } from "lucide-react";
import { Card, MetricCard, Badge } from "./ui";
import type { DashboardData } from "../types/metric";

export interface DashboardProps {
  dashboard: DashboardData | null;
  loading: boolean;
  error: string | null;
}

export function Dashboard({ dashboard, loading, error }: DashboardProps): JSX.Element {
  if (loading) return <Card title="Loading Dashboard" subtitle="Fetching SQLite-backed API data..." icon={Database}><div className="text-sm text-slate-500">Loading...</div></Card>;
  if (error) return <Card title="API Error" subtitle="FastAPI backend is not reachable yet." icon={AlertTriangle}><div className="text-sm text-red-600">{error}</div></Card>;
  if (!dashboard) return <Card title="No Data" icon={Database}><div className="text-sm text-slate-500">No dashboard data returned.</div></Card>;

  const { metrics, projects, resource_mix: resourceMix } = dashboard;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="3DIC Option A 估算总面积" value={metrics.total_area} unit="mm²" icon={Package} hint="ImplOption S2" />
        <MetricCard label="Peak场景总功耗估计" value={metrics.total_power !== null && metrics.total_power !== undefined ? metrics.total_power * 1000 : "-"} unit="mW" icon={Gauge} hint="Draft" />
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
              <CheckCircle2 size={18} className="text-emerald-600" />项目/版本/ImplOption管理
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
