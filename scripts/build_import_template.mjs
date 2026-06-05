import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputPath = "templates/soc_import_demo.xlsx";

const sheets = {
  projects: [
    ["id", "name", "product_family", "generation", "owner", "phase", "description", "created_at", "updated_at"],
    ["P001", "Mobile SoC Gen-A", "Flagship Mobile SoC", "Gen-A", "Architecture Team", "Architecture Planning", "Phase-1 architecture planning baseline.", "2026-05-27", "2026-05-27"],
    ["P002", "Mobile SoC Gen-B", "Flagship Mobile SoC", "Gen-B", "Product + Architecture", "Pre-Study", "Next-generation pre-study project.", "2026-05-27", "2026-05-27"],
  ],
  scenarios: [
    ["id", "project_id", "name", "scenario_type", "process_combo", "description", "status", "created_at", "updated_at"],
    ["S1", "P001", "2D Baseline", "1 die", "N5 monolithic", "Current 2D planning baseline for cross-generation comparison.", "Low", "2026-05-27", "2026-05-27"],
    ["S2", "P001", "3DIC Option A", "3 tiers W2W", "N5 + N7 + N7", "Top N5 logic, middle N7 logic/memory, bottom N7 IO/PHY/PDN.", "High", "2026-05-27", "2026-05-27"],
    ["S3", "P001", "Cost-Reduced Option", "2 tiers W2W", "N7 + N7", "More conservative 2-tier split with lower process cost.", "Medium", "2026-05-27", "2026-05-27"],
  ],
  process_nodes: [
    ["id", "foundry", "node_name", "logic_density_mtr_per_mm2", "sram_density_mb_per_mm2", "voltage_nominal", "cost_factor", "maturity_level", "description"],
    ["PN5", "TSMC", "N5", 171.3, 1.35, 0.75, 1.4, "Production", "High-performance logic process."],
    ["PN7", "TSMC", "N7", 113.9, 1.0, 0.8, 1.0, "Mature", "Mature logic and memory-friendly process."],
  ],
  components: [
    ["id", "project_id", "parent_id", "name", "instance_type", "resource_type", "function_domain", "hierarchy_path", "description"],
    ["B0", "P001", "", "SOC_TOP", "top", "mixed", "SoC", "SOC_TOP", "tier=Split; confidence=approved"],
    ["B1", "P001", "B0", "CPU_CLUSTER", "subsystem", "logic", "Compute", "SOC_TOP/CPU_CLUSTER", "tier=T0; confidence=review"],
    ["B2", "P001", "B0", "GPU_TOP", "subsystem", "logic", "Graphics", "SOC_TOP/GPU_TOP", "tier=T0/T1; confidence=review"],
    ["B3", "P001", "B0", "NPU_TOP", "subsystem", "logic+memory", "AI", "SOC_TOP/NPU_TOP", "tier=T0/T1; confidence=draft"],
    ["B4", "P001", "B0", "ISP_TOP", "subsystem", "logic", "Camera", "SOC_TOP/ISP_TOP", "tier=T1; confidence=approved"],
    ["B5", "P001", "B0", "DDR_PHY", "phy", "phy_analog", "Memory IO", "SOC_TOP/DDR_PHY", "tier=T2; confidence=approved"],
    ["B6", "P001", "B0", "PCIE_USB_PHY", "phy", "phy_analog", "External IO", "SOC_TOP/PCIE_USB_PHY", "tier=T2; confidence=approved"],
    ["B7", "P001", "B1", "CPU_CORE_0", "block", "logic", "CPU", "SOC_TOP/CPU_CLUSTER/CPU_CORE_0", "tier=T0; confidence=review"],
    ["B8", "P001", "B3", "NPU_SRAM_BANKS", "macro_group", "memory", "AI Memory", "SOC_TOP/NPU_TOP/NPU_SRAM_BANKS", "tier=T1; confidence=draft"],
  ],
  tiers: [
    ["id", "scenario_id", "tier_index", "name", "process_id", "role", "orientation", "thickness_um", "area_limit_mm2", "description"],
    ["T0", "S2", 0, "Top Tier", "PN5", "High-performance logic", "Face-down", 45, 28.2, "HB < 1um; utilization 72%; power 7.6 W"],
    ["T1", "S2", 1, "Middle Tier", "PN7", "Memory + medium logic", "Face-up / Face-to-face", 50, 31.4, "HB + TSV; utilization 66%; power 4.8 W"],
    ["T2", "S2", 2, "Bottom Tier", "PN7", "IO / PHY / PDN / logic", "Backside PDN", 60, 15.0, "TSV < 5um; utilization 58%; power 2.8 W"],
  ],
  component_metrics: [
    ["id", "scenario_id", "instance_id", "metric_name", "metric_value", "metric_unit", "metric_category", "corner", "workload", "confidence", "created_at"],
  ],
};

