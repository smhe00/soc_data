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

The current model separates reusable definitions, logical hierarchy, implementation-option-specific physical partitioning, non-power metrics, and application power composition.

Core tables:

- `project`
- `imploption`
- `moduledefinition`
- `logicalcomponent`
- `processnode`
- `tier`
- `imploptiondetail`
- `implementationtier`
- `implementationinterface`
- `implementationpackageescape`
- `physicalpartition`
- `metric`
- `responsibilityassignment`
- `applicationscenario`
- `physicalmapping`
- `operatingpointset`
- `powerobservation`
- `applicationscenarioselection`

Area metrics on logical components and physical partitions use the base-process convention. `process_node` stores `logic_area_scale`, `sram_area_scale`, and `block_area_scale`; component detail responses compute `tier_area_distribution` by applying the mapped tier's process scale to each resource category.

### module_definition

Reusable RTL/IP/block master data.

Fields: `id`, `name`, `module_type`, `ip_owner`, `reuse_class`, `description`.

### logical_component

Architecture-level hierarchy. Do not expand repeated logical instances into `_0/_1/_2` rows.

Important fields: `id`, `project_id`, `parent_id`, `module_definition_id`, `name`, `instance_type`, `resource_type`, `function_domain`, `hierarchy_path`, `logical_instance_count`, `owner_team`, `visibility_level`, `description`, `created_at`, `updated_at`.

Parent-level self/glue logic is residual data derived from parent total metrics minus direct child metrics. Do not store residual as a logical component row.

### physical_partition

Implementation-option-specific physical carrying/mapping of a logical component's own self/residual content to a tier.

Important fields: `id`, `impl_option_id`, `logical_component_id`, `tier_id`, `resource_category`, `partition_name`, `partition_type`, `physical_instance_count`, `content_share`, `partition_ratio`, `description`.

Use `physical_instance_count` for how many parent-relative physical copies are realized on that tier. Use `content_share` only for partial content split; full partitions always have `content_share = 1`. Do not ask users to fill `instance_share`; compute it from `physical_instance_count / logical_instance_count`.

Logic, SRAM, and block/hard-macro content can map independently. Equivalent instance closure is checked per `(logical_component, impl_option, resource_category)`, not across all resource categories combined. Existing coarse mappings can remain `block` until a user refines them into `logic` and `sram` rows.

Mapping rows should be shown in fixed category order: `logic`, `sram`, then `block`. Users should not manually edit physical partition ID/name in the daily UI. Generate the base name as `logicalName_resourceCategory_tier`; `full` rows use that base directly, and `partial` rows append `_P1`, `_P2`, etc. Multiple partial rows on the same tier are allowed and should be numbered per resource category/tier.

Direct physical partition rows describe only the selected logical component's own self/residual content, not its child modules. If that self/residual area is zero for `logic`, `sram`, or `block`, that category must not appear in the direct map. A logical component is fully mapped only when every non-zero self/residual category closes and every child subtree is also fully mapped recursively.

### metric

Unified long table for quantitative and descriptive non-power metrics.

Important fields: `id`, `impl_option_id`, `subject_type`, `subject_id`, `metric_name`, `metric_value`, `metric_unit`, `metric_category`, `value_type`, `corner`, `workload`, `confidence`, `source_note`, `created_at`.

Allowed `subject_type` values include `logical_component`, `physical_partition`, `tier`, and `impl_option`.

Phase-1 logical metrics use `signal_count_total`, `logic_area`, `sram_area`, and `block_area`. Application power is not stored as logical or partition metrics; use `powerobservation` and `applicationscenarioselection`.

### responsibility_assignment

Lightweight team/user responsibility for a logical subtree in an implementation option.

Important fields: `id`, `project_id`, `impl_option_id`, `user_id`, `team_name`, `logical_component_id`, `scope_type`, `can_read`, `can_write`.

Use this for phase-1 subsystem-owner filtering. Do not add full login, roles, complex row-level permissions, or enterprise access control in phase 1.

### application power

The current demo keeps power values on logical modules under the current `impl_option` and selected Power Dataset. In Phase 1 this is still stored as `physical_mapping` / `physical_mapping_id` for compatibility, but the UI should present it as a power data baseline or back-annotation set, not as physical partition maintenance. It does not yet split power to tiers or hard macros.

A module use case power value is keyed by:

```text
impl_option_id + physical_mapping_id + component_id + use_case_name + operating_point_set_id
```

Read `physical_mapping_id` in power APIs as the selected Power Dataset id.

An application scenario selects module use case/Profile rows. Included rows participate in the scenario total; inactive assignments may remain for roll-up comparison. Inclusive parent rows can coexist with inactive child assignments, and the parent-child delta is displayed as unsplit power, not automatically stored as a residual row.

## Current Demo

The backend seeds a realistic flagship mobile SoC demo named `Orion X1 Mobile SoC`.

It includes:

