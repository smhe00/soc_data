# SoC Cross-Die Database

Phase-1 SQLite MVP for a SoC cross-die architecture database and 3DIC evaluation prototype.

The current demo is a realistic flagship mobile SoC dataset named `Orion X1 Mobile SoC`.

## Repository

Gitee:

```text
https://gitee.com/smhe/soc_database.git
```

## Project Root

Set `PROJECT_ROOT` to the repository root on your machine. All paths below are relative to this directory.

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

## Backend

macOS/Linux:

```sh
cd "$PROJECT_ROOT"
uv sync
uv run uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Windows PowerShell:

```powershell
cd $env:PROJECT_ROOT
uv sync
uv run uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

The backend creates `backend/soc_3dic.db` on startup.

Stop the backend from the same terminal with `Ctrl + C`.

If Windows leaves an orphaned `uvicorn --reload` child process on port 8000, run:

```powershell
cd $env:PROJECT_ROOT
powershell -ExecutionPolicy Bypass -File ./scripts/stop_backend.ps1
```

Demo seed is enabled by default. It refreshes the built-in `P001 / S1-S3` demo data.

Disable demo seed when you want to preserve manually imported data:

macOS/Linux:

```sh
cd "$PROJECT_ROOT"
SEED_DEMO=false uv run uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Windows PowerShell:

```powershell
cd $env:PROJECT_ROOT
$env:SEED_DEMO="false"
uv run uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

## Frontend

macOS/Linux:

```sh
cd "$PROJECT_ROOT/frontend"
npm install
npm run dev
```

Windows PowerShell:

```powershell
cd (Join-Path $env:PROJECT_ROOT "frontend")
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
```

## One-Command LAN / Server Deploy

The frontend automatically uses the same hostname as the page for API calls on port `8000`.
For example, opening `http://192.168.1.100:5173` makes the browser call
`http://192.168.1.100:8000`. No per-machine `.env` file is required unless you want to override this behavior.

Windows PowerShell:

```powershell
cd $env:PROJECT_ROOT
powershell -ExecutionPolicy Bypass -File .\scripts\deploy_windows.ps1
```

