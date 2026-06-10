import React from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "./Badge";

export interface MetricCardProps {
  label: string;
  value: string | number;
  unit: string;
  icon: LucideIcon;
  hint?: string;
}

export function MetricCard({ label, value, unit, icon: Icon, hint }: MetricCardProps): JSX.Element {
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
