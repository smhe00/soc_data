# Development Progress

## Project Root

Set `PROJECT_ROOT` to the repository root on your machine. All paths in this document are relative to that directory.

macOS/Linux:

```sh
export PROJECT_ROOT=/path/to/soc_database
cd "$PROJECT_ROOT"
```

Windows PowerShell:

```powershell
$env:PROJECT_ROOT="C:/path/to/soc_database"
cd $env:PROJECT_ROOT
```

## Completed

- Created the FastAPI backend in `backend/main.py`.
- Added SQLModel + SQLite models:
  - `Project`
  - `Scenario`
  - `ComponentInstance`
  - `ProcessNode`
  - `Tier`
  - `ComponentMetric`
- Added automatic SQLite table creation and demo seed data on backend startup.
- Implemented read-only MVP APIs:
  - `GET /api/projects`
  - `GET /api/scenarios`
  - `GET /api/components`
  - `GET /api/components/tree`
  - `GET /api/tiers`
  - `GET /api/metrics`
  - `GET /api/dashboard`
- Added uv-based backend project configuration in `pyproject.toml`.
- Added frontend Vite/React TypeScript project files.
- Added frontend API modules under `frontend/src/api`.
- Added frontend data types under `frontend/src/types`.
- Updated `frontend/src/App.tsx` so Dashboard, Block Hierarchy, Tier, and Scenario Compare pages read from the API instead of hard-coded business mock data.
- Renamed visible project branding to English:
  - Browser title: `SoC Cross-Die Database`
  - Sidebar brand: `SoC Cross-Die DB`
  - Package name: `soc-cross-die-database`
- Added `frontend/src/vite-env.d.ts` so `import.meta.env` is typed correctly.
- Added an early demo Excel import workbook, later superseded by the V7 resource-category template.
- Added Excel import endpoints:
  - `GET /api/import/template`
  - `POST /api/import/excel`
- Updated the frontend Imports page to download the template and upload `.xlsx` files.
- Improved `component_metrics` as a human-maintainable long table:
  - formula-assisted `id`, `metric_unit`, `metric_category`, and `workload`
  - dropdown validation for key fields
  - `metric_dictionary` helper sheet
  - backend fallback generation when formula cache values are absent
  - natural-key metric upsert to avoid duplicate imports
- Iterated through several review workbook versions while converging the schema from physical implementation sketches to the current V7 `logical_components` / `physical_partitions` / `metrics` model.
- Added `templates/soc_import_template.xlsx` as the only retained import template after resource-category mapping split physical partitions into `logic`, `sram`, and `block` rows.
- Updated the FastAPI/SQLite platform code to use the V7 structure:
  - `ModuleDefinition`
  - `LogicalComponent`
  - `PhysicalPartition`
  - unified `Metric` with `subject_type` / `subject_id`
- Added `GET /api/module-definitions` and `GET /api/physical-partitions`.
- Updated existing dashboard, components, tree, tiers, metrics, and import APIs to read/write V7 data while preserving the frontend page flow.
- Updated the frontend hierarchy and tier pages so logical hierarchy, physical instance count, partition ratio, and metric details come from API data.
- Updated Excel import to accept `soc_import_template.xlsx` and validate the current V7 resource-category sheets.
- Replaced the small V7 seed with a realistic flagship mobile SoC demo:
  - Project: `Orion X1 Mobile SoC`
  - Scenarios: monolithic N3E baseline, 3-tier 3DIC performance option, and cost-optimized 2.5D option
  - 36 logical components covering CPU, GPU, NPU, ISP, media, display, 5G modem, memory subsystem, NoC, IO/PHY, secure island, and always-on PMU
  - 129 physical partitions across logic, SRAM, block, and parent residual/self resource-category mappings
  - Logical and physical metrics for signal count, logic/SRAM/block area, power, utilization, and shape descriptors
