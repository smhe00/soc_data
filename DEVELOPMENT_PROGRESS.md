# Development Progress

## Current Phase

The project is a Phase-1 SQLite MVP Alpha for a SoC cross-die / 3DIC architecture database. It is usable for demo data, local editing, import/export, physical mapping review, and application power composition, but it is not yet a multi-user production system.

## Current Architecture

Backend:

- FastAPI + SQLModel + SQLite in `backend/main.py`.
- Automatic table creation and compatibility migration at startup.
- Demo seed is enabled by default with `SEED_DEMO=true`.
- Additional SQLite databases can be created and selected through `/api/databases`.

Frontend:

- React + TypeScript + Vite in `frontend/`.
- Main navigation in `frontend/src/App.tsx`.
- API clients under `frontend/src/api`.
- Shared response types under `frontend/src/types`.

Import/export:

- Canonical workbook: `templates/soc_import_template.xlsx`.
- Excel remains the batch import/exchange format.
- Web editors are the preferred day-to-day maintenance surface.

## Current Data Model

Canonical schema notes live in `docs/schema_v7.md`.

Primary entities:

- `Project`
- `ImplOption`
- `ModuleDefinition`
- `LogicalComponent`
- `ProcessNode`
- `Tier`
- `PhysicalPartition`
- `Metric`
- `ResponsibilityAssignment`
- `ImplOptionDetail`
- `ImplementationTier`
- `ImplementationInterface`
- `ImplementationPackageEscape`
- `ApplicationScenario`
- `PhysicalMapping`
- `OperatingPointSet`
- `PowerObservation`
- `ApplicationScenarioSelection`

Important semantics:

- Physical implementation context is `impl_option_id`.
- `ApplicationScenario` is only for application workload power composition.
- Logical hierarchy stores repeated modules as one row plus `logical_instance_count`.
- Parent self/residual area is derived from parent total area minus direct child totals.
- Physical partitions attached to a parent map only that parent's self/residual content.
- `content_share` is the meaningful partial-partition content field; `partition_ratio` remains a compatibility alias.
- Application power is stored in module use case/Profile library rows and selected into application scenarios.
- Power roll-up uses explicit selection: included parent rows replace descendants, while included descendants make ancestors inactive.
- Parent-child power deltas are displayed as unsplit power, not automatically created as residual database rows.

## Implemented Features

- Local SQLite database management and demo seed.
- Dashboard, hierarchy, tier, schema, import, quality, implementation option, and application power pages.
- Logical hierarchy create/update/delete after initial import.
- Split logical definition editing from physical partition mapping editing.
- Physical mapping closure by resource category: `logic`, `sram`, `block`.
- Recursive mapping closure for subtree status.
- Process-scaled tier area distribution.
- Team-scoped filtering and team-scoped Excel templates/uploads.
- Import template download and workbook upload.
- Data quality API and UI gate.
- Application power use case/Profile library.
- Application scenario composition with included/inactive assignment semantics.
- Parent/child power roll-up status and unsplit explanation.
- Windows deploy script for local frontend/backend startup.

## Key Commands

Run backend:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database
uv run uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Run frontend:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database\frontend
npm run dev -- --host 0.0.0.0
```

Windows local deploy helper:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database
.\scripts\deploy_windows.ps1
```

Backend smoke check:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database
uv run python scripts\check_phase1.py
```

Import template check:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database
uv run python scripts\verify_import.py
```

Frontend build:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database\frontend
npm run build
```

## Verification Policy

Before tagging or pushing a cleanup milestone, run:

```powershell
uv run python scripts\check_phase1.py
cd frontend
npm run build
```

Run `scripts\verify_import.py` when the workbook template or import code changes.

## Current Boundaries

Do not add these in Phase 1 unless explicitly requested:

- Docker.
- PostgreSQL.
- Alembic migrations.
- Full authentication or complex permissions.
- AI parsing, AI optimization, or automatic partition inference.
- Tier-level and hard-macro-level power decomposition.

## Suggested Next Work

- Split `backend/main.py` into smaller modules after the current behavior is locked down.
- Add focused pytest coverage for quality rules, import validation, component editing, and application power roll-up validation.
- Add a schema/version banner to exported workbooks.
- Turn lightweight team filtering into real authorization in a later phase.
