from __future__ import annotations

from sqlalchemy import text

import backend.main as backend_app


def test_schema_migration_status_is_queryable_and_idempotent(client) -> None:
    with backend_app.engine.begin() as connection:
        version = connection.execute(text("SELECT id, version FROM schema_version WHERE id = 'main'")).mappings().one()
        history = connection.execute(text("SELECT id, status FROM migration_history ORDER BY id")).mappings().all()

    assert version["version"] == "V7.006"
    assert [row["id"] for row in history] == [
        "V7.001_add_owner_team_and_visibility",
        "V7.002_add_partition_content_share_and_resource_category",
        "V7.003_add_process_area_scale",
        "V7.004_migrate_legacy_physical_mapping_to_power_dataset",
        "V7.005_remove_legacy_parent_residual_rows",
        "V7.006_remove_power_metrics_from_metric_table",
    ]
    assert {row["status"] for row in history} == {"applied"}

    backend_app.db.ensure_sqlite_schema_compatibility()

    with backend_app.engine.begin() as connection:
        history_count = connection.execute(text("SELECT COUNT(*) FROM migration_history")).scalar_one()

    assert history_count == 6
