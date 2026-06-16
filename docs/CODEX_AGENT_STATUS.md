# Codex Agent Status

STATUS: READY_FOR_CHATGPT_REVIEW

> Persistent coordination file for `smhe00/soc_data` Phase-2 hardening.  
> Codex should update this file on branch `codex/phase2-hardening` before and after each meaningful batch of changes.

## Current State

| Field | Value |
|---|---|
| Branch | `codex/phase2-hardening` |
| Last updated | 2026-06-16 |
| Current batch | Final PR-readiness batch complete |
| PR | https://github.com/smhe00/soc_data/pull/2 |
| Blocking status | Not blocked |

## Working Assumptions

- Preserve existing API compatibility unless a compatibility alias is explicitly added.
- Do not commit implementation changes directly to `master`.
- Keep SQLite support as the primary Phase-2 target.
- Do not implement full authentication/RBAC in this phase.
- Do not silently overwrite high-confidence or tool-extracted metrics.
- Conflicting duplicate metric identities intentionally block migration with a hard error unless covered by a narrow known legacy redundant-ID rule; dirty DBs must be cleaned manually rather than silently resolved.

## Batch Log

| Batch | Scope | Files touched | Status | Validation |
|---|---|---|---|---|
| 0 | Read real Phase-2 plan and prepare branch | `docs/CODEX_PHASE2_HARDENING_PLAN.md`, `docs/CODEX_AGENT_STATUS.md` | Complete | Not run |
| 1 | Add explicit schema version and migration history | `backend/models.py`, `backend/migrations.py`, `backend/db.py`, `tests/test_schema_migrations.py` | Complete | `uv run pytest`; `uv run python scripts\verify_import.py`; `uv run python scripts\check_phase1.py`; `cd frontend && npm run build` passed |
| 2 | Open draft PR for ongoing Phase-2 hardening | `docs/CODEX_AGENT_STATUS.md` | Complete | PR #2 created as draft |
| 3 | Address ChatGPT P0.1 review items | `backend/migrations.py`, `backend/db.py`, `tests/test_schema_migrations.py`, `docs/CODEX_AGENT_STATUS.md` | Complete | `uv run pytest`; `uv run python scripts\verify_import.py`; `uv run python scripts\check_phase1.py`; `cd frontend && npm run build` passed |
| 4 | Add metric identity uniqueness and duplicate protection | `backend/migrations.py`, `backend/imports.py`, `backend/main.py`, `tests/test_schema_migrations.py`, `tests/test_import_validation.py` | Complete | `uv run pytest`; `uv run python scripts\verify_import.py`; `uv run python scripts\check_phase1.py`; `cd frontend && npm run build` passed |
| 5 | Normalize NULL metric identity fields before unique index | `backend/migrations.py`, `tests/test_schema_migrations.py`, `docs/CODEX_AGENT_STATUS.md` | Complete | `uv run pytest`; `uv run python scripts\verify_import.py`; `uv run python scripts\check_phase1.py`; `cd frontend && npm run build` passed |
| 6 | P0.3 Power Dataset naming cleanup and P0.4 Metric provenance | `backend/power.py`, `backend/schemas.py`, `backend/models.py`, `backend/migrations.py`, `backend/imports.py`, `backend/main.py`, `backend/seed.py`, frontend power types/API, tests | Complete | `uv run pytest`; `uv run python scripts\verify_import.py`; `uv run python scripts\check_phase1.py`; `cd frontend && npm run build` passed; `git merge-tree --write-tree HEAD origin/master` clean |
| 7 | P0.3/P0.4 review follow-up | `backend/main.py`, `backend/power.py`, `tests/test_phase1_api.py`, `docs/CODEX_AGENT_STATUS.md` | Complete | `uv run pytest`; `uv run python scripts\verify_import.py`; `uv run python scripts\check_phase1.py`; `cd frontend && npm run build` passed; `git merge-tree --write-tree HEAD origin/master` clean |
| 8 | P0.5 service extraction | `backend/main.py`, `backend/services/*`, `docs/CODEX_AGENT_STATUS.md` | Complete | `uv run pytest`; `uv run python scripts\verify_import.py`; `uv run python scripts\check_phase1.py`; `cd frontend && npm run build` passed; `git merge-tree --write-tree HEAD origin/master` clean |
| 9 | P0.5 metric lookup follow-up | `backend/services/metric_service.py`, `backend/main.py`, `tests/test_phase1_api.py`, `docs/CODEX_AGENT_STATUS.md` | Complete | `uv run pytest`; `uv run python scripts\verify_import.py`; `uv run python scripts\check_phase1.py`; `cd frontend && npm run build` passed; `git merge-tree --write-tree HEAD origin/master` clean |
| 10 | Final PR readiness | `README.md`, `frontend/src/api/power.ts`, `frontend/src/components/ApplicationPowerView.tsx`, `frontend/src/types/power.ts`, `tests/test_db_switch.py`, `docs/CODEX_AGENT_STATUS.md` | Complete | `uv run pytest`; `uv run python scripts\verify_import.py`; `uv run python scripts\check_phase1.py`; `cd frontend && npm run build` passed; `git merge-tree --write-tree HEAD origin/master` clean |

