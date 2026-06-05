# SoC Cross-Die Database

Phase-1 SQLite MVP for the SoC cross-die architecture database and 3DIC evaluation prototype.

## Backend with uv

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database
uv sync
uv run uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

The backend creates `backend/soc_3dic.db` and inserts demo seed data on startup.

## Excel Import

Demo import workbook:

```text
templates\soc_import_demo.xlsx
```

The workbook contains these import sheets:

- `projects`
- `scenarios`
- `process_nodes`
- `components`
- `tiers`
- `component_metrics`
- `metric_dictionary`

`component_metrics` stays in database-friendly long-table form, but the template is optimized for manual editing:

- Fill `scenario_id`, `instance_id`, `metric_name`, `metric_value`, `corner`, `confidence`, and `created_at`.
- `id`, `metric_unit`, `metric_category`, and `workload` are formula-assisted in Excel.
- The backend also fills formula-assisted fields when Excel formula cache values are missing.
- Add new metric names to `metric_dictionary` before using them in `component_metrics`.

Download it from the running backend:

```text
http://localhost:8000/api/import/template
```

Or import it through the API:

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database
uv run python scripts\verify_import.py
```

## Frontend

```powershell
cd C:\Users\smhe00\Documents\soc-cross-die-database\frontend
npm install
npm run dev
```

Open `http://localhost:5173/`.
