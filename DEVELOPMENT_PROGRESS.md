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
- Added demo Excel import workbook at `templates/soc_import_demo.xlsx`.
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
- Added `templates/soc_physical_mapping_review.xlsx` to review the proposed relationship between reusable module definitions, compact logical components, and scenario-specific physical implementations across tiers/dies, including full-instance and partial-partition mappings.
- Added `templates/soc_mapping_metrics_review_v2.xlsx` as a cleaner review model where `physical_implementations` only stores mapping skeleton fields and all measurable/evolving details move into a unified `metrics` sheet with `subject_type`.
- Added `templates/soc_mapping_metrics_review_v3.xlsx` to keep logical static attributes such as port counts and nominal transistor counts directly on `logical_components`, while preserving the slim mapping-only `physical_implementations` table.
- Added `templates/soc_mapping_metrics_review_v4.xlsx` after simplifying `logical_components` back to hierarchy + `logical_instance_count`. Logical attributes now live in `metrics`, with phase-1 core metrics limited to `signal_count_total`, `logic_area`, `sram_area`, and `block_area`.
- Added `templates/soc_mapping_metrics_review_v5.xlsx` after simplifying `physical_implementations` to 11 mapping-only columns. Redundant fields such as `module_definition_id`, indexes, and partition labels were removed.
- Added `templates/soc_mapping_metrics_review_v6.xlsx` after renaming the mapping table to `physical_partitions`, replacing instance counts with simple `partition_ratio`, and moving all detailed implementation quantities into `metrics` with `subject_type=physical_partition`.
- Added `templates/soc_mapping_metrics_review_v7.xlsx` after restoring explicit physical partition quantity as `physical_instance_count` while keeping `partition_ratio` for logical content share. V7 also adds a `coverage_checks` sheet so repeated logical modules can be reviewed against physical counts and ratio closure.
- Updated the FastAPI/SQLite platform code to use the V7 structure:
  - `ModuleDefinition`
  - `LogicalComponent`
  - `PhysicalPartition`
  - unified `Metric` with `subject_type` / `subject_id`
- Added `GET /api/module-definitions` and `GET /api/physical-partitions`.
- Updated existing dashboard, components, tree, tiers, metrics, and import APIs to read/write V7 data while preserving the frontend page flow.
- Updated the frontend hierarchy and tier pages so logical hierarchy, physical instance count, partition ratio, and metric details come from API data.
- Updated Excel import to accept `soc_mapping_metrics_review_v7.xlsx` and validate the V7 sheets.
- Replaced the small V7 seed with a realistic flagship mobile SoC demo:
  - Project: `Orion X1 Mobile SoC`
  - Scenarios: monolithic N3E baseline, 3-tier 3DIC performance option, and cost-optimized 2.5D option
  - 36 logical components covering CPU, GPU, NPU, ISP, media, display, 5G modem, memory subsystem, NoC, IO/PHY, secure island, and always-on PMU
  - 35 physical partitions across compute, SRAM/cache, and IO/always-on tiers
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
  - `physical_instance_count` remains the manually maintained quantity.
  - `content_share` replaces the user-facing `partition_ratio` concept.
  - `content_share` is fixed to `1` for `full` partitions and only editable for `partial`.
  - `instance_share` is computed from `physical_instance_count / logical_instance_count` and is not manually entered.
  - Quality closure now checks `sum(physical_instance_count * content_share) == logical_instance_count`.
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
physical_partitions: 35
dashboard: total_area=119.0, total_power=45.3, total_sram_area=72.9, phy_area=19.3
quality_issues: 0
```
- Team-scoped API checks passed as part of `scripts/check_phase1.py`:

```text
AI Team components: 4
AI Team physical_partitions: 5
AI Team quality_issues: 0
```
- Team workbook round-trip passed in `scripts/check_phase1.py`:

```text
AI Team imported logical_components: 4
AI Team imported physical_partitions: 5
AI Team imported metrics: 45
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

## Suggested Next Steps

- Add simple create/update APIs after the read-only flow is stable.
- Split the single `App.tsx` prototype into page and component files.
- Add basic backend API tests for the seven read-only endpoints.
- Extend Web maintenance from physical partitions into friendly logical metric cards.
- Add a guided mapping wizard on top of the same component detail API.
