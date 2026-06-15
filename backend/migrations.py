from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.engine import Connection


CURRENT_SCHEMA_VERSION = "V7.006"
SCHEMA_VERSION_ID = "main"


@dataclass(frozen=True)
class Migration:
    version: str
    name: str
    checksum: str
    note: str
    apply: Callable[[Connection, str], None]

    @property
    def id(self) -> str:
        return f"{self.version}_{self.name}"


def _table_exists(connection: Connection, table_name: str) -> bool:
    row = connection.execute(
        text("SELECT 1 FROM sqlite_master WHERE type='table' AND name=:table_name"),
        {"table_name": table_name},
    ).first()
    return row is not None


def _columns(connection: Connection, table_name: str) -> set[str]:
    if not _table_exists(connection, table_name):
        return set()
    rows = connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    return {row[1] for row in rows}


def _ensure_tracking_tables(connection: Connection) -> None:
    connection.execute(
        text(
            "CREATE TABLE IF NOT EXISTS schema_version ("
            "id VARCHAR PRIMARY KEY, "
            "version VARCHAR NOT NULL, "
            "updated_at VARCHAR NOT NULL"
            ")"
        )
    )
    connection.execute(
        text(
            "CREATE TABLE IF NOT EXISTS migration_history ("
            "id VARCHAR PRIMARY KEY, "
            "version VARCHAR NOT NULL, "
            "name VARCHAR NOT NULL, "
            "applied_at VARCHAR NOT NULL, "
            "checksum VARCHAR DEFAULT '', "
            "status VARCHAR NOT NULL DEFAULT 'applied', "
            "note VARCHAR DEFAULT ''"
            ")"
        )
    )


def _record_migration(connection: Connection, migration: Migration, applied_at: str) -> None:
    connection.execute(
        text(
            "INSERT INTO migration_history (id, version, name, applied_at, checksum, status, note) "
            "VALUES (:id, :version, :name, :applied_at, :checksum, 'applied', :note) "
            "ON CONFLICT(id) DO UPDATE SET "
            "version=excluded.version, "
            "name=excluded.name, "
            "checksum=excluded.checksum, "
            "status='applied', "
            "note=excluded.note"
        ),
        {
            "id": migration.id,
            "version": migration.version,
            "name": migration.name,
            "applied_at": applied_at,
            "checksum": migration.checksum,
            "note": migration.note,
        },
    )


def _set_schema_version(connection: Connection, version: str, updated_at: str) -> None:
    connection.execute(
        text(
            "INSERT INTO schema_version (id, version, updated_at) "
            "VALUES (:id, :version, :updated_at) "
            "ON CONFLICT(id) DO UPDATE SET version=excluded.version, updated_at=excluded.updated_at"
        ),
        {"id": SCHEMA_VERSION_ID, "version": version, "updated_at": updated_at},
    )


def _add_owner_team_and_visibility(connection: Connection, _: str) -> None:
    columns = _columns(connection, "logicalcomponent")
    if "owner_team" not in columns:
        connection.execute(text("ALTER TABLE logicalcomponent ADD COLUMN owner_team VARCHAR DEFAULT 'Architecture Team'"))
    if "visibility_level" not in columns:
        connection.execute(text("ALTER TABLE logicalcomponent ADD COLUMN visibility_level VARCHAR DEFAULT 'team'"))


def _add_partition_content_share_and_resource_category(connection: Connection, _: str) -> None:
    columns = _columns(connection, "physicalpartition")
    if "content_share" not in columns:
        connection.execute(text("ALTER TABLE physicalpartition ADD COLUMN content_share FLOAT DEFAULT 1"))
        connection.execute(
            text(
                "UPDATE physicalpartition "
                "SET content_share = CASE WHEN partition_type = 'full' THEN 1 ELSE partition_ratio END"
            )
        )
    if "resource_category" not in columns:
        connection.execute(text("ALTER TABLE physicalpartition ADD COLUMN resource_category VARCHAR DEFAULT 'block'"))


def _add_process_area_scale(connection: Connection, _: str) -> None:
    columns = _columns(connection, "processnode")
    if "logic_area_scale" not in columns:
        connection.execute(text("ALTER TABLE processnode ADD COLUMN logic_area_scale FLOAT DEFAULT 1"))
    if "sram_area_scale" not in columns:
        connection.execute(text("ALTER TABLE processnode ADD COLUMN sram_area_scale FLOAT DEFAULT 1"))
    if "block_area_scale" not in columns:
        connection.execute(text("ALTER TABLE processnode ADD COLUMN block_area_scale FLOAT DEFAULT 1"))


