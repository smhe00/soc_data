import { apiGet, apiJson } from "./client";

export interface DatabaseInfo {
  id: string;
  name: string;
  path: string;
  active: boolean;
  is_demo: boolean;
  project_count: number | null;
}

export interface DatabaseCatalog {
  active_id: string;
  databases: DatabaseInfo[];
}

export function getDatabases(): Promise<DatabaseCatalog> {
  return apiGet<DatabaseCatalog>("/api/databases");
}

export function createDatabase(name: string, seedDemo = false): Promise<DatabaseCatalog> {
  return apiJson<DatabaseCatalog>("/api/databases", "POST", { name, seed_demo: seedDemo });
}

export function selectDatabase(id: string): Promise<DatabaseCatalog> {
  return apiJson<DatabaseCatalog>("/api/databases/select", "POST", { id });
}
