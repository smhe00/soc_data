import type { ConfidenceLevel } from "../../types/component";
import type { RiskLevel } from "../../types/scenario";
import type { BadgeTone } from "./Badge";

export type SeverityLevel = "High" | "Medium" | "Low";

export function confidenceTone(confidence: ConfidenceLevel): BadgeTone {
  if (confidence === "approved") return "green";
  if (confidence === "review") return "amber";
  return "slate";
}

export function riskTone(risk: RiskLevel): BadgeTone {
  if (risk === "High") return "red";
  if (risk === "Medium") return "amber";
  return "green";
}

export function severityTone(severity: SeverityLevel): BadgeTone {
  if (severity === "High") return "red";
  if (severity === "Medium") return "amber";
  return "slate";
}

export function formatNumber(val: number | string | undefined | null, precision: number = 3): string {
  if (val === undefined || val === null || val === "") return "-";
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return String(Number(num.toFixed(precision)));
}
