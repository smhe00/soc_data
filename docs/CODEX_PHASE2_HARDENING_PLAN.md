# Codex Phase-2 Hardening Execution Plan

> Target repository: `smhe00/soc_data`  
> Target phase: Phase-2 hardening after the Phase-1 SQLite MVP  
> Primary goal: make the MVP safer for real SoC / 3DIC data before adding major new features.

## 1. Background

The current project is a Phase-1 MVP for a SoC cross-die architecture database and 3DIC evaluation prototype.

The existing system already supports:

- logical component hierarchy;
- implementation options;
- tiers and physical partitions;
- long-table metrics;
- Excel import/export;
- lightweight team-scoped workflow filtering;
- application scenario power modeling;
- power datasets;
- phase-1 quality checks.

The Phase-1 implementation is acceptable as a prototype, but several areas must be hardened before the system is used with real project data or extended by agents.

This document is the execution contract for Codex or another coding agent.

## 2. Non-Goals

Do **not** implement the following in this phase unless explicitly requested in a later instruction:

- no Docker packaging;
- no PostgreSQL deployment;
- no full enterprise RBAC;
- no thermal surrogate model;
- no AI partition optimizer;
- no automatic EDA data parsing beyond preserving current import flows;
- no major UI redesign;
- no destructive rename of existing database fields without compatibility aliases.

## 3. GitHub Communication Protocol

### 3.1 Branching

Codex must not work directly on `master` for implementation changes.

Use a working branch:

```bash
git checkout master
git pull
git checkout -b codex/phase2-hardening
```

If the branch already exists, reuse it only after pulling latest remote state.

### 3.2 Status File

Codex must use this file as the persistent communication log:

```text
docs/CODEX_AGENT_STATUS.md
```

Before making a meaningful batch of changes, update the status file with:

- current branch;
- current task batch;
- assumptions;
- files expected to change;
- blocking questions, if any;
- validation commands planned.

After each batch, update the same file with:

- completed changes;
- tests run;
- test results;
- known risks;
- next action.

The status file is intentionally part of the branch and PR so reviewers can inspect the agent's reasoning trail without relying on chat history.

### 3.3 PR Communication

Open one draft PR for the phase:

```text
Title: Phase-2 hardening: schema, metric, power, provenance, refactor
```

The PR body must include:

- summary of changed areas;
- migration behavior;
- compatibility guarantees;
- validation checklist;
- unresolved decisions.

Reviewer comments should be handled in one of three ways:

1. direct code change;
2. response in PR comment;
3. update to `docs/CODEX_AGENT_STATUS.md` if the issue requires decision tracking.

### 3.4 Commit Discipline

Use small, reviewable commits. Suggested commit groups:

```text
migrations: add schema version and migration history
metrics: add metric identity uniqueness checks
power: introduce power_dataset_id compatibility alias
metrics: add metric source and derivation metadata
refactor: split component and quality services
chore: update phase2 status and validation notes
```

Avoid one giant commit.

## 4. Required Validation Commands

Run these before opening the PR and after the final patch:

```bash
uv run pytest
uv run python scripts/verify_import.py
uv run python scripts/check_phase1.py
cd frontend
npm run build
```

If any command fails, do not hide it. Record the failure in `docs/CODEX_AGENT_STATUS.md`, including:

- exact command;
- failure summary;
- suspected cause;
- whether it blocks the PR.

## 5. Hardening Work Packages

## P0.1 Add Explicit Schema Version and Migration History

### Problem

The current startup compatibility logic is handled manually inside `ensure_sqlite_schema_compatibility()`. This is acceptable for Phase-1 but unsafe as schema changes accumulate.

### Goal

Introduce explicit schema versioning while preserving existing SQLite compatibility.

### Required Changes

Add two persistent tables:

```text
schema_version
migration_history
```

Recommended fields:

```text
schema_version:
- id: str primary key, fixed value such as "main"
- version: str
- updated_at: str

migration_history:
- id: str primary key
- version: str
- name: str
- applied_at: str
- checksum: str | optional
- status: str
- note: str
```

Add a migration runner, preferably:

```text
backend/migrations.py
```

The runner must be idempotent. Re-running startup must not corrupt existing data.

Initial migration names may be:

