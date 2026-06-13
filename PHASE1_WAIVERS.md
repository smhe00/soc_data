# Phase-1 Waivers

This document records deliberate Phase-1 scope waivers and compatibility exceptions. These are not bugs to fix during the MVP cleanup unless explicitly reprioritized.

## Milestone Status

Current release candidate: backend split through Power, Import, pytest coverage, and explicit Power Dataset modeling.

Validation completed before tagging:

```powershell
uv run pytest
uv run python scripts\verify_import.py
uv run python scripts\check_phase1.py
cd frontend
npm run build
```

Expected data snapshot remains:

- 43 logical components.
- 144 physical partitions.
- 0 quality issues after demo seed.
- AI Team scoped import metrics: 92.
- Camera 4K60 scenario power: 5.295 W.

## Intentional Phase-1 Scope Waivers

- No Docker packaging.
- No PostgreSQL deployment.
- No Alembic migration framework.
- No full authentication, RBAC, or enterprise permission system.
- No AI parsing, AI optimization, or automatic partition inference.
- No thermal surrogate model.
- No tier-level, rail-level, or hard-macro-level power decomposition.

## Compatibility Waivers

### `physical_mapping_id`

Power Dataset is now a real backend model stored in `powerdataset`. The field name `physical_mapping_id` remains in existing power APIs and tables as a compatibility alias for the selected Power Dataset id.

Do not rename this field in Phase 1 unless the frontend, tests, scripts, and existing SQLite compatibility path are migrated together.

### `physicalmapping`

The legacy `physicalmapping` table remains only as compatibility storage for existing demo ids and old SQLite databases. Startup compatibility migration copies legacy rows into `powerdataset` when needed.

New application power code should use `/api/power-datasets` and `PowerDataset`; `/api/physical-mappings` remains an alias.

### `partition_ratio`

`partition_ratio` remains as a legacy alias. `content_share` is the meaningful field for partial physical partitions.

## Accepted Local Warnings

The current pytest run reports known dependency/framework warnings:

- `python_multipart` import deprecation from Starlette.
- FastAPI `on_event` deprecation in favor of lifespan handlers.

These are accepted for the current Phase-1 tag because they do not change runtime behavior. Lifespan migration is a future cleanup item.