Use `-Pull` to update from Git first, or `-Preview` to serve the production build:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy_windows.ps1 -Pull -Preview
```

Linux server:

```sh
cd ~/apps/soc
bash scripts/deploy_linux.sh
```

Use `PULL=true` to update from Git first:

```sh
PULL=true bash scripts/deploy_linux.sh
```

For LAN or public access, make sure the host firewall/security group allows TCP `5173` and `8000`.

## SQLite Database Selection

The built-in demo database is:

```text
backend/soc_3dic.db
```

Additional user-created SQLite databases are stored under:

```text
backend/databases/
```

Use the database selector in the app header to switch databases, or click `New DB` to create an empty SQLite database.
New databases contain only the schema; import an Excel template or use the editing pages to add data.

API endpoints:

```text
GET  /api/databases
POST /api/databases
POST /api/databases/select
```

## V7 Data Model

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

The model separates:

- logical hierarchy and logical instance count
- implementation-option-specific physical partitioning and physical instance count
- long-table non-power metrics attached to logical components, physical partitions, tiers, or implementation options
- application power use case/Profile rows and application scenario composition
- base-process logical area metrics from tier/process scaled physical area roll-ups

Detailed schema notes:

```text
docs/schema_v7.md
```

## Demo Data

Seeded dataset:

- Project: `Orion X1 Mobile SoC`
- Implementation options:
  - `S1`: Monolithic N3E Baseline
  - `S2`: 3DIC Performance Option
  - `S3`: Cost-Optimized 2.5D Option
- Logical components: 43
- Residual/self area: parent-level self/glue area is computed from parent total metrics minus direct child metrics, not stored as extra logical component rows
- Physical partitions: 144
- Main domains: CPU, GPU, NPU, ISP, media, display, 5G modem, memory, NoC, IO/PHY, security, PMU

## Excel Import

Current V7 workbook:

```text
templates/soc_import_template.xlsx
```

Download from the running backend:

```text
http://localhost:8000/api/import/template
```

Download a subsystem-owner workbook for the selected team:

```text
http://localhost:8000/api/import/template?team=AI%20Team
```

Team workbooks keep shared sheets such as `projects`, `implOptions`, `tiers`, and `module_definitions` as context. Team uploads only upsert scoped `logical_components`, `physical_partitions`, and `metrics`; the backend rejects rows outside the team's assigned logical subtree.

Logical `logic_area` / `sram_area` / `block_area` metrics are stored in the base-process area convention. `process_node` keeps separate `logic_area_scale`, `sram_area_scale`, and `block_area_scale` factors so the backend can report tier area distribution after an implementation option maps partitions onto tiers with different process nodes.

Verify import:

```sh
cd "$PROJECT_ROOT"
uv run python scripts/verify_import.py
```

Run the phase-1 API/data smoke check:

```sh
uv run python scripts/check_phase1.py
```

## Quality Checks

Quality issues API:

```text
GET http://localhost:8000/api/quality/issues
```

Phase-1 rules check:

- equivalent instance closure: `sum(physical_instance_count * content_share) == logical_instance_count` (both relative to parent)
- full partitions force `content_share = 1`
- required logical metrics
- numeric metric values
- metric subject references

## Team Scoped Views

The phase-1 app includes lightweight subsystem-owner scoping. This is data filtering for review workflows, not a full login or permission system.

Examples:

```text
GET /api/responsibilities/teams
GET /api/components?team=AI%20Team
GET /api/components/tree?team=AI%20Team
GET /api/physical-partitions?team=AI%20Team
GET /api/metrics?team=AI%20Team
GET /api/quality/issues?team=AI%20Team
GET /api/import/template?team=AI%20Team
POST /api/import/excel?team=AI%20Team
PUT /api/components/{component_id}/detail
```

## Web Maintenance

The Hierarchy page now includes a small Component Detail maintenance surface for physical partition mapping.

Physical partition mapping is scenario-scoped. The header `Scenario` selector controls which scenario's tiers and physical partitions are loaded and edited. This prevents a logical block mapping for one implementation form, such as `S2` W2W 3DIC, from being mixed with another implementation form, such as `S1` monolithic.

Physical partition rows also carry a resource category:

- `logic`
- `sram`
- `block`

This lets one logical component map logic, SRAM, and hard/block content independently. Each category can use `full` or `partial` rows and closes its own equivalent instance coverage. Existing coarse mappings are treated as `block` category rows until they are refined.

Mapping rows are displayed in a fixed category order: Logic first, SRAM second, Block last. Partition ID/name are generated rather than manually entered. The generated base is `logicalName_resourceCategory_tier`; `full` rows use the base name directly, while `partial` rows add a per-category/tier suffix such as `_P1`, `_P2`, etc. Multiple partial rows on the same tier are allowed.

Direct map rows cover only the selected component's self/residual content. A zero-area self/residual category must not have direct map rows. Full mapping is recursive: a component is closed only after its own non-zero categories and all child subtrees are closed.

For the selected logical component, users can edit:

- `logical_instance_count`
- resource category
- partition `tier_id`
- partition type
- physical instance count
- content share for partial partitions
- description

The page computes instance share from physical count and logical instance count. Partition ID/name are generated by the backend from logical component name, resource category, tier, and partial index. Save calls `PUT /api/components/{component_id}/detail` with the selected `impl_option_id`, then refreshes component data and quality issues.

## Implementation Option Detail View

The frontend includes an Implementation Option page for defining the physical stack attached to an implementation option. One project can have multiple implementation options, and each option can describe one physical form, such as monolithic, 2.5D interposer, or wafer-to-wafer 3DIC.

Current supported implementation forms:

- `Monolithic`: single-layer/single-die implementation with no inter-layer interface
- `Wafer-to-Wafer`: stacked implementation with ordered top-to-bottom layers
- `2.5D Interposer`: cost-optimized multi-die/interposer-style placeholder

The page models die/layer order and inter-layer interfaces:

- layer/die name, process, role, and thickness
- die-to-die orientation options such as `Face-to-Face`, `Face-to-Back`, `Back-to-Face`, and `Back-to-Back`
- chained Face/Back constraints so a die side already used by the upper interface cannot be reused by the lower interface
- independent HB pitch and TSV pitch/keep-out fields
- independent upper-side TSV and lower-side TSV fields for `Back-to-Back`
- derived bottom die to bump escape: if the bottom die back side faces package bumps, the page adds a derived `Tn-BUMP` TSV row

The view also includes light and dark display themes. The theme toggle is stored in browser `localStorage`.

The cross-section preview renders Face/Back surface marks from the chained interface orientation. `F` marks the face side and `B` marks the back side, so the tier drawing follows `Face-to-Face`, `Face-to-Back`, `Back-to-Face`, and `Back-to-Back` selections.

Implementation definitions are persisted through:

```text
GET /api/impl-options/{impl_option_id}/detail
PUT /api/impl-options/{impl_option_id}/detail
```

If no saved implementation exists, the GET endpoint synthesizes initial tier definitions from the implementation option's `tier` rows. Saving writes versioned implementation rows. The backend blocks dangerous saves when physical partitions already depend on a tier: a used tier cannot be removed, renamed to another tier id, or reordered.

## Useful API Endpoints

```text
GET /api/databases
POST /api/databases
POST /api/databases/select
GET /api/projects
GET /api/impl-options
GET /api/impl-options/{impl_option_id}/detail
PUT /api/impl-options/{impl_option_id}/detail
GET /api/module-definitions
POST /api/components
PUT /api/components/{component_id}
DELETE /api/components/{component_id}
GET /api/components?impl_option_id=S2
GET /api/components/tree?impl_option_id=S2
GET /api/physical-partitions?impl_option_id=S2
GET /api/tiers?impl_option_id=S2
GET /api/metrics?impl_option_id=S2
GET /api/dashboard?impl_option_id=S2
GET /api/quality/issues?impl_option_id=S2
GET /api/responsibilities/teams?impl_option_id=S2
PUT /api/components/{component_id}/detail
GET /api/import/template?impl_option_id=S2
POST /api/import/excel?impl_option_id=S2

