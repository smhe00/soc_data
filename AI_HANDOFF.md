# AI Handoff

This repository is the Phase-1 MVP for a SoC cross-die / 3DIC architecture database.

## Current State

- Backend: FastAPI + SQLModel + SQLite in `backend/main.py`.
- Frontend: React + TypeScript + Vite in `frontend/`.
- Import template: `templates/soc_import_template.xlsx`.
- Canonical schema notes: `docs/schema_v7.md`.
- Main progress log: `DEVELOPMENT_PROGRESS.md`.
- Agent-facing project rules: `AGENTS.md`.

The latest demo seed models a realistic flagship mobile SoC:

- 43 logical components.
- 144 physical partitions.
- 3 implementation options:
  - `S1`: monolithic N3E baseline.
  - `S2`: 3-tier W2W 3DIC performance option.
  - `S3`: cost-optimized 2.5D option.
- `S2` is the primary working demo implementation option.
- Quality issues should be `0` after seed.

## Critical Data Semantics

The current schema is V7. Do not revert to the original `ComponentInstance` / `ComponentMetric` draft.

Logical hierarchy:

- `logical_component` stores the logical tree and `logical_instance_count`.
- Repeated modules stay one logical row with a count.
- Parent residual/self/glue area is not stored as a logical component row.
- Residual/self area is derived as parent total area minus direct child total area.

Physical mapping:

- physical_partition maps a logical component's own self/residual content to an implementation-option tier.
- It does not stand in for child modules.
- Resource categories are independent: `logic`, `sram`, `block`.
- If a component's own self/residual area is zero for a category, that category must not appear in direct map rows.
- Full mapping is recursive: a component is closed only when its own non-zero categories close and all child subtrees close.
- `content_share` is manually meaningful only for `partial`; `full` always means `content_share = 1`.
- `instance_share` is computed, not manually entered.

Area semantics:

- Logical `logic_area`, `sram_area`, and `block_area` are base-process areas.
- `process_node` stores `logic_area_scale`, `sram_area_scale`, and `block_area_scale`.
- `tier_area_distribution` reports process-scaled physical area per tier for the selected logical subtree.
- The UI shows base-area closure in `Total Logic / SRAM / Block Area`.
- The UI shows process-scaled tier allocation in `Physical Coverage`.

Application power semantics:

- The demo keeps power values on logical modules under the current `impl_option` and selected Power Dataset; it does not yet split power to tiers or hard macros.
- In Phase 1, Power Dataset is still stored through the compatibility table/field `physical_mapping` / `physical_mapping_id`. Treat it as a power data baseline or back-annotation set, such as architecture estimate, RTL/PTPX simulation, post-PnR power, or silicon measurement, not as physical partition maintenance.
- A module use case power value is keyed by `impl_option_id + physical_mapping_id + component_id + use_case_name + operating_point_set_id`.
- Every module can use `Default` as a use case name, but `Default` is not usable in an application scenario until a real Profile and power value are saved.
- An application scenario is a composition: it checks which module use case/Profile rows participate in the scenario.
- Scenario total power is the sum of checked module use case/Profile rows.
- Inclusive parent rows can coexist with inactive child assignments for roll-up comparison. The unexplained parent-child delta is shown as unsplit power, not as an automatic database row.

## Important Files

- `backend/main.py`
  - SQLModel models.
  - SQLite compatibility migration.
  - demo seed.
  - import/export endpoints.
  - quality rules.
  - component/tier/dashboard APIs.
- `frontend/src/App.tsx`
  - Main app shell and navigation.
  - Hierarchy editor with separate logical definition and physical partition mapping panels.
  - Implementation option detail editor.
  - Application power use case and scenario composition page.
- `frontend/src/types/component.ts`
  - Shared component/partition response types.
- `scripts/check_phase1.py`
  - Main regression smoke test.
  - Re-seeds demo data through TestClient startup.
- `scripts/verify_import.py`
  - Static workbook import check.

## Commands

Run backend:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database
uv run uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Run frontend:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database\frontend
npm run dev
```

Verify backend and data:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database
uv run python scripts\check_phase1.py
```

Verify import template:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database
uv run python scripts\verify_import.py
```

Build frontend:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database\frontend
npm run build
```

Run `verify_import.py` and `check_phase1.py` sequentially, not in parallel. They both touch SQLite state. Run `check_phase1.py` last if you want the local database restored to the full demo seed.

## Expected Verification Snapshot

`uv run python scripts\check_phase1.py` should report:

```text
components: 43
physical_partitions: 144
quality_issues: 0
AI Team components: 4
AI Team physical_partitions: 19
AI Team imported metrics: 92
camera_power_w: 5.295
```

`uv run python scripts\verify_import.py` should report:

```text
soc_import_template.xlsx
physical_partitions: 8
metrics: 17
errors: []
```

## Current Boundaries

Do not add these in Phase 1 unless explicitly requested:

- Docker.
- PostgreSQL.
- Alembic migrations.
- Full authentication / complex permissions.
- AI parsing or optimization features.
- Thermal surrogate model.

## Suggested Next Work

- Split `backend/main.py` into smaller modules once behavior stabilizes.
- Add focused pytest tests for quality rules, import validation, and application power roll-up validation.
- Add a schema/version banner to exported workbooks.
- Convert lightweight team filtering into real authentication/authorization only in a later phase.
