# Codex Agent Status

STATUS: READY_FOR_CHATGPT_REVIEW

> Persistent coordination file for `smhe00/soc_data` Phase-2 hardening.  
> Codex should update this file on branch `codex/phase2-hardening` before and after each meaningful batch of changes.

## Current State

| Field | Value |
|---|---|
| Branch | `codex/phase2-hardening` |
| Last updated | 2026-06-15 |
| Current batch | P0.2 NULL metric identity follow-up complete |
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

### In Progress

- None.

### Next

1. Await ChatGPT review on PR #2.
2. Continue to P0.3/P0.4 only after the next review.
3. Preserve existing metric API behavior.

## Validation Log

| Command | Result | Notes |
|---|---|---|
| `uv run pytest` | Passed | 18 tests passed; existing FastAPI deprecation warnings only. |
| `uv run python scripts/verify_import.py` | Passed | Import template round trip returned no errors; redundant legacy metric rows were filtered. |
| `uv run python scripts/check_phase1.py` | Passed | Expected Phase-1 counts and camera power summary preserved. |
| `cd frontend && npm run build` | Passed | Vite build completed. |

## Final Reviewer Checklist

- [x] Existing demo database starts successfully.
- [ ] New empty database can be created from UI/API.
- [x] Demo seed still produces expected Phase-1 counts.
- [x] `uv run pytest` passes.
- [x] `uv run python scripts/verify_import.py` passes.
- [x] `uv run python scripts/check_phase1.py` passes.
- [x] `cd frontend && npm run build` passes.
- [x] No destructive DB field rename without compatibility alias.
- [ ] No silent overwrite of high-confidence/tool-extracted metrics.
- [ ] Power Dataset is no longer described as physical partition mapping in new code.
- [ ] Final PR summary is complete.
