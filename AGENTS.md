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
- `scenario_implementation`
- `implementation_tier`
- `implementation_interface`
- `implementation_package_escape`
- `physical_partition`
- `metric`
- `responsibility_assignment`

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
- `owner_team`
- `visibility_level`
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
- `resource_category`: `logic`, `sram`, or `block`
- `partition_name`
- `partition_type`: `full` or `partial`
- `physical_instance_count`
- `content_share`
- `description`

Use `physical_instance_count` for how many physical copies are realized on that tier. Use `content_share` only for partial content split; full partitions always have `content_share = 1`. Do not ask users to fill `instance_share`; compute it from `physical_instance_count / logical_instance_count`.

Logic, SRAM, and block/hard-macro content can map independently. Equivalent instance closure is checked per `(logical_component, scenario, resource_category)`, not across all resource categories combined. Existing coarse mappings can remain `block` until a user refines them into `logic` and `sram` rows.

Mapping rows should be shown in fixed category order: `logic`, `sram`, then `block`. Users should not manually edit physical partition ID/name in the daily UI. Generate the base name as `logicalName_resourceCategory_tier`; `full` rows use that base directly, and `partial` rows append `_P1`, `_P2`, etc. Multiple partial rows on the same tier are allowed and should be numbered per resource category/tier.

Parent-level self/glue logic is residual data derived from parent total metrics minus direct child metrics. Do not store residual as a logical component row.

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

### responsibility_assignment

Lightweight team/user responsibility for a logical subtree in a scenario.

Fields:

- `id`
- `project_id`
- `scenario_id`
- `user_id`
- `team_name`
- `logical_component_id`
- `scope_type`
- `can_read`
- `can_write`

Use this for phase-1 subsystem-owner filtering. Do not add full login, roles, complex row-level permissions, or enterprise access control in phase 1.

## Current Demo

The backend seeds a realistic flagship mobile SoC demo named `Orion X1 Mobile SoC`.

It includes:

- 3 scenarios: monolithic N3E baseline, 3-tier 3DIC performance option, and cost-optimized 2.5D option
- 36 logical components across CPU, GPU, NPU, ISP, media, display, 5G modem, memory, NoC, IO/PHY, secure island, and always-on PMU
- 35 physical partitions across compute, SRAM/cache, and IO/always-on tiers
- Metrics for signal count, logic/SRAM/block area, power, tier utilization, and shape descriptors

Demo seeding is controlled by:

macOS/Linux:

```sh
export SEED_DEMO=true
```

Windows PowerShell:

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
- `GET /api/responsibilities/teams`
- `PUT /api/components/{component_id}/detail`

Most scenario-owned API views accept `?scenario_id=...`. Use this for component data, component tree, physical partitions, tiers, metrics, dashboard, quality issues, responsibility teams, import templates, and import uploads. Do not assume `S2` unless the caller explicitly wants the demo 3DIC scenario.

Team-scoped API views:

- `GET /api/components?team=AI%20Team`
- `GET /api/components/tree?team=AI%20Team&scenario_id=S2`
- `GET /api/physical-partitions?team=AI%20Team&scenario_id=S2`
- `GET /api/metrics?team=AI%20Team&scenario_id=S2`
- `GET /api/quality/issues?team=AI%20Team&scenario_id=S2`
- `GET /api/import/template?team=AI%20Team&scenario_id=S2`
- `POST /api/import/excel?team=AI%20Team&scenario_id=S2`

Import endpoints:

- `GET /api/import/template`
- `POST /api/import/excel`

Team import workbooks are scoped input workbooks, not permission enforcement. Shared sheets are reference context; scoped uploads only merge `logical_components`, `physical_partitions`, and `metrics` after backend scope validation.

Web maintenance currently starts with component detail physical mapping. Keep this object-oriented: users edit logical instance count, physical count, and partial content share, while the API writes `logical_component` and scenario-scoped `physical_partition` rows behind the scenes. Do not expose the raw metric long table as the primary daily-edit UI.

Physical partition edits must use the selected scenario as the working context. A partition's `tier_id` must belong to the same scenario as the partition's `scenario_id`; backend save and import validation enforce this. Do not create UI flows that mix tiers from one scenario with partitions from another.

The frontend also includes a scenario-level `实现方案` prototype. Treat it as implementation-form definition for `scenario`, not as logical hierarchy or physical partition maintenance. One project can have multiple scenarios, and each scenario can represent a monolithic, 2.5D, or W2W 3DIC implementation form.

Implementation definitions are persisted in `scenario_implementation`, `implementation_tier`, `implementation_interface`, and `implementation_package_escape`. The API boundary is:

- `GET /api/scenarios/{scenario_id}/implementation`
- `PUT /api/scenarios/{scenario_id}/implementation`

If no saved implementation exists, the GET endpoint synthesizes starting tier definitions from `tier` rows for that scenario. Saves are versioned. Keep tier-structure edits conservative: if `physical_partition` rows already use a tier in the same scenario, the backend must block saves that remove/rename that tier or reorder it.

Implementation-definition rules to preserve:

- single-layer monolithic scenarios are valid and do not have inter-layer interfaces
- die/layer order is top to bottom
- Face/Back choices are chained; a die side used by the upper interface cannot be reused by the lower interface
- HB pitch and TSV pitch are decoupled
- TSV parameters are side-specific; `Back-to-Back` can require independent upper-side and lower-side TSV pitch/keep-out
- bottom-die package escape is derived from the last die-to-die orientation; if the bottom die back side faces bumps, represent it as a derived `Tn-BUMP` TSV interface
- cross-section Face/Back surface markers are derived from interface orientation and should remain synchronized with orientation edits
- do not merge implementation-form storage with physical partition storage; partitions describe logical-to-tier mapping, while implementation tables describe scenario stack/interface intent

## Development Principles

1. Keep phase 1 local and easy to run.
2. Prefer simple, explicit data structures over premature abstraction.
3. Keep the frontend backed by API data, not hard-coded business data.
4. Preserve future paths for source traceability and data quality checks.
5. Keep SQLite schema clear enough to migrate to PostgreSQL later.
6. Do not add enterprise concerns before the MVP is stable.
7. Prefer V7 workbook/schema terminology in new code and docs.
