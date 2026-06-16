from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlmodel import create_engine
import pytest

import backend.main as backend_app
from backend import migrations


def _create_metric_table(connection) -> None:
    connection.execute(
        text(
            "CREATE TABLE metric ("
            "id VARCHAR PRIMARY KEY, impl_option_id VARCHAR, subject_type VARCHAR, subject_id VARCHAR, "
            "metric_name VARCHAR, metric_value VARCHAR, metric_unit VARCHAR, metric_category VARCHAR, "
            "value_type VARCHAR, corner VARCHAR, workload VARCHAR, confidence VARCHAR, source_note VARCHAR, created_at VARCHAR"
            ")"
        )
    )


def _mark_migrations_applied_before_metric_identity(connection) -> None:
    migrations._ensure_tracking_tables(connection)
    for migration in migrations.MIGRATIONS:
        if migration.version >= "V7.007":
            continue
        connection.execute(
            text(
                "INSERT INTO migration_history "
                "(id, version, name, applied_at, checksum, status, note) "
                "VALUES (:id, :version, :name, :applied_at, :checksum, 'applied', :note)"
            ),
            {
                "id": migration.id,
                "version": migration.version,
                "name": migration.name,
                "applied_at": "2026-06-15T11:00:00Z",
                "checksum": migration.checksum,
                "note": migration.note,
            },
        )


def test_schema_migration_status_is_queryable_and_idempotent(client) -> None:
    with backend_app.engine.begin() as connection:
        version = connection.execute(text("SELECT id, version, updated_at FROM schema_version WHERE id = 'main'")).mappings().one()
        history = connection.execute(text("SELECT id, status, applied_at FROM migration_history ORDER BY id")).mappings().all()

    assert version["version"] == "V7.008"
    assert "T" in version["updated_at"]
    assert version["updated_at"].endswith("Z")
    assert [row["id"] for row in history] == [
        "V7.001_add_owner_team_and_visibility",
        "V7.002_add_partition_content_share_and_resource_category",
        "V7.003_add_process_area_scale",
        "V7.004_migrate_legacy_physical_mapping_to_power_dataset",
        "V7.005_remove_legacy_parent_residual_rows",
        "V7.006_remove_power_metrics_from_metric_table",
        "V7.007_add_metric_identity_unique_index",
        "V7.008_add_metric_provenance_fields",
    ]
    assert {row["status"] for row in history} == {"applied"}
    assert all("T" in row["applied_at"] and row["applied_at"].endswith("Z") for row in history)

    backend_app.db.ensure_sqlite_schema_compatibility()

    with backend_app.engine.begin() as connection:
        history_count = connection.execute(text("SELECT COUNT(*) FROM migration_history")).scalar_one()

    assert history_count == 8