const metricValues = {
  B0: [0, 0, 74.6, 15.2],
  B1: [1850, 24, 12.8, 4.1],
  B2: [3100, 18, 18.7, 5.5],
  B3: [2400, 64, 21.2, 3.8],
  B4: [980, 12, 7.4, 1.4],
  B5: [0, 0, 4.8, 0.9],
  B6: [0, 0, 3.1, 0.6],
  B7: [420, 2, 2.7, 0.95],
  B8: [0, 48, 8.2, 0.8],
};

for (const [instanceId, [logic, memory, area, power]] of Object.entries(metricValues)) {
  for (const [name, value, unit, category, workload] of [
    ["logicMTr", logic, "MTr", "scale", "nominal"],
    ["memoryMb", memory, "Mb", "memory", "nominal"],
    ["area", area, "mm2", "physical", "nominal"],
    ["power", power, "W", "power", "peak"],
  ]) {
    sheets.component_metrics.push([
      `S2-${instanceId}-${name}`,
      "S2",
      instanceId,
      name,
      value,
      unit,
      category,
      "typical",
      workload,
      ["B0", "B4", "B5", "B6"].includes(instanceId) ? "approved" : "review",
      "2026-05-27",
    ]);
  }
}

sheets.instructions = [
  ["SoC Cross-Die Database Import Template"],
  ["Use the six data sheets below. Keep column names unchanged. IDs are stable keys used for upsert imports."],
  [""],
  ["Sheet", "Purpose"],
  ["projects", "Project master data"],
  ["scenarios", "Architecture scenarios linked to projects"],
  ["process_nodes", "Foundry/process reference data"],
  ["components", "Component/block hierarchy. parent_id may be blank only for root nodes."],
  ["tiers", "3D stack tier definitions linked to scenarios and process_nodes"],
  ["component_metrics", "Scenario-specific area, power, memory, logic, and other metrics"],
];

function columnName(index) {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function styleSheet(sheet, rowCount, columnCount) {
  sheet.showGridLines = false;
  const lastCol = columnName(columnCount - 1);
  sheet.getRange(`A1:${lastCol}1`).format = {
    fill: "#0F172A",
    font: { bold: true, color: "#FFFFFF" },
  };
  sheet.getRange(`A1:${lastCol}${rowCount}`).format.wrapText = true;
  sheet.getRange(`A1:${lastCol}${rowCount}`).format.autofitColumns();
  sheet.freezePanes.freezeRows(1);
}

const workbook = Workbook.create();

for (const [name, rows] of Object.entries(sheets)) {
  const sheet = workbook.worksheets.add(name);
  sheet.getRangeByIndexes(0, 0, rows.length, rows[0].length).values = rows;
  styleSheet(sheet, rows.length, rows[0].length);
}

const inspect = await workbook.inspect({
  kind: "sheet,table",
  tableMaxRows: 5,
  tableMaxCols: 8,
  maxChars: 4000,
});
console.log(inspect.ndjson);

await fs.mkdir("templates", { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`Saved ${outputPath}`);
