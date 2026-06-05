import { apiGet } from "./client";
import type { Scenario } from "../types/scenario";

export function getScenarios(): Promise<Scenario[]> {
  return apiGet<Scenario[]>("/api/scenarios");
}