def test_legacy_partial_schema_migration_and_guards_are_idempotent(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy_partial.db'}", connect_args={"check_same_thread": False})
    applied_at = "2026-06-15T12:00:00Z"

    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE logicalcomponent ("
                "id VARCHAR PRIMARY KEY, project_id VARCHAR, parent_id VARCHAR, module_definition_id VARCHAR, "
                "name VARCHAR, instance_type VARCHAR, resource_type VARCHAR, function_domain VARCHAR, "
                "hierarchy_path VARCHAR, logical_instance_count INTEGER, description VARCHAR, "
                "created_at VARCHAR, updated_at VARCHAR"
                ")"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE physicalpartition ("
                "id VARCHAR PRIMARY KEY, impl_option_id VARCHAR, logical_component_id VARCHAR, tier_id VARCHAR, "
                "partition_name VARCHAR, partition_type VARCHAR, physical_instance_count INTEGER, "
                "partition_ratio FLOAT, description VARCHAR"
                ")"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE processnode ("
                "id VARCHAR PRIMARY KEY, foundry VARCHAR, node_name VARCHAR, "
                "logic_density_mtr_per_mm2 FLOAT, sram_density_mb_per_mm2 FLOAT, "
                "voltage_nominal FLOAT, cost_factor FLOAT, maturity_level VARCHAR, description VARCHAR"
                ")"
            )
        )
        _create_metric_table(connection)
        connection.execute(
            text(
                "CREATE TABLE imploption ("
                "id VARCHAR PRIMARY KEY, project_id VARCHAR, name VARCHAR, impl_type VARCHAR, process_combo VARCHAR, "
                "description VARCHAR, status VARCHAR, created_at VARCHAR, updated_at VARCHAR"
                ")"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE physicalmapping ("
                "id VARCHAR PRIMARY KEY, impl_option_id VARCHAR, name VARCHAR, mapping_version VARCHAR, "
                "description VARCHAR, mapping_json VARCHAR"
                ")"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE powerdataset ("
                "id VARCHAR PRIMARY KEY, project_id VARCHAR, impl_option_id VARCHAR, name VARCHAR, "
                "dataset_type VARCHAR, development_stage VARCHAR, source_type VARCHAR, confidence VARCHAR, "
                "dataset_version VARCHAR, related_physical_mapping_id VARCHAR, description VARCHAR, "
                "context_json VARCHAR, created_at VARCHAR, updated_at VARCHAR"
                ")"
            )
        )
        connection.execute(
            text(
                "INSERT INTO logicalcomponent "
                "(id, project_id, parent_id, module_definition_id, name, instance_type, resource_type, function_domain, hierarchy_path, logical_instance_count, description, created_at, updated_at) "
                "VALUES "
                "('B_PARENT', 'P001', NULL, NULL, 'PARENT', 'subsystem', 'logic', 'General', 'PARENT', 1, '', '2026-01-01', '2026-01-01'), "
                "('B_RES', 'P001', 'B_PARENT', NULL, 'PARENT_RESIDUAL', 'parent_residual', 'logic', 'General', 'PARENT/PARENT_RESIDUAL', 1, '', '2026-01-01', '2026-01-01')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO physicalpartition "
                "(id, impl_option_id, logical_component_id, tier_id, partition_name, partition_type, physical_instance_count, partition_ratio, description) "
                "VALUES ('PP_RES', 'S2', 'B_RES', 'T0', 'RES', 'residual', 1, 0.25, '')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO metric "
                "(id, impl_option_id, subject_type, subject_id, metric_name, metric_value, metric_unit, metric_category, value_type, corner, workload, confidence, source_note, created_at) "
                "VALUES "
                "('M_RES', 'S2', 'logical_component', 'B_RES', 'logic_area', '1.0', 'mm2', 'logical_area', 'number', 'typical', 'nominal', 'draft', '', '2026-01-01'), "
                "('M_POWER', 'S2', 'logical_component', 'B_PARENT', 'power', '1.0', 'W', 'power', 'number', 'typical', 'nominal', 'draft', '', '2026-01-01')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO imploption "
                "(id, project_id, name, impl_type, process_combo, description, status, created_at, updated_at) "
                "VALUES ('S2', 'P001', 'Option', '3DIC', 'N3E/N5', '', 'High', '2026-01-01', '2026-01-01')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO physicalmapping (id, impl_option_id, name, mapping_version, description, mapping_json) "
                "VALUES ('PM_LEGACY', 'S2', 'Legacy Mapping', 'V02', 'legacy', '{}')"
            )
        )

        migrations.run_schema_migrations(connection, applied_at)
        migrations.run_legacy_compatibility_guards(connection, applied_at)
        migrations.run_schema_migrations(connection, applied_at)
        migrations.run_legacy_compatibility_guards(connection, applied_at)

        logical_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(logicalcomponent)")).fetchall()}
        partition_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(physicalpartition)")).fetchall()}
        process_columns = {row[1] for row in connection.execute(text("PRAGMA table_info(processnode)")).fetchall()}

        assert {"owner_team", "visibility_level"} <= logical_columns
        assert {"content_share", "resource_category"} <= partition_columns
        assert {"logic_area_scale", "sram_area_scale", "block_area_scale"} <= process_columns

        partition = connection.execute(
            text("SELECT logical_component_id, partition_type, content_share, resource_category FROM physicalpartition WHERE id='PP_RES'")
        ).mappings().one()
        assert dict(partition) == {
            "logical_component_id": "B_PARENT",
            "partition_type": "partial",
            "content_share": 0.25,
            "resource_category": "block",
        }
        assert connection.execute(text("SELECT COUNT(*) FROM logicalcomponent WHERE instance_type='parent_residual'")).scalar_one() == 0
        assert connection.execute(text("SELECT COUNT(*) FROM metric WHERE id IN ('M_RES', 'M_POWER')")).scalar_one() == 0
        assert connection.execute(text("SELECT COUNT(*) FROM powerdataset WHERE id='PM_LEGACY'")).scalar_one() == 1
        assert connection.execute(text("SELECT COUNT(*) FROM migration_history")).scalar_one() == 8

    engine.dispose()


def test_metric_identity_migration_dedupes_identical_rows(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'metric_dupes.db'}", connect_args={"check_same_thread": False})

    with engine.begin() as connection:
        _create_metric_table(connection)
        _mark_migrations_applied_before_metric_identity(connection)
        connection.execute(
            text(
                "INSERT INTO metric "
                "(id, impl_option_id, subject_type, subject_id, metric_name, metric_value, metric_unit, metric_category, value_type, corner, workload, confidence, source_note, created_at) "
                "VALUES "
                "('M_A', 'S2', 'logical_component', 'B_CPU', 'logic_area', '1.0', 'mm2', 'logical_area', 'number', 'typical', 'nominal', 'review', 'same', '2026-01-01'), "
                "('M_B', 'S2', 'logical_component', 'B_CPU', 'logic_area', '1.0', 'mm2', 'logical_area', 'number', 'typical', 'nominal', 'review', 'same', '2026-01-01')"
            )
        )
        migrations.run_schema_migrations(connection, "2026-06-15T12:00:00Z")

        rows = connection.execute(text("SELECT id FROM metric ORDER BY id")).scalars().all()
        indexes = connection.execute(text("PRAGMA index_list(metric)")).fetchall()

    engine.dispose()

    assert rows == ["M_A"]
    assert "ux_metric_identity" in {row[1] for row in indexes}


def test_metric_provenance_migration_defaults_and_marks_auto_derived_partition_metrics(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'metric_provenance.db'}", connect_args={"check_same_thread": False})

    with engine.begin() as connection:
        _create_metric_table(connection)
        _mark_migrations_applied_before_metric_identity(connection)
        connection.execute(
            text(
                "INSERT INTO metric "
                "(id, impl_option_id, subject_type, subject_id, metric_name, metric_value, metric_unit, metric_category, value_type, corner, workload, confidence, source_note, created_at) "
                "VALUES "
                "('M_PART_A_LOGIC_AREA', 'S2', 'physical_partition', 'PP_A', 'logic_area', '1.0', 'mm2', 'implementation_area', 'number', 'typical', 'nominal', 'review', 'Physical partition estimate', '2026-01-01'), "
                "('M_LOG_A_LOGIC_AREA', 'S2', 'logical_component', 'B_A', 'logic_area', '2.0', 'mm2', 'logical_area', 'number', 'typical', 'nominal', 'review', 'Logical estimate', '2026-01-01')"
            )
        )
        migrations.run_schema_migrations(connection, "2026-06-15T12:00:00Z")

        rows = {
            row["id"]: dict(row)
            for row in connection.execute(text("SELECT id, source_type, derivation FROM metric ORDER BY id")).mappings().all()
        }

    engine.dispose()

    assert rows["M_PART_A_LOGIC_AREA"] == {
        "id": "M_PART_A_LOGIC_AREA",
        "source_type": "architecture_estimate",
        "derivation": "derived_from_logical_area",
    }
    assert rows["M_LOG_A_LOGIC_AREA"] == {
        "id": "M_LOG_A_LOGIC_AREA",
        "source_type": "architecture_estimate",
        "derivation": "manual",
    }


def test_metric_identity_migration_removes_known_legacy_redundant_rows(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'metric_legacy.db'}", connect_args={"check_same_thread": False})

    with engine.begin() as connection:
        _create_metric_table(connection)
        _mark_migrations_applied_before_metric_identity(connection)
        connection.execute(
            text(
                "INSERT INTO metric "
                "(id, impl_option_id, subject_type, subject_id, metric_name, metric_value, metric_unit, metric_category, value_type, corner, workload, confidence, source_note, created_at) "
                "VALUES "
                "('M_IMPL_OPTION_AREA', 'S2', 'impl_option', 'S2', 'area', '74.6', 'mm2', 'physical', 'number', 'typical', 'nominal', 'draft', 'legacy summary', '2026-01-01'), "
                "('M_IMPL_OPTION_S2_AREA', 'S2', 'impl_option', 'S2', 'area', '119.0', 'mm2', 'physical', 'number', 'typical', 'nominal', 'review', 'canonical summary', '2026-01-01')"
            )
        )
        migrations.run_schema_migrations(connection, "2026-06-15T12:00:00Z")

        rows = connection.execute(text("SELECT id FROM metric ORDER BY id")).scalars().all()

    engine.dispose()

    assert rows == ["M_IMPL_OPTION_S2_AREA"]


def test_metric_identity_migration_normalizes_null_corner_workload_before_dedupe(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'metric_null_identity.db'}", connect_args={"check_same_thread": False})

    with engine.begin() as connection:
        _create_metric_table(connection)
        _mark_migrations_applied_before_metric_identity(connection)
        connection.execute(
            text(
                "INSERT INTO metric "
                "(id, impl_option_id, subject_type, subject_id, metric_name, metric_value, metric_unit, metric_category, value_type, corner, workload, confidence, source_note, created_at) "
                "VALUES "
                "('M_A', 'S2', 'logical_component', 'B_CPU', 'logic_area', '1.0', 'mm2', 'logical_area', 'number', NULL, '', 'review', 'same', '2026-01-01'), "
                "('M_B', 'S2', 'logical_component', 'B_CPU', 'logic_area', '1.0', 'mm2', 'logical_area', 'number', 'typical', 'nominal', 'review', 'same', '2026-01-01')"
            )
        )
        migrations.run_schema_migrations(connection, "2026-06-15T12:00:00Z")

        rows = connection.execute(text("SELECT id, corner, workload FROM metric ORDER BY id")).mappings().all()
        empty_identity_values = connection.execute(
            text("SELECT COUNT(*) FROM metric WHERE corner IS NULL OR TRIM(corner)='' OR workload IS NULL OR TRIM(workload)=''")
        ).scalar_one()

    engine.dispose()

    assert [dict(row) for row in rows] == [{"id": "M_A", "corner": "typical", "workload": "nominal"}]
    assert empty_identity_values == 0


def test_metric_identity_migration_blocks_missing_required_identity_field(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'metric_missing_required_identity.db'}", connect_args={"check_same_thread": False})

    with engine.begin() as connection:
        _create_metric_table(connection)
        _mark_migrations_applied_before_metric_identity(connection)
        connection.execute(
            text(
                "INSERT INTO metric "
                "(id, impl_option_id, subject_type, subject_id, metric_name, metric_value, metric_unit, metric_category, value_type, corner, workload, confidence, source_note, created_at) "
                "VALUES "
                "('M_A', NULL, 'logical_component', 'B_CPU', 'logic_area', '1.0', 'mm2', 'logical_area', 'number', 'typical', 'nominal', 'review', 'missing impl', '2026-01-01')"
            )
        )
        with pytest.raises(RuntimeError, match="impl_option_id cannot be null or empty"):
            migrations.run_schema_migrations(connection, "2026-06-15T12:00:00Z")

    engine.dispose()


def test_metric_identity_unique_index_blocks_second_normalized_identity(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'metric_unique_index.db'}", connect_args={"check_same_thread": False})

    with engine.begin() as connection:
        _create_metric_table(connection)
        _mark_migrations_applied_before_metric_identity(connection)
        connection.execute(
            text(
                "INSERT INTO metric "
                "(id, impl_option_id, subject_type, subject_id, metric_name, metric_value, metric_unit, metric_category, value_type, corner, workload, confidence, source_note, created_at) "
                "VALUES "
                "('M_A', 'S2', 'logical_component', 'B_CPU', 'logic_area', '1.0', 'mm2', 'logical_area', 'number', NULL, '', 'review', 'same', '2026-01-01')"
            )
        )
        migrations.run_schema_migrations(connection, "2026-06-15T12:00:00Z")

        with pytest.raises(IntegrityError):
            connection.execute(
                text(
                    "INSERT INTO metric "
                    "(id, impl_option_id, subject_type, subject_id, metric_name, metric_value, metric_unit, metric_category, value_type, corner, workload, confidence, source_note, created_at) "
                    "VALUES "
                    "('M_B', 'S2', 'logical_component', 'B_CPU', 'logic_area', '2.0', 'mm2', 'logical_area', 'number', 'typical', 'nominal', 'review', 'duplicate', '2026-01-01')"
                )
            )

    engine.dispose()


def test_metric_identity_migration_blocks_conflicting_rows(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'metric_conflicts.db'}", connect_args={"check_same_thread": False})

    with engine.begin() as connection:
        _create_metric_table(connection)
        _mark_migrations_applied_before_metric_identity(connection)
        connection.execute(
            text(
                "INSERT INTO metric "
                "(id, impl_option_id, subject_type, subject_id, metric_name, metric_value, metric_unit, metric_category, value_type, corner, workload, confidence, source_note, created_at) "
                "VALUES "
                "('M_A', 'S2', 'logical_component', 'B_CPU', 'logic_area', '1.0', 'mm2', 'logical_area', 'number', 'typical', 'nominal', 'review', 'first', '2026-01-01'), "
                "('M_B', 'S2', 'logical_component', 'B_CPU', 'logic_area', '2.0', 'mm2', 'logical_area', 'number', 'typical', 'nominal', 'review', 'second', '2026-01-01')"
            )
        )
        with pytest.raises(RuntimeError, match="Conflicting duplicate metric identity"):
            migrations.run_schema_migrations(connection, "2026-06-15T12:00:00Z")

    engine.dispose()
