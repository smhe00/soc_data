from __future__ import annotations

import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATABASE_DIR = BASE_DIR / "databases"
DEFAULT_DATABASE_PATH = BASE_DIR / "demo_soc_3dic.db"
ACTIVE_DATABASE_PATH = Path(os.getenv("SOC_DB_PATH", DEFAULT_DATABASE_PATH)).expanduser().resolve()
TEMPLATE_PATH = BASE_DIR.parent / "templates" / "soc_import_template.xlsx"
