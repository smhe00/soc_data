from __future__ import annotations

from pathlib import Path
import sys

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.main import app

TEMPLATE = ROOT / "templates" / "soc_import_template.xlsx"


def main() -> None:
    with TestClient(app) as client:
        with TEMPLATE.open("rb") as workbook:
            response = client.post(
                "/api/import/excel",
                files={"file": (TEMPLATE.name, workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            )
        response.raise_for_status()
        print(response.json())


if __name__ == "__main__":
    main()