## Blocking Questions

| ID | Question | Impact | Proposed safe default | Status |
|---|---|---|---|---|
| Q1 | Should existing legacy compatibility statements be represented as migration history even when the schema already has those columns? | Affects how much historical migration detail appears in `migration_history`. | Record idempotent migration rows for the compatibility migrations and keep legacy cleanup safe. | Resolved by implementation |
| Q2 | Should migration history use date-only timestamps from `now_iso()`? | Migration history is audit-like metadata. | Use UTC ISO timestamps with seconds precision for migration metadata while preserving existing date-only `now_iso()` behavior elsewhere. | Resolved by implementation |

## Change Summary

### Completed

- Read `docs/CODEX_PHASE2_HARDENING_PLAN.md` from `origin/docs/codex-phase2-plan`.
- Confirmed current implementation branch is `codex/phase2-hardening`.
- Avoided merging the full docs branch because it is based on older code and would revert recent master changes.
- Added `schema_version` and `migration_history` SQLModel tables.
- Added `backend/migrations.py` with idempotent V7.001-V7.006 migration runner.
- Routed existing SQLite compatibility cleanup through the migration runner without changing API behavior.
- Added a focused migration idempotency/status test.
- Opened draft PR: https://github.com/smhe00/soc_data/pull/2.
- Changed schema migrations to run recorded migrations only when not already applied.
- Split repeated legacy data cleanup into `run_legacy_compatibility_guards()`.
- Switched migration metadata timestamps to UTC ISO seconds precision.
- Added old/partial SQLite coverage for missing columns, parent residual cleanup, power metric cleanup, legacy `physicalmapping` to `powerdataset`, and idempotent reruns.
- Added V7.007 metric identity uniqueness migration.
- Deduplicated identical metric identity rows before creating `ux_metric_identity`.
- Kept conflicting duplicate metric identities as hard migration failures, except for three known legacy redundant metric IDs that are dropped only when a canonical row for the same identity exists.
- Added import-time duplicate metric identity validation.
- Dropped known redundant legacy metric rows during import when a canonical identity exists, preventing the old template from reintroducing rows removed by migration.
- Added duplicate metric identity quality issue reporting for existing dirty data.
- Normalized legacy `metric.corner` NULL/empty values to `typical` before metric identity duplicate scanning.
- Normalized legacy `metric.workload` NULL/empty values to `nominal` before metric identity duplicate scanning.
- Added a clear migration failure for NULL/empty `impl_option_id`, `subject_type`, `subject_id`, or `metric_name`.
- Added tests proving NULL/empty corner/workload rows are normalized before dedupe, required identity fields fail clearly, and `ux_metric_identity` blocks duplicate normalized identities.
- Introduced `power_dataset_id` as the preferred Power Dataset API field while preserving `physical_mapping_id` in requests and responses.
- Kept `/api/physical-mappings` as a compatibility alias for `/api/power-datasets`.
- Added V7.008 metric provenance fields: `source_type` and `derivation`.
- Defaulted existing/imported metrics to `source_type='architecture_estimate'` and `derivation='manual'`.
- Marked auto-derived physical partition area/shape metrics as `source_type='architecture_estimate'` and `derivation='derived_from_logical_area'`.
- Protected approved or tool-extracted/PTPX/simulation/silicon metric rows from silent auto-derived physical partition recalculation overwrites.
- Verified local mergeability with `git merge-tree --write-tree HEAD origin/master`.
- Made web and auto-derived metric writes identity-aware under `ux_metric_identity`.
- Protected tool-extracted metrics even when their id differs from the generated auto-derived metric id but their metric identity matches.
- Updated unprotected same-identity metric rows deterministically instead of inserting duplicate generated ids.
- Rejected conflicting `power_dataset_id` / `physical_mapping_id` aliases with HTTP 400.
- Added TODO notes for DB-compatibility naming that still uses `physical_mapping_id` internally.
- Added `backend/services/metric_service.py` for metric lookup, numeric conversion, identity-aware web writes, and protected auto-derived partition metric writes.
- Added `backend/services/partition_mapping.py` for allowed partition categories/types, canonical partition naming, content share normalization, and equivalent instance calculation.
- Added `backend/services/area_rollup.py` for logical self/residual area summaries, resource-category detection, and process-scaled area helper functions.
- Added `backend/services/quality_rules.py` for quality issue response construction.
- Reduced `backend/main.py` by importing these low-risk service helpers while preserving existing route paths and response shapes.
- Checked for circular import risk with import/template verification; no circular import issue was observed.
- Made `metrics_for()` deterministic by filtering on explicit `corner` and `workload`, defaulting to `typical` / `nominal`.
- Kept existing area and rollup reads on the default `typical` / `nominal` metric identity.
- Made dashboard/implementation power reads explicitly use `workload='peak'`, preserving the seeded `total_power=45.3` behavior.
- Added regression coverage for same `metric_name` with a non-default corner/workload so component area reads do not collapse metric identities.
- Added dashboard power regression coverage to preserve peak power display.
- Verified PR mergeability locally against latest `origin/master` with `git fetch origin master; git merge-tree --write-tree HEAD origin/master`, which returned tree `0bfe3d2a1128aa87603b8114677636ca2efabbad` at final readiness head `c23f415add37095d0097d532323a3f797eb0b452`.
- Confirmed GitHub connector reports PR #2 `mergeable: true` for head `7c0123d94522e6def7c856877f246de41b823453` before the final readiness commit.
- Added API coverage proving a new empty SQLite database can be created with `POST /api/databases` using `seed_demo=false`, remains active, has `project_count=0`, and serves an empty `/api/projects` response.
- Updated frontend Application Power writes to send `power_dataset_id` as the primary field while retaining `physical_mapping_id` as an optional compatibility alias in request types.
- Removed the unused frontend `getPhysicalMappings()` helper and `PhysicalMapping` type alias so new frontend code uses Power Dataset naming.
- Updated README Application Power endpoint examples and semantics to use `/api/power-datasets` and `power_dataset_id`; legacy `/api/physical-mappings` and `physical_mapping_id` are documented only as compatibility aliases.
- Completed the final PR body summary and validation count.

