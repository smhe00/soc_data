import React from "react";
import { AlertTriangle, Flame, History, CheckCircle2 } from "lucide-react";
import { Badge, Card, MetricCard, severityTone } from "./ui";
import type { QualityIssue } from "../api/quality";

export interface QualityViewProps {
  qualityIssues: QualityIssue[];
  loading: boolean;
  error: string | null;
}

export function QualityView({ qualityIssues, loading, error }: QualityViewProps): JSX.Element {
  const highCount = qualityIssues.filter((issue) => issue.severity === "High").length;
  const mediumCount = qualityIssues.filter((issue) => issue.severity === "Medium").length;
  const lowCount = qualityIssues.filter((issue) => issue.severity === "Low").length;

  if (loading) {
    return (
      <Card title="Loading Quality Checks" subtitle="Evaluating data rules..." icon={AlertTriangle}>
        <div className="text-sm text-slate-500">Loading...</div>
      </Card>
    );
  }
  if (error) {
    return (
      <Card title="API Error" subtitle="FastAPI backend is not reachable yet." icon={AlertTriangle}>
        <div className="text-sm text-red-600">{error}</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card
        title="Data Quality Gate"
        subtitle="Rules that protect logical hierarchy, physical mapping closure, and application power composition."
        icon={AlertTriangle}
      >
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Open Issues" value={qualityIssues.length} unit="" icon={AlertTriangle} hint="Rules" />
          <MetricCard label="High Severity" value={highCount} unit="" icon={Flame} hint="Blockers" />
          <MetricCard label="Medium Severity" value={mediumCount} unit="" icon={History} hint="Review" />
          <MetricCard label="Low Severity" value={lowCount} unit="" icon={CheckCircle2} hint="Info" />
        </div>
      </Card>

      <Card title="Quality Issues" subtitle="Open checks that should be resolved before sharing or reviewing a database." icon={AlertTriangle}>
        <div className="space-y-3">
          {qualityIssues.length === 0 && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-sm text-emerald-800">
              No open quality issues for the selected implementation option.
            </div>
          )}
          {qualityIssues.map((issue) => (
            <div key={issue.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={severityTone(issue.severity)}>{issue.severity}</Badge>
                    <div className="font-semibold text-slate-900">{issue.title}</div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{issue.detail}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">Recommended action: {issue.action}</p>
                  <div className="mt-2 font-mono text-xs text-slate-400">
                    {issue.entity_type}:{issue.entity_id}
                  </div>
                </div>
                <button className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button">
                  Review
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