- Phase-1 close-out updates:
  - Updated `AGENTS.md` to reflect the current V7 model instead of the original `ComponentInstance` / `ComponentMetric` draft.
  - Added `docs/schema_v7.md` as the canonical schema note for logical hierarchy, physical partitions, metrics, and closure rules.
  - Added `SEED_DEMO` backend startup switch. Demo seed is enabled by default and can be disabled with `SEED_DEMO=false`.
  - Added `GET /api/quality/issues` with real V7 rules for partition ratio closure, physical count closure, required logical metrics, numeric metrics, and subject references.
  - Updated the frontend Quality page to read `/api/quality/issues`.
  - Added `scripts/check_phase1.py` for repeatable API/data smoke checks.
  - Updated `README.md` with current V7 startup, seed, import, quality, and Gitee notes.
- Added lightweight subsystem-owner scoped views:
  - Added `owner_team` and `visibility_level` to `logical_component`.
  - Added `responsibility_assignment` for team/user responsibility over a logical subtree.
  - Added `GET /api/responsibilities/teams`.
  - Added `?team=` filtering for components, component tree, physical partitions, metrics, and quality issues.
  - Added a frontend team scope selector while keeping the current UI style.
- Added the first "graceful input" path for subsystem owners:
  - `GET /api/import/template?team=...` dynamically generates a team-scoped workbook.
  - `POST /api/import/excel?team=...` validates team scope before import.
  - Team workbooks keep shared sheets as context, but scoped uploads only merge `logical_components`, `physical_partitions`, and `metrics`.
  - The frontend Imports page now downloads/uploads using the currently selected team.
- Added the first Web daily-maintenance path:
  - `PUT /api/components/{component_id}/detail` saves `logical_instance_count` plus physical partitions for one logical component.
  - The Hierarchy page now includes a Physical Partition Mapping editor for the selected component.
  - The editor shows live equivalent instance closure and tier summary before saving.
  - Save refreshes component data and quality issues.
- Clarified physical partition coverage semantics:
  - `physical_instance_count` remains the manually maintained parent-relative quantity.
  - `content_share` replaces the user-facing `partition_ratio` concept.
  - `content_share` is fixed to `1` for `full` partitions and only editable for `partial`.
  - `instance_share` is computed from `physical_instance_count / logical_instance_count` (both relative to parent) and is not manually entered.
  - Quality closure now checks `sum(physical_instance_count * content_share) == logical_instance_count` (both relative to parent).
- Moved residual/self/glue semantics into derived data:
  - Parent total area metrics include direct child module area.
  - Residual/self area is computed as parent total area minus direct child area, not stored as component rows.
  - Physical partition `partition_type` is limited to `full` or `partial`.
- Added frontend scenario implementation definition prototype:
  - Added an `实现方案` navigation page for scenario-level implementation forms.
  - Supports monolithic single-layer, wafer-to-wafer 3DIC, and 2.5D interposer-style scenario options.
  - Keeps implementation definition tied to `scenario`, so one project can compare multiple implementation forms.
  - Added editable layer/die definitions with top-to-bottom order, process, role, and thickness.
  - Added inter-layer orientation controls with chained Face/Back constraints.
  - Added derived bottom-die package escape: `Tn-BUMP` TSV appears when the bottom die back side faces package bumps.
  - Split HB and TSV pitch fields; split TSV parameters into upper-side and lower-side TSV fields so `Back-to-Back` can model both sides independently.
  - Added a compact live cross-section preview for the selected scenario implementation.
- Added scenario-scoped physical partition workflow:
  - Added a global header `Scenario` selector.
  - Components, component tree, tiers, physical partitions, metrics, quality issues, responsibility teams, import templates, workbook uploads, and dashboard data now accept/use the selected `scenario_id`.
  - Component detail saves no longer hard-code `S2`; new and updated physical partitions are written for the selected scenario.
  - Backend dashboard now accepts `?scenario_id=...`.
  - Backend import validation now rejects a `physical_partition` whose `tier_id` belongs to a different scenario.
