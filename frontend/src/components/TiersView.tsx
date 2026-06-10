import React from "react";
import { Layers3, SplitSquareVertical, AlertTriangle } from "lucide-react";
import { Badge, Card, AreaTriplet, formatNumber } from "./ui";
import type { TierInfo } from "../types/tier";
import type { PhysicalPartition } from "../types/component";

export interface TiersViewProps {
  tiers: TierInfo[];
  physicalPartitions: PhysicalPartition[];
  selectedScenarioId: string;
  loading: boolean;
  error: string | null;
}

export function TiersView({
  tiers,
  physicalPartitions,
  selectedScenarioId,
  loading,
  error
}: TiersViewProps): JSX.Element {
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
                  <div className="mt-1 font-semibold text-slate-900">{formatNumber(tier.area)} mm²</div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-xs text-slate-500">Power</div>
                  <div className="mt-1 font-semibold text-slate-900">{formatNumber(tier.power)} W</div>
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