```text
V7_001_add_owner_team_and_visibility
V7_002_add_partition_content_share_and_resource_category
V7_003_add_process_area_scale
V7_004_migrate_legacy_physical_mapping_to_power_dataset
V7_005_remove_legacy_parent_residual_rows
V7_006_remove_power_metrics_from_metric_table
```

If current logic cannot be fully split safely in one pass, use a transitional structure:

```text
ensure_sqlite_schema_compatibility()
  -> run_schema_migrations()
  -> legacy_compatibility_cleanup()
```

### Acceptance Criteria

- New empty DB can start.
- Existing demo DB can start.
- Re-running startup is idempotent.
- `scripts/check_phase1.py` still passes.
- The migration status is queryable from SQLite.

## P0.2 Add Metric Identity Uniqueness and Duplicate Protection

### Problem

The long-table `Metric` model is flexible, but the system should prevent duplicate facts for the same subject and context.

### Metric Identity

The intended unique identity is:

```text
impl_option_id
subject_type
subject_id
metric_name
corner
workload
```

### Required Changes

Add a unique index or equivalent validation:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_metric_identity
ON metric (
  impl_option_id,
  subject_type,
  subject_id,
  metric_name,
  corner,
  workload
);
```

Before creating the unique index, scan for duplicates and handle them safely.

Preferred duplicate handling:

1. If duplicate rows have identical values, keep one row and delete the redundant rows.
2. If duplicate rows conflict, do not guess. Add a high-severity quality issue and block migration unless an explicit deterministic rule is implemented.

Add import-time validation so Excel import cannot create duplicate metric identity rows silently.

### Acceptance Criteria

- No duplicate metric identity rows in seeded demo data.
- Excel import rejects conflicting duplicate metric rows.
- Existing metric API behavior remains compatible.
- Phase-1 checks still pass.

## P0.3 Clean Up Power Dataset Naming Without Breaking Compatibility

### Problem

The current application power API still uses the field name `physical_mapping_id`, but semantically it now points to `PowerDataset.id`. This is a compatibility alias and should not continue to spread.

### Required Changes

Introduce `power_dataset_id` in new internal code and DTOs while preserving `physical_mapping_id` as an alias.

Recommended transition:

- Keep database column unchanged in this phase if a full DB migration is too risky.
- Add Pydantic schema support for both names.
- Normalize to one internal variable name: `power_dataset_id`.
- Continue returning `physical_mapping_id` in legacy API responses for frontend compatibility.
- Add `power_dataset_id` to responses as the preferred field.
- Update frontend labels and local variable names where low risk.
- Keep `/api/physical-mappings` as an alias for `/api/power-datasets`.

### Acceptance Criteria

- Existing frontend still works.
- Existing `scripts/check_phase1.py` still works.
- New response objects include `power_dataset_id`.
- No new code should describe Power Dataset as physical partition mapping.

## P0.4 Add Metric Provenance for Auto-Derived Area Values

### Problem

Physical partition area is currently recalculated from logical component residual/self area. This is useful for Phase-1, but later tool-extracted floorplan or post-PnR data must not be overwritten without provenance.

### Required Changes

Extend `Metric` with provenance fields:

```text
source_type: str = "manual"
derivation: str = "direct"
```

Suggested values:

```text
source_type:
- manual
- architecture_estimate
- excel_import
- web_ui
- synthesis
- floorplan
- post_pnr
- silicon_measurement

derivation:
- direct
- derived_from_parent
- derived_from_partition_share
- imported
- tool_extracted
```

Update auto-generated physical partition area metrics to use:

```text
source_type = "architecture_estimate"
derivation = "derived_from_partition_share"
```

Update logical component metrics saved from the web editor to use:

```text
source_type = "web_ui"
derivation = "direct"
```

Update Excel import metrics to use:

```text
source_type = "excel_import"
derivation = "imported"
```

### Critical Rule

Do not overwrite `tool_extracted`, `floorplan`, `post_pnr`, or `silicon_measurement` metrics with auto-derived values unless an explicit overwrite flag is added later.

For Phase-2, if this rule is hard to enforce everywhere, add a quality issue and status warning first instead of silently overwriting high-quality data.

### Acceptance Criteria

- Existing DBs receive default provenance values.
- New metric writes include provenance.
- Auto-derived partition area is identifiable.
- Phase-1 checks still pass.

## P0.5 Refactor Backend Route/Service Boundaries Without Behavior Change

### Problem

`backend/main.py` contains route definitions, area rollup, quality checks, component updates, and implementation detail logic. This makes future agent edits risky.

### Goal

Reduce `main.py` size and isolate business logic.

### Suggested Structure

```text
backend/routes/databases.py
backend/routes/components.py
backend/routes/impl_options.py
backend/routes/tiers.py
backend/routes/metrics.py
backend/routes/quality.py
backend/routes/dashboard.py

