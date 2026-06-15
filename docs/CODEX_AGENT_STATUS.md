# Codex Agent Status

> Persistent coordination file for `smhe00/soc_data` Phase-2 hardening.  
> Codex should update this file on branch `codex/phase2-hardening` before and after each meaningful batch of changes.

## Current State

| Field | Value |
|---|---|
| Branch | `codex/phase2-hardening` |
| Last updated | TBD |
| Current batch | Not started |
| PR | TBD |
| Blocking status | Not blocked |

## Working Assumptions

- Preserve existing API compatibility unless a compatibility alias is explicitly added.
- Do not commit implementation changes directly to `master`.
- Keep SQLite support as the primary Phase-2 target.
- Do not implement full authentication/RBAC in this phase.
- Do not silently overwrite high-confidence or tool-extracted metrics.

## Batch Log

| Batch | Scope | Files touched | Status | Validation |
|---|---|---|---|---|
| 0 | Read plan and prepare branch | `docs/CODEX_AGENT_STATUS.md` | Pending | Not run |

## Blocking Questions

| ID | Question | Impact | Proposed safe default | Status |
|---|---|---|---|---|
| Q1 | None yet | None | Continue with backward-compatible implementation | Open |

## Change Summary

### Completed

- Not started.

### In Progress

- Not started.

### Next

1. Read `docs/CODEX_PHASE2_HARDENING_PLAN.md`.
2. Create branch `codex/phase2-hardening`.
3. Start with schema version and migration history.

## Validation Log

| Command | Result | Notes |
|---|---|---|
| `uv run pytest` | Not run |  |
| `uv run python scripts/verify_import.py` | Not run |  |
| `uv run python scripts/check_phase1.py` | Not run |  |
| `cd frontend && npm run build` | Not run |  |

## Final Reviewer Checklist

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
- [ ] Final PR summary is complete.
