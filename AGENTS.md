# SoC Cross-Die Database / 3DIC Platform Context

## Project Goal

This project is a phase-1 MVP for a SoC architecture database and 3DIC evaluation prototype.

The first phase is intentionally small: run a real local engineering loop from React TypeScript frontend to FastAPI backend to SQLite database to UI pages backed by API data.

Do not introduce Docker, PostgreSQL, Alembic, complex permissions, AI features, automatic partition optimization, or thermal surrogate models in phase 1.

## Current Stack

Frontend:

- React
- TypeScript
- Vite
- Tailwind CSS
- lucide-react
- framer-motion

Backend:

- Python
- FastAPI
- SQLModel
- SQLite
- uv for Python environment management

## V7 Data Model

The current model separates reusable definitions, logical hierarchy, physical partitioning, and metrics.

Core tables:

- `project`
- `scenario`
- `module_definition`
- `logical_component`
- `process_node`
- `tier`
- `physical_partition`
- `metric`

### module_definition

Reusable RTL/IP/block master data.

Fields:

- `id`
- `name`
- `module_type`
- `ip_owner`
- `reuse_class`
- `description`

### logical_component

Architecture-level hierarchy. Do not expand repeated logical instances into `_0/_1/_2` rows.

Fields:

- `id`
- `project_id`
- `parent_id`
- `module_definition_id`
- `name`
- `instance_type`
- `resource_type`
- `function_domain`
- `hierarchy_path`
- `logical_instance_count`
- `description`
- `created_at`
- `updated_at`

### physical_partition

Scenario-specific physical carrying/mapping of a logical component to a tier.

Fields:

- `id`
- `scenario_id`
- `logical_component_id`
- `tier_id`
- `partition_name`
- `partition_type`: `full`, `partial`, or `residual`
- `physical_instance_count`
- `partition_ratio`
- `description`

Use `physical_instance_count` for how many physical copies are realized on that tier. Use `partition_ratio` for how much of the logical content is carried by that partition.

### metric

Unified long table for quantitative and descriptive metrics.

Fields:

- `id`
- `scenario_id`
- `subject_type`: `logical_component`, `physical_partition`, `tier`, or `scenario`
- `subject_id`
- `metric_name`
- `metric_value`
- `metric_unit`
- `metric_category`
- `value_type`
- `corner`
- `workload`
- `confidence`
- `source_note`
- `created_at`

Phase-1 logical area metrics use:

- `signal_count_total`
- `logic_area`
- `sram_area`
- `block_area`

Implementation details such as shape, width, height, utilization, and power stay in `metric` rows attached to `physical_partition`, not as fixed columns on `physical_partition`.

## Current Demo

The backend seeds a realistic flagship mobile SoC demo named `Orion X1 Mobile SoC`.

It includes:

- 3 scenarios: monolithic N3E baseline, 3-tier 3DIC performance option, and cost-optimized 2.5D option
- 36 logical components across CPU, GPU, NPU, ISP, media, display, 5G modem, memory, NoC, IO/PHY, secure island, and always-on PMU
- 35 physical partitions across compute, SRAM/cache, and IO/always-on tiers
- Metrics for signal count, logic/SRAM/block area, power, tier utilization, and shape descriptors

Demo seeding is controlled by:

```powershell
$env:SEED_DEMO="true"
```

Set `SEED_DEMO=false` before backend startup when you want to preserve manually imported database contents.

## Phase-1 APIs

Read/API endpoints:

- `GET /api/projects`
- `GET /api/scenarios`
- `GET /api/module-definitions`
- `GET /api/components`
- `GET /api/components/tree`
- `GET /api/physical-partitions`
- `GET /api/tiers`
- `GET /api/metrics`
- `GET /api/dashboard`
- `GET /api/quality/issues`

Import endpoints:

- `GET /api/import/template`
- `POST /api/import/excel`

## Development Principles

1. Keep phase 1 local and easy to run.
2. Prefer simple, explicit data structures over premature abstraction.
3. Keep the frontend backed by API data, not hard-coded business data.
4. Preserve future paths for source traceability and data quality checks.
5. Keep SQLite schema clear enough to migrate to PostgreSQL later.
6. Do not add enterprise concerns before the MVP is stable.
7. Prefer V7 workbook/schema terminology in new code and docs.