### In Progress

- None.

### Next

1. Await ChatGPT review on PR #2.
2. Continue to the next Phase-2 batch only after the next review.
3. Preserve existing API compatibility.

## Validation Log

| Command | Result | Notes |
|---|---|---|
| `uv run pytest` | Passed | 26 tests passed; existing FastAPI deprecation warnings only. |
| `uv run python scripts/verify_import.py` | Passed | Import template round trip returned no errors; redundant legacy metric rows were filtered. |
| `uv run python scripts/check_phase1.py` | Passed | Expected Phase-1 counts and camera power summary preserved. |
| `cd frontend && npm run build` | Passed | Vite build completed. |
| `git merge-tree --write-tree HEAD origin/master` | Passed | Clean non-destructive mergeability check; final readiness head returned tree `0bfe3d2a1128aa87603b8114677636ca2efabbad`. |

## Final Reviewer Checklist

- [x] Existing demo database starts successfully.
- [x] New empty database can be created from UI/API.
- [x] Demo seed still produces expected Phase-1 counts.
- [x] `uv run pytest` passes.
- [x] `uv run python scripts/verify_import.py` passes.
- [x] `uv run python scripts/check_phase1.py` passes.
- [x] `cd frontend && npm run build` passes.
- [x] No destructive DB field rename without compatibility alias.
- [x] No silent overwrite of high-confidence/tool-extracted metrics.
- [x] Power Dataset is no longer described as physical partition mapping in new code.
- [x] Final PR summary is complete.