def _migrate_legacy_physical_mapping_to_power_dataset(connection: Connection, applied_at: str) -> None:
    if not (_table_exists(connection, "powerdataset") and _table_exists(connection, "physicalmapping")):
        return
    connection.execute(
        text(
            "INSERT INTO powerdataset ("
            "id, project_id, impl_option_id, name, dataset_type, development_stage, source_type, "
            "confidence, dataset_version, related_physical_mapping_id, description, context_json, "
            "created_at, updated_at"
            ") "
            "SELECT pm.id, io.project_id, pm.impl_option_id, pm.name, "
            "'architecture_estimate', 'architecture_estimate', 'legacy_physical_mapping', "
            "'review', COALESCE(NULLIF(pm.mapping_version, ''), 'V01'), pm.id, "
            "COALESCE(pm.description, ''), COALESCE(pm.mapping_json, ''), :created_at, :updated_at "
            "FROM physicalmapping pm "
            "JOIN imploption io ON io.id = pm.impl_option_id "
            "WHERE NOT EXISTS (SELECT 1 FROM powerdataset pd WHERE pd.id = pm.id)"
        ),
        {"created_at": applied_at, "updated_at": applied_at},
    )


def _remove_legacy_parent_residual_rows(connection: Connection, _: str) -> None:
    if not (_table_exists(connection, "logicalcomponent") and _table_exists(connection, "physicalpartition")):
        return
    connection.execute(text("UPDATE physicalpartition SET partition_type = 'partial' WHERE partition_type = 'residual'"))
    connection.execute(
        text(
            "UPDATE physicalpartition "
            "SET logical_component_id = ("
            "SELECT parent_id FROM logicalcomponent WHERE logicalcomponent.id = physicalpartition.logical_component_id"
            ") "
            "WHERE logical_component_id IN ("
            "SELECT id FROM logicalcomponent WHERE instance_type = 'parent_residual' AND parent_id IS NOT NULL"
            ")"
        )
    )
    if _table_exists(connection, "metric"):
        connection.execute(
            text(
                "DELETE FROM metric "
                "WHERE subject_type = 'logical_component' "
                "AND subject_id IN (SELECT id FROM logicalcomponent WHERE instance_type = 'parent_residual')"
            )
        )
    connection.execute(text("DELETE FROM logicalcomponent WHERE instance_type = 'parent_residual'"))


def _remove_power_metrics_from_metric_table(connection: Connection, _: str) -> None:
    if not _table_exists(connection, "metric"):
        return
    connection.execute(
        text(
            "DELETE FROM metric "
            "WHERE metric_name = 'power' "
            "AND subject_type IN ('logical_component', 'physical_partition')"
        )
    )


MIGRATIONS = [
    Migration(
        version="V7.001",
        name="add_owner_team_and_visibility",
        checksum="logicalcomponent.owner_team.visibility_level",
        note="Adds lightweight team visibility fields to logical components.",
        apply=_add_owner_team_and_visibility,
    ),
    Migration(
        version="V7.002",
        name="add_partition_content_share_and_resource_category",
        checksum="physicalpartition.content_share.resource_category",
        note="Adds content_share and resource_category compatibility fields.",
        apply=_add_partition_content_share_and_resource_category,
    ),
    Migration(
        version="V7.003",
        name="add_process_area_scale",
        checksum="processnode.logic_area_scale.sram_area_scale.block_area_scale",
        note="Adds per-resource process area scale fields.",
        apply=_add_process_area_scale,
    ),
    Migration(
        version="V7.004",
        name="migrate_legacy_physical_mapping_to_power_dataset",
        checksum="physicalmapping.to.powerdataset.compat",
        note="Copies legacy physical mapping rows into power datasets for compatibility.",
        apply=_migrate_legacy_physical_mapping_to_power_dataset,
    ),
    Migration(
        version="V7.005",
        name="remove_legacy_parent_residual_rows",
        checksum="logicalcomponent.parent_residual.cleanup",
        note="Moves residual physical partitions back to parents and removes parent_residual logical rows.",
        apply=_remove_legacy_parent_residual_rows,
    ),
    Migration(
        version="V7.006",
        name="remove_power_metrics_from_metric_table",
        checksum="metric.power.cleanup",
        note="Keeps application power outside the generic metric table.",
        apply=_remove_power_metrics_from_metric_table,
    ),
]


def run_schema_migrations(connection: Connection, applied_at: str) -> None:
    _ensure_tracking_tables(connection)
    for migration in MIGRATIONS:
        migration.apply(connection, applied_at)
        _record_migration(connection, migration, applied_at)
    _set_schema_version(connection, CURRENT_SCHEMA_VERSION, applied_at)