- Added resource-category-specific physical partition mapping:
  - Added `physical_partition.resource_category` with `logic`, `sram`, and `block` values.
  - Component detail mapping now edits category per partition row.
  - Equivalent instance closure is now checked independently per resource category.
  - Existing coarse mappings default to `block` for compatibility until refined into logic/SRAM/block rows.
  - Import templates and workbook validation include `resource_category`.
  - Mapping rows sort as Logic, SRAM, then Block.
  - Partition ID/name are generated from logical component name, resource category, tier, and partial index; users no longer edit ID/name directly.
  - Multiple partial rows can target the same tier and are numbered independently per resource category/tier.
- Improved implementation and partition editing ergonomics:
  - Added compact field labels, segmented controls, unit-number inputs, and layer count stepper controls.
  - Added Face/Back-linked cross-section surface markers so tier surface lines reflect chained interface orientation.
  - Added current-scenario empty states on the `3D Tier` page.
- Persisted scenario implementation definitions:
  - Added `scenario_implementation`, `implementation_tier`, `implementation_interface`, and `implementation_package_escape` tables.
  - Added `GET /api/scenarios/{scenario_id}/implementation` and `PUT /api/scenarios/{scenario_id}/implementation`.
  - The implementation page now loads saved scenario implementation data and saves versioned drafts.
  - If no saved implementation exists, the backend synthesizes starting tier definitions from that scenario's `tier` rows.
  - Backend impact checks block dangerous saves when physical partitions already reference a tier that would be removed, renamed, or reordered.
- Added frontend display themes:
  - Light/dark theme toggle in the header.
  - Theme preference is stored in browser `localStorage`.
  - Dark theme covers page background, sidebar, cards, tables, forms, badges, and implementation cross-section preview.
- Added process-scaled physical area coverage:
  - `process_node` stores separate logic/SRAM/block area scaling factors.
  - Component detail responses expose `tier_area_distribution`.
  - Demo seed now maps parent residual/self area so SoC top base area closes before process scaling.
  - The UI shows base-area mapping closure in the Total Area card and process-scaled tier area in Physical Coverage.
  - Quality checks now reject zero-area category maps and verify recursive logic/SRAM/block mapping closure.
- Added MVP functional enhancements:
  - Added a Web form for editing logical component metrics (Logical Instances, Signal Count, Logic Area, SRAM Area, Block Area, Power) inside the details editor panel, which updates the DB metrics via the detail save endpoint.
  - Added quality checks and warnings for tier area limit exceedance after process scaling.
  - Updated the detail panel to clearly distinguish between Self/Residual mapping closure and Subtree mapping closure status.
- Refactored Scenario to ImplOption (实现选项):
  - Renamed all backend SQLModel classes (`Scenario` -> `ImplOption`, `ScenarioImplementation` -> `ImplOptionDetail`) and SQLite tables.
  - Renamed columns and foreign keys from `scenario_id` to `impl_option_id` across all tables.
  - Renamed REST APIs from `/api/scenarios` to `/api/impl-options`.
  - Updated all frontend components, TypeScript typings, and API client routes.
  - Regenerated the Excel import template and seeded the database under the new schema.
  - Verified that all unit tests and builds compile and run successfully.

## Latest Application Power Rework

- Separated module use case/Profile power values from application scenario composition.
- Added `ApplicationScenarioSelection` persistence so a scenario explicitly selects module use cases.
- Treats `Default` as a normal use case name that still requires a saved Profile and power value before it can be included.
- Replaced the large mixed-purpose power page with a focused module hierarchy table for editing use cases and checking them into a scenario.
- Added smoke checks for module power library, scenario composition, summary total, and invalid-reference rejection.

## Verified

- `uv sync` completed successfully.
- Backend Python syntax check passed:

```sh
uv run python -m py_compile backend/main.py
```

- Backend imports passed:

```sh
uv run python -c "import fastapi, sqlmodel, uvicorn; import backend.main; print('backend imports ok')"
```

