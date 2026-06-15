import React from "react";
import { Upload, FileText } from "lucide-react";
import { Badge, Card } from "./ui";
import { importTemplateUrl, type ImportResult } from "../api/imports";

export interface ImportArtifact {
  file: string;
  type: string;
  status: "Parsed" | "Need Review" | "Draft Mapping";
  extracted: string;
  issues: number;
  owner: string;
}

export interface ImportsViewProps {
  importing: boolean;
  importResult: ImportResult | null;
  importError: string | null;
  selectedImplOptionId: string;
  selectedTeam: string;
  onImportWorkbook: (file: File) => Promise<void>;
}

const imports: ImportArtifact[] = [
  {
    file: "architecture_plan_v0.3.xlsx",
    type: "Excel",
    status: "Parsed",
    extracted: "42 blocks, 18 metrics",
    issues: 3,
    owner: "Product Planning",
  },
  {
    file: "dc_npu_top_area.rpt",
    type: "Synthesis Report",
    status: "Need Review",
    extracted: "NPU_TOP area/power estimates",
    issues: 5,
    owner: "Design Team",
  },
  {
    file: "3dic_stack_spec.pdf",
    type: "PDF",
    status: "Draft Mapping",
    extracted: "Tier/process/HB/TSV parameters",
    issues: 2,
    owner: "Packaging Team",
  },
];

export function ImportsView({
  importing,
  importResult,
  importError,
  selectedImplOptionId,
  selectedTeam,
  onImportWorkbook,
}: ImportsViewProps): JSX.Element {
  const scopedTemplateUrl = importTemplateUrl(selectedTeam, selectedImplOptionId);

  return (
    <div className="space-y-6">
      <Card title="Excel Import" icon={Upload}>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <Upload className="mx-auto text-slate-400" size={34} />
          <div className="mt-4 text-base font-semibold text-slate-900">Upload SoC Import Workbook</div>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Download the {selectedImplOptionId} workbook for {selectedTeam}, edit logical_components / physical_partitions / metrics, then upload the .xlsx file. The backend validates references and team scope before upserting into SQLite.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <a className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" href={scopedTemplateUrl}>
              Download {selectedTeam} / {selectedImplOptionId} Template
            </a>
            <label className={`cursor-pointer rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 ${importing ? "opacity-60" : ""}`}>
              {importing ? "Importing..." : "Select .xlsx"}
              <input
                accept=".xlsx"
                className="hidden"
                disabled={importing}
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onImportWorkbook(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {importError && <div className="mx-auto mt-4 max-w-xl rounded-xl bg-red-50 p-3 text-sm text-red-700">{importError}</div>}
          {importResult && (
            <div className="mx-auto mt-4 max-w-xl rounded-xl bg-emerald-50 p-3 text-left text-sm text-emerald-800">
              <div className="font-semibold">Imported {importResult.filename}</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {Object.entries(importResult.imported).map(([sheet, count]) => (
                  <div key={sheet} className="rounded-lg bg-white/70 px-3 py-2">
                    {sheet}: <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="Recent Source Artifacts" subtitle="所有数据必须能追溯到来源文件、版本和owner" icon={FileText}>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Extracted</th>
                <th className="px-4 py-3">Issues</th>
                <th className="px-4 py-3">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {imports.map((item) => (
                <tr key={item.file} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{item.file}</td>
                  <td className="px-4 py-3 text-slate-600">{item.type}</td>
                  <td className="px-4 py-3"><Badge tone={item.status === "Parsed" ? "green" : "amber"}>{item.status}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{item.extracted}</td>
                  <td className="px-4 py-3 text-slate-600">{item.issues}</td>
                  <td className="px-4 py-3 text-slate-600">{item.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
