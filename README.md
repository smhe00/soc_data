# SoC Cross-Die Database

Phase-1 SQLite MVP for a SoC cross-die architecture database and 3DIC evaluation prototype.

The current demo is a realistic flagship mobile SoC dataset named `Orion X1 Mobile SoC`.

## Repository

Gitee:

```text
https://gitee.com/smhe/soc_database.git
```

## Backend

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database
uv sync
uv run uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

The backend creates `backend/soc_3dic.db` on startup.

Stop the backend from the same PowerShell window with `Ctrl + C`.

If Windows leaves an orphaned `uvicorn --reload` child process on port 8000, run:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database
powershell -ExecutionPolicy Bypass -File scripts\stop_backend.ps1
```

Demo seed is enabled by default. It refreshes the built-in `P001 / S1-S3` demo data.

Disable demo seed when you want to preserve manually imported data:

```powershell
$env:SEED_DEMO="false"
uv run uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

## Frontend

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database\frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
```

## V7 Data Model

Core tables:

- `project`
- `scenario`
- `module_definition`
- `logical_component`
- `process_node`
- `tier`
- `physical_partition`
- `metric`
- `responsibility_assignment`

The model separates:

- logical hierarchy and logical instance count
- physical partitioning and physical instance count
- long-table metrics attached to logical components, physical partitions, tiers, or scenarios

Detailed schema notes:

```text
docs/schema_v7.md
```

## Demo Data

Seeded dataset:

- Project: `Orion X1 Mobile SoC`
- Scenarios:
  - `S1`: Monolithic N3E Baseline
  - `S2`: 3DIC Performance Option
  - `S3`: Cost-Optimized 2.5D Option
- Logical components: 36
- Physical partitions: 35
- Main domains: CPU, GPU, NPU, ISP, media, display, 5G modem, memory, NoC, IO/PHY, security, PMU

## Excel Import

Current V7 workbook:

```text
templates\soc_mapping_metrics_review_v7.xlsx
```

Download from the running backend:

```text
http://localhost:8000/api/import/template
```

Download a subsystem-owner workbook for the selected team:

```text
http://localhost:8000/api/import/template?team=AI%20Team
```

Team workbooks keep shared sheets such as `projects`, `scenarios`, `tiers`, and `module_definitions` as context. Team uploads only upsert scoped `logical_components`, `physical_partitions`, and `metrics`; the backend rejects rows outside the team's assigned logical subtree.

Verify import:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database
uv run python scripts\verify_import.py
```

Run the phase-1 API/data smoke check:

```powershell
uv run python scripts\check_phase1.py
```

## Quality Checks

Quality issues API:

```text
GET http://localhost:8000/api/quality/issues
```

Phase-1 rules check:

- `partition_ratio` closure
- `physical_instance_count` closure for full partitions
- required logical metrics
- numeric metric values
- metric subject references

## Team Scoped Views

The phase-1 app includes lightweight subsystem-owner scoping. This is data filtering for review workflows, not a full login or permission system.

Examples:

```text
GET /api/responsibilities/teams
GET /api/components?team=AI%20Team
GET /api/components/tree?team=AI%20Team
GET /api/physical-partitions?team=AI%20Team
GET /api/metrics?team=AI%20Team
GET /api/quality/issues?team=AI%20Team
GET /api/import/template?team=AI%20Team
POST /api/import/excel?team=AI%20Team
PUT /api/components/{component_id}/detail
```

## Web Maintenance

The Hierarchy page now includes a small Component Detail maintenance surface for physical partition mapping.

For the selected logical component, users can edit:

- `logical_instance_count`
- partition `tier_id`
- partition type
- physical instance count
- partition ratio
- partition name and description

The page shows live count and ratio closure before saving. Save calls `PUT /api/components/{component_id}/detail`, then refreshes component data and quality issues.

## Useful API Endpoints

```text
GET /api/projects
GET /api/scenarios
GET /api/module-definitions
GET /api/components
GET /api/components/tree
GET /api/physical-partitions
GET /api/tiers
GET /api/metrics
GET /api/dashboard
GET /api/quality/issues
GET /api/responsibilities/teams
PUT /api/components/{component_id}/detail
GET /api/import/template
POST /api/import/excel
```
