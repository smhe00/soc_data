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
    purpose: "产品线、项目、代际管理",
    fields: "project_id, family, name, owner, phase, created_at",
  },
  {
    table: "scenario",
    purpose: "2D/3DIC/降本/性能方案管理",
    fields: "scenario_id, project_id, name, process_combo, status",
  },
  {
    table: "module_definition",
    purpose: "可复用RTL/IP/block主定义",
    fields: "id, name, module_type, ip_owner, reuse_class",
  },
  {
    table: "logical_component",
    purpose: "逻辑层次结构与逻辑例化数量",
    fields: "id, parent_id, module_definition_id, hierarchy_path, logical_instance_count",
  },
  {
    table: "process_node",
    purpose: "工艺能力、密度、成本、成熟度",
    fields: "process_id, foundry, node, logic_density, sram_density, logic/sram/block_area_scale",
  },
  {
    table: "tier",
    purpose: "3D stack中每层die/tier定义",
    fields: "tier_id, scenario_id, process_id, tier_index, role, thickness",
  },
  {
    table: "physical_partition",
    purpose: "逻辑模块到Tier的物理承载事实",
    fields: "id, logical_component_id, tier_id, resource_category, physical_instance_count, content_share",
  },
  {
    table: "metric",
    purpose: "统一指标表，挂到logical/partition/tier/scenario",
    fields: "id, subject_type, subject_id, metric_name, metric_value, value_type",
  },
  {
    table: "source_artifact",
    purpose: "Excel/PDF/report/PPT等来源追溯",
    fields: "source_id, filename, source_type, owner, version, uploaded_at",
  },
];

export function SchemaView(): JSX.Element {
  return (
    <div className="space-y-6">
      <Card title="Phase-1 Logical Data Model" subtitle="先稳定核心表，后续AI、仿真、优化都挂在这套数据模型上" icon={Database}>
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

      <Card title="Phase-1 Boundary" subtitle="原型阶段不追求完整EDA闭环，先保证数据结构、追溯、对比能力" icon={Settings2}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><CheckCircle2 size={18} />Included</div>
            <ul className="space-y-2 text-sm leading-6 text-slate-600">
              <li>项目/方案/版本管理</li>
              <li>Block hierarchy和资源类型建模</li>
              <li>Process/Tier/Allocation</li>
              <li>面积/功耗/频率基础指标</li>
              <li>文件来源追溯</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><AlertTriangle size={18} />Deferred to P1/P2</div>
            <ul className="space-y-2 text-sm leading-6 text-slate-600">
              <li>AI自动解析和命名对齐</li>
              <li>Thermal surrogate model</li>
              <li>Partition candidate generator</li>
              <li>EDA flow自动闭环</li>
              <li>Cost/yield高级模型</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><Flame size={18} />Key Risk</div>
            <ul className="space-y-2 text-sm leading-6 text-slate-600">
              <li>数据口径不一致</li>
              <li>Block命名不统一</li>
              <li>PHY/Analog约束遗漏</li>
              <li>3D split比例缺失</li>
              <li>来源文件不可追溯</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