- 3 implementation options: monolithic N3E baseline, 3-tier 3DIC performance option, and cost-optimized 2.5D option
- 43 logical components across CPU, GPU, NPU, ISP, media, display, 5G modem, memory, NoC, IO/PHY, secure island, and always-on PMU
- 144 physical partitions across logic, SRAM, block, and parent residual/self resource-category mappings
- Non-power metrics for signal count, logic/SRAM/block area, tier utilization, and shape descriptors
- Application power module use cases and application scenario composition rows

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

- `GET /api/databases`
- `POST /api/databases`
- `POST /api/databases/select`
- `GET /api/projects`
- `GET /api/impl-options`
- `GET /api/impl-options/{impl_option_id}/detail`
- `PUT /api/impl-options/{impl_option_id}/detail`
- `GET /api/module-definitions`
- `POST /api/components`
- `PUT /api/components/{component_id}`
- `DELETE /api/components/{component_id}`
- `GET /api/components`
- `GET /api/components/tree`
- `GET /api/physical-partitions`
- `GET /api/tiers`
- `GET /api/metrics`
- `GET /api/dashboard`
- `GET /api/quality/issues`
- `GET /api/responsibilities/teams`
- `PUT /api/components/{component_id}/detail`

Most implementation-option-owned API views accept `?impl_option_id=...`. Use this for component data, component tree, physical partitions, tiers, metrics, dashboard, quality issues, responsibility teams, import templates, and import uploads. Do not assume `S2` unless the caller explicitly wants the demo 3DIC implementation option.

Team-scoped API views:

- `GET /api/components?team=AI%20Team&impl_option_id=S2`
- `GET /api/components/tree?team=AI%20Team&impl_option_id=S2`
- `GET /api/physical-partitions?team=AI%20Team&impl_option_id=S2`
- `GET /api/metrics?team=AI%20Team&impl_option_id=S2`
- `GET /api/quality/issues?team=AI%20Team&impl_option_id=S2`
- `GET /api/import/template?team=AI%20Team&impl_option_id=S2`
- `POST /api/import/excel?team=AI%20Team&impl_option_id=S2`

Import endpoints:

- `GET /api/import/template`
- `POST /api/import/excel`

Team import workbooks are scoped input workbooks, not permission enforcement. Shared sheets are reference context; scoped uploads only merge `logical_components`, `physical_partitions`, and `metrics` after backend scope validation.

Web maintenance is object-oriented: users edit logical definition fields, physical count, and partial content share, while the API writes `logical_component`, `metric`, and implementation-option-scoped `physical_partition` rows behind the scenes. Do not expose the raw metric long table as the primary daily-edit UI.

Physical partition edits must use the selected implementation option as the working context. A partition's `tier_id` must belong to the same `impl_option_id`; backend save and import validation enforce this. Do not create UI flows that mix tiers from one implementation option with partitions from another.

The frontend also includes an Implementation page. Treat it as physical stack/interface definition for `impl_option`, not as logical hierarchy or physical partition maintenance. One project can have multiple implementation options, and each option can represent a monolithic, 2.5D, or W2W 3DIC implementation form.

Implementation definitions are persisted in `imploptiondetail`, `implementationtier`, `implementationinterface`, and `implementationpackageescape`. The API boundary is:

- `GET /api/impl-options/{impl_option_id}/detail`
- `PUT /api/impl-options/{impl_option_id}/detail`

If no saved implementation exists, the GET endpoint synthesizes starting tier definitions from `tier` rows for that implementation option. Saves are versioned. Keep tier-structure edits conservative: if `physical_partition` rows already use a tier in the same implementation option, the backend must block saves that remove/rename that tier or reorder it.

Implementation-definition rules to preserve:

- single-layer monolithic options are valid and do not have inter-layer interfaces
- die/layer order is top to bottom
- Face/Back choices are chained; a die side used by the upper interface cannot be reused by the lower interface
- HB pitch and TSV pitch are decoupled
- TSV parameters are side-specific; `Back-to-Back` can require independent upper-side and lower-side TSV pitch/keep-out
- bottom-die package escape is derived from the last die-to-die orientation; if the bottom die back side faces bumps, represent it as a derived `Tn-BUMP` TSV interface
- cross-section Face/Back surface markers are derived from interface orientation and should remain synchronized with orientation edits
- do not merge implementation-form storage with physical partition storage; partitions describe logical-to-tier mapping, while implementation tables describe physical stack/interface intent
## Development Principles

1. Keep phase 1 local and easy to run.
2. Prefer simple, explicit data structures over premature abstraction.
3. Keep the frontend backed by API data, not hard-coded business data.
4. Preserve future paths for source traceability and data quality checks.
5. Keep SQLite schema clear enough to migrate to PostgreSQL later.
6. Do not add enterprise concerns before the MVP is stable.
7. Prefer V7 workbook/schema terminology in new code and docs.

## Git Remote Policy

- `origin` is the primary GitHub repository: `https://github.com/smhe00/soc_data.git`.
- `gitee` is the backup repository: `https://gitee.com/smhe/soc_database.git`.
- Every future push must push the same committed code to both remotes. After `git push origin master`, also run `git push gitee master`; when tags are involved, push tags to both remotes as well.