backend/services/component_tree.py
backend/services/partition_mapping.py
backend/services/area_rollup.py
backend/services/quality_rules.py
backend/services/metric_service.py
backend/services/team_scope.py
```

Do not attempt a full architectural rewrite. Move code in small steps and preserve API behavior.

### Acceptance Criteria

- API endpoints remain the same.
- Imports do not create circular dependencies.
- `scripts/check_phase1.py` passes.
- Frontend build passes.

## 6. Data Model Invariants to Preserve

The following invariants must remain true:

### Logical hierarchy

- One logical component row can represent repeated instances through `logical_instance_count`.
- Do not reintroduce `parent_residual` logical component rows.
- Parent residual/self area is computed as parent total minus direct child total.

### Physical partitions

- Partition rows map the selected component's own self/residual content, not the full recursive subtree.
- `resource_category` must remain one of:

```text
logic
sram
block
```

- `full` means `content_share = 1`.
- `partial` uses `content_share` to describe content fraction.
- Existing `partition_ratio` remains a compatibility alias.

### Application power

- Application power must remain separate from ordinary block metrics.
- Module use case library remains represented by `application_scenario_id = AS_MODULE_LIBRARY` unless a full migration is explicitly approved.
- Parent and child active selections must not both be included in a scenario total.
- Child power greater than active parent inclusive power must be rejected.

## 7. Suggested Implementation Order

Use this order to minimize risk:

```text
1. Create/update docs/CODEX_AGENT_STATUS.md.
2. Add schema_version and migration_history tables.
3. Move existing compatibility logic behind an idempotent migration runner.
4. Add metric uniqueness detection and quality checks.
5. Add metric provenance fields and defaults.
6. Add power_dataset_id aliases while keeping physical_mapping_id compatibility.
7. Refactor backend services in small steps.
8. Run validation commands.
9. Open draft PR.
```

Avoid doing the route/service refactor before the schema and behavior tests are stable.

## 8. Reviewer Checklist

The PR is not ready for merge until all items are checked:

- [ ] Existing demo database starts successfully.
- [ ] New empty database can be created from UI/API.
- [ ] Demo seed still produces expected Phase-1 counts.
- [ ] `uv run pytest` passes.
- [ ] `uv run python scripts/verify_import.py` passes.
- [ ] `uv run python scripts/check_phase1.py` passes.
- [ ] `cd frontend && npm run build` passes.
- [ ] No destructive DB field rename without compatibility alias.
- [ ] No silent overwrite of high-confidence/tool-extracted metrics.
- [ ] Power Dataset is no longer described as physical partition mapping in new code.
- [ ] `docs/CODEX_AGENT_STATUS.md` contains final validation notes.

## 9. Starting Prompt for Codex

Use this exact prompt when starting Codex:

```text
You are working on https://github.com/smhe00/soc_data.

Read docs/CODEX_PHASE2_HARDENING_PLAN.md first.
Then create or update docs/CODEX_AGENT_STATUS.md with your current plan.
Work on a new branch named codex/phase2-hardening.
Do not commit directly to master.
Preserve all existing APIs unless the plan explicitly says to add a compatibility alias.
Run the required validation commands before opening a draft PR.
If any requirement is ambiguous, record the question in docs/CODEX_AGENT_STATUS.md and make the safest backward-compatible implementation choice.
```

## 10. Escalation Rules

Codex should stop and ask for review if any of the following is required:

- deleting user-created data;
- renaming existing database columns without compatibility;
- changing the meaning of `logical_instance_count`;
- changing physical partition closure semantics;
- changing application power summation semantics;
- adding authentication or permission enforcement beyond current team-scoped filtering;
- large UI redesign;
- replacing SQLite with PostgreSQL.

If blocked, Codex should push the branch with the current status file and open a draft PR marked as blocked.
