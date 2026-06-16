from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

import backend.main as backend_app


def test_main_engine_tracks_database_switch(tmp_path: Path) -> None:
    original_path = backend_app.db.ACTIVE_DATABASE_PATH
    temp_db = tmp_path / "switch_test.db"

    try:
        backend_app.db.switch_database(temp_db, create_if_missing=True)
        backend_app.db.create_db_and_tables()

        assert backend_app.engine is backend_app.db.engine
        assert backend_app.ACTIVE_DATABASE_PATH == temp_db.resolve()
        assert backend_app.db.config.ACTIVE_DATABASE_PATH == temp_db.resolve()
    finally:
        backend_app.db.switch_database(original_path, create_if_missing=True)
        temp_db.unlink(missing_ok=True)

    assert backend_app.engine is backend_app.db.engine
    assert backend_app.ACTIVE_DATABASE_PATH == original_path


def test_create_empty_database_via_api(client: TestClient) -> None:
    original_path = backend_app.db.ACTIVE_DATABASE_PATH
    database_name = "pytest empty readiness"
    expected_path = (backend_app.db.DATABASE_DIR / "pytest_empty_readiness.db").resolve()
    expected_path.unlink(missing_ok=True)

    try:
        response = client.post("/api/databases", json={"name": database_name, "seed_demo": False})
        response.raise_for_status()
        payload = response.json()

        assert payload["active_id"] == "pytest_empty_readiness"
        assert payload["database"]["active"] is True
        assert payload["database"]["project_count"] == 0
        assert backend_app.db.ACTIVE_DATABASE_PATH == expected_path

        projects = client.get("/api/projects")
        projects.raise_for_status()
        assert projects.json() == []
    finally:
        backend_app.db.switch_database(original_path, create_if_missing=True)
        expected_path.unlink(missing_ok=True)
