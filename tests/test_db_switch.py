from __future__ import annotations

from pathlib import Path

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