# Application power endpoints
GET /api/application-scenarios
POST /api/application-scenarios
PUT /api/application-scenarios/{scenario_id}
DELETE /api/application-scenarios/{scenario_id}
GET /api/physical-mappings?impl_option_id=S2
GET /api/operating-point-sets
GET /api/module-power-usecases?impl_option_id=S2&physical_mapping_id=PM_3DIC_A
POST /api/module-power-usecases
DELETE /api/module-power-usecases/{usecase_id}
GET /api/application-scenario-composition?impl_option_id=S2&physical_mapping_id=PM_3DIC_A&application_scenario_id=AS_CAMERA_4K60
PUT /api/application-scenario-composition
GET /api/application-power-summary?impl_option_id=S2&physical_mapping_id=PM_3DIC_A&application_scenario_id=AS_CAMERA_4K60
```
## Application Power

The Application Power tab provides scenario-based power modeling and analysis. 

### Data Modeling Principles
Power is decoupled from static component attributes and modeled as `PowerObservation` (conditional observations). Power values are determined by the combination of:
- **Implementation Option** (mapped to `impl_option`)
- **Power Dataset** (currently stored through the compatibility table/field `physical_mapping`)
- **Application Scenario** (mapped to `application_scenario`)
- **Operating Point Set / Profile** (mapped to `operating_point_set`)

In the Application Power UI, `Power Dataset` means one power data baseline or back-annotation set, such as early architecture estimate, RTL/PTPX simulation, post-PnR power, or silicon measurement. It is not the day-to-day physical partition mapping editor. The storage name remains `physical_mapping` in Phase 1 to avoid a schema/API churn.

### Additive vs Non-additive Power
Observations are marked with `is_additive`:
- `is_additive = true`: Independent components, shared resources, or traffic interactions that are additive.
- `is_additive = false`: Global reference points (e.g., SoC total, major rails) used for verification rather than summation.
- **Unsplit Power**: Calculated as `inclusive parent power - assigned child sum` to show power that is still represented only at the parent level.

### Development Maturity & Confidence
Each observation carries:
- `development_stage`: `architecture_estimate`, `rtl_power`, `post_pnr_power`, `silicon_measurement`
- `confidence`: `draft`, `review`, `approved`, `measured`

### Current Application Power Semantics

The current demo-stage Application Power page uses a simpler two-layer model:

- Module use case library: each logical module can define one or more `use_case_name` values. `Default` is only a default name; it must have a real Profile and power value before it can be used.
- Application scenario composition: an application scenario selects which module use case/Profile rows are included in the SoC scenario power.

A unique module power value is identified by:

```text
impl_option_id + physical_mapping_id + component_id + use_case_name + operating_point_set_id
```

Here `physical_mapping_id` should be read as the selected Power Dataset id. An application scenario total is the sum of the checked module use case/Profile rows. Tier, hard macro, power rail, and shared-resource breakdowns remain future extensions.
