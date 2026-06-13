from __future__ import annotations

import os
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

TEST_DB_PATH = ROOT / "backend" / "databases" / "_pytest.db"
TEST_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
TEST_DB_PATH.unlink(missing_ok=True)
os.environ["SOC_DB_PATH"] = str(TEST_DB_PATH)
os.environ["SEED_DEMO"] = "false"

import backend.main as backend_app  # noqa: E402


@pytest.fixture()
def client() -> TestClient:
    backend_app.engine.dispose()
    TEST_DB_PATH.unlink(missing_ok=True)
    backend_app.db.switch_database(TEST_DB_PATH, create_if_missing=True)
    backend_app.db.create_db_and_tables()
    backend_app.db.ensure_sqlite_schema_compatibility()
    backend_app.seed_data()
    with TestClient(backend_app.app) as test_client:
        yield test_client


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_db():
    yield
    backend_app.engine.dispose()
    TEST_DB_PATH.unlink(missing_ok=True)