- Frontend dependencies installed successfully after retrying npm with stronger fetch retry options.
- Frontend production build passed:

```sh
npm run build
```

- Demo Excel import passed:

```sh
uv run python scripts/verify_import.py
```

Expected V7 imported counts:

```text
module_definitions: 4
projects: 1
scenarios: 1
tiers: 3
logical_components: 6
physical_partitions: 8
metrics: 17
```
- Frontend production build passed after the V7 UI/data update:

```sh
cd frontend
npm run build
```
- Realistic mobile SoC demo API smoke test passed:

```text
components: 36
physical_partitions: 129
dashboard: total_area=119.0, total_power=45.3, total_sram_area=72.9, phy_area=19.3
quality_issues: 0
```
- Team-scoped API checks passed as part of `scripts/check_phase1.py`:

```text
AI Team components: 4
AI Team physical_partitions: 19
AI Team quality_issues: 0
```
- Team workbook round-trip passed in `scripts/check_phase1.py`:

```text
AI Team imported logical_components: 4
AI Team imported physical_partitions: 19
AI Team imported metrics: 115
```
- Component detail save smoke check passed:

```text
PUT /api/components/B_NPU_TENSOR/detail -> B_NPU_TENSOR
quality_issues: 0
```
- Frontend production build passed after adding the scenario implementation page, constrained Face/Back interface rules, split HB/TSV parameters, and light/dark theme:

```sh
cd frontend
npm run build
```

- Frontend production build passed after adding global scenario scope and scenario-bound physical partition editing:

```sh
cd frontend
npm run build
```

- Backend Python syntax check passed after adding dashboard `scenario_id` and cross-scenario tier/partition import validation:

```sh
.venv/bin/python -m py_compile backend/main.py
```

- Backend Python syntax check passed after adding scenario implementation persistence:

```sh
.venv/bin/python -m py_compile backend/main.py
```

- Frontend production build passed after wiring the implementation page to the persistence API:

```sh
cd frontend
npm run build
```

- Scenario implementation API smoke checks passed:

```text
GET /api/scenarios/S2/implementation -> synthesized/saved tier definitions
PUT /api/scenarios/S2/implementation -> saved implementation v1
dangerous PUT removing T0 from S2 -> 409 impact errors
browser Save on 实现方案 page -> saved implementation v2
```

- Resource-category demo seed close-out passed:

```text
components: 36
physical_partitions: 129
quality_issues: 0
SoC top base area closure: 537.0 mapped / 537.0 logical
AI Team physical_partitions: 19
AI Team imported metrics: 115
```

- Current static import template passed:

```text
soc_import_template.xlsx
physical_partitions: 8
metrics: 17
```

## Startup Commands

Start backend:

```sh
cd "$PROJECT_ROOT"
uv sync
uv run uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Start frontend in another terminal:

```sh
cd "$PROJECT_ROOT/frontend"
npm run dev
```

Open:

```text
http://localhost:5173/
```

## npm Install Note

If `npm install` fails with `ECONNRESET`, retry with:

```sh
cd "$PROJECT_ROOT/frontend"
npm install --fetch-retries=5 --fetch-retry-factor=2 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
```

## Known Notes

- npm reported 2 moderate vulnerabilities after install. Do not run `npm audit fix --force` blindly because it may introduce breaking dependency upgrades.
- Old local working copies may remain locked while an existing Codex workspace or terminal is attached to them. Close old sessions before deleting them.
- This MVP intentionally does not include Docker, PostgreSQL, Alembic, complex auth, AI features, auto partition optimization, or thermal surrogate modeling.

## Suggested Phase-2 Next Steps

- Split the single `App.tsx` prototype into page and component files.
- Add dedicated backend tests for scenario implementation persistence and resource-category closure.
- Extend Web maintenance from physical partitions into friendly logical metric cards.
- Add a guided mapping wizard on top of the same component detail API.
