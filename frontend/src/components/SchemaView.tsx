import React from "react";
import { Database, Settings2, AlertTriangle, Flame, CheckCircle2 } from "lucide-react";
import { Card } from "./ui";

export interface SchemaTable {
  table: string;
  purpose: string;
  fields: string;
}

const schemaTables: SchemaTable[] = [
  {
    table: "project",
    purpose: "Product family, project generation, ownership, and planning phase.",
    fields: "id, name, product_family, generation, owner, phase",
  },
  {
    table: "impl_option",
    purpose: "Implementation options such as monolithic, 2.5D, or 3DIC stack choices.",
    fields: "id, project_id, name, impl_type, process_combo, status",
  },
  {
    table: "module_definition",
    purpose: "Reusable RTL, IP, hard macro, and subsystem definitions.",
    fields: "id, name, module_type, ip_owner, reuse_class",
  },
  {
    table: "logical_component",
    purpose: "Logical hierarchy and logical instance count.",
    fields: "id, parent_id, module_definition_id, hierarchy_path, logical_instance_count",
  },
  {
    table: "process_node",
    purpose: "Process density, voltage, cost, maturity, and area scaling by resource category.",
    fields: "id, foundry, node_name, logic/sram/block_area_scale",
  },
  {
    table: "tier",
    purpose: "Die or tier definition inside an implementation option.",
    fields: "id, impl_option_id, process_id, tier_index, tier_name, role",
  },
  {
    table: "physical_partition",
    purpose: "Mapping from a logical component's self/residual content to a tier.",
    fields: "id, impl_option_id, logical_component_id, tier_id, resource_category, physical_instance_count, content_share",
  },
  {
    table: "metric",
    purpose: "Typed metric rows attached to logical components, physical partitions, tiers, or implementation options.",
    fields: "id, impl_option_id, subject_type, subject_id, metric_name, metric_value, value_type",
  },
  {
    table: "power_observation",
    purpose: "Application power use cases and scenario composition source values.",
    fields: "component_id, use_case_name, operating_point_set_id, power_value_w",
  },
];

export function SchemaView(): JSX.Element {
  return (
    <div className="space-y-6">
      <Card title="Phase-1 Data Model" subtitle="Core SQLite tables for logical hierarchy, physical mapping, metrics, and application power." icon={Database}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {schemaTables.map((table) => (
            <div key={table.table} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="font-mono text-sm font-semibold text-slate-950">{table.table}</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{table.purpose}</p>
              <div className="mt-3 rounded-xl bg-white p-3 font-mono text-xs leading-5 text-slate-500">{table.fields}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Phase-1 Boundary" subtitle="Keep daily data maintenance explicit, reviewable, and SQLite-friendly." icon={Settings2}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
              <CheckCircle2 size={18} />
              Included
            </div>
            <ul className="space-y-2 text-sm leading-6 text-slate-600">
              <li>Project and implementation option tracking</li>
              <li>Logical hierarchy and responsibility ownership</li>
              <li>Process, tier, and physical partition mapping</li>
              <li>Logic, SRAM, block area metrics with process scaling</li>
              <li>Application power use case library and scenario composition</li>
              <li>Excel import/export for bulk exchange</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
              <AlertTriangle size={18} />
              Deferred
            </div>
            <ul className="space-y-2 text-sm leading-6 text-slate-600">
              <li>Multi-user authentication and role enforcement</li>
              <li>Thermal, cost, and yield surrogate models</li>
              <li>EDA flow automation</li>
              <li>Automatic partition optimization</li>
              <li>Production database migration and audit trails</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
              <Flame size={18} />
              Data Risks
            </div>
            <ul className="space-y-2 text-sm leading-6 text-slate-600">
              <li>Logical hierarchy and physical mapping edited out of sequence</li>
              <li>Resource category closure not matching logical instance count</li>
              <li>Parent subtree closure hidden by local self/residual closure</li>
              <li>Application power use cases mixed with legacy block metrics</li>
              <li>Excel imports overwriting reviewed web edits</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
