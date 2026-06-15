from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.engine import Connection


CURRENT_SCHEMA_VERSION = "V7.008"
SCHEMA_VERSION_ID = "main"
METRIC_IDENTITY_COLUMNS = ("impl_option_id", "subject_type", "subject_id", "metric_name", "corner", "workload")
METRIC_REQUIRED_IDENTITY_COLUMNS = ("impl_option_id", "subject_type", "subject_id", "metric_name")
LEGACY_REDUNDANT_METRIC_IDS = {
    "M_IMPL_OPTION_AREA",
    "M_PART_GPU_LOGIC_AREA_TOP",
    "M_PART_GPU_LOGIC_AREA_MID",
}


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


def _is_migration_applied(connection: Connection, migration: Migration) -> bool:
    row = connection.execute(
        text("SELECT 1 FROM migration_history WHERE id=:id AND status='applied'"),
        {"id": migration.id},
    ).first()
    return row is not None


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


def _normalize_metric_identity_fields(connection: Connection) -> None:
    connection.execute(text("UPDATE metric SET corner='typical' WHERE corner IS NULL OR TRIM(corner)=''"))
    connection.execute(text("UPDATE metric SET workload='nominal' WHERE workload IS NULL OR TRIM(workload)=''"))

    for column in METRIC_REQUIRED_IDENTITY_COLUMNS:
        rows = connection.execute(
            text(f"SELECT id FROM metric WHERE {column} IS NULL OR TRIM({column})='' ORDER BY id")
        ).scalars().all()
        if rows:
            ids = ", ".join(rows)
            raise RuntimeError(f"Metric identity column {column} cannot be null or empty; rows: {ids}")


def _add_metric_identity_unique_index(connection: Connection, _: str) -> None:
    if not _table_exists(connection, "metric"):
        return

    _normalize_metric_identity_fields(connection)

    duplicate_groups = connection.execute(
        text(
            "SELECT impl_option_id, subject_type, subject_id, metric_name, corner, workload, COUNT(*) AS duplicate_count "
            "FROM metric "
            "GROUP BY impl_option_id, subject_type, subject_id, metric_name, corner, workload "
            "HAVING COUNT(*) > 1"
        )
    ).mappings().all()
    for group in duplicate_groups:
        rows = connection.execute(
            text(
                "SELECT id, metric_value, metric_unit, metric_category, value_type, confidence, source_note "
                "FROM metric "
                "WHERE impl_option_id=:impl_option_id "
                "AND subject_type=:subject_type "
                "AND subject_id=:subject_id "
                "AND metric_name=:metric_name "
                "AND corner=:corner "
                "AND workload=:workload "
                "ORDER BY id"
            ),
            {column: group[column] for column in METRIC_IDENTITY_COLUMNS},
        ).mappings().all()
        legacy_ids = [row["id"] for row in rows if row["id"] in LEGACY_REDUNDANT_METRIC_IDS]
        if legacy_ids and len(legacy_ids) < len(rows):
            for metric_id in legacy_ids:
                connection.execute(text("DELETE FROM metric WHERE id=:metric_id"), {"metric_id": metric_id})
            rows = [row for row in rows if row["id"] not in LEGACY_REDUNDANT_METRIC_IDS]
        if len(rows) <= 1:
            continue

        distinct_values = {
            (
                row["metric_value"],
                row["metric_unit"],
                row["metric_category"],
                row["value_type"],
                row["confidence"],
                row["source_note"],
            )
            for row in rows
        }
        if len(distinct_values) > 1:
            identity = ", ".join(f"{column}={group[column]}" for column in METRIC_IDENTITY_COLUMNS)
            ids = ", ".join(row["id"] for row in rows)
            raise RuntimeError(f"Conflicting duplicate metric identity blocks migration: {identity}; rows: {ids}")

        redundant_ids = [row["id"] for row in rows[1:]]
        for metric_id in redundant_ids:
            connection.execute(text("DELETE FROM metric WHERE id=:metric_id"), {"metric_id": metric_id})

    connection.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_metric_identity "
            "ON metric (impl_option_id, subject_type, subject_id, metric_name, corner, workload)"
        )
    )


def _add_metric_provenance_fields(connection: Connection, _: str) -> None:
    if not _table_exists(connection, "metric"):
        return

    columns = _columns(connection, "metric")
    if "source_type" not in columns:
        connection.execute(text("ALTER TABLE metric ADD COLUMN source_type VARCHAR DEFAULT 'architecture_estimate'"))
    if "derivation" not in columns:
        connection.execute(text("ALTER TABLE metric ADD COLUMN derivation VARCHAR DEFAULT 'manual'"))

    connection.execute(text("UPDATE metric SET source_type='architecture_estimate' WHERE source_type IS NULL OR TRIM(source_type)=''"))
    connection.execute(text("UPDATE metric SET derivation='manual' WHERE derivation IS NULL OR TRIM(derivation)=''"))
    connection.execute(
        text(
            "UPDATE metric "
            "SET source_type='architecture_estimate', derivation='derived_from_logical_area' "
            "WHERE subject_type='physical_partition' "
            "AND metric_name IN ('logic_area', 'sram_area', 'block_area', 'shape_type') "
            "AND (id LIKE 'M_PART_%' OR source_note LIKE 'Recalculated%') "
            "AND (source_type IS NULL OR source_type='' OR source_type='architecture_estimate')"
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
    Migration(
        version="V7.007",
        name="add_metric_identity_unique_index",
        checksum="metric.identity.unique_index",
        note="Deduplicates identical metric facts and enforces metric identity uniqueness.",
        apply=_add_metric_identity_unique_index,
    ),
    Migration(
        version="V7.008",
        name="add_metric_provenance_fields",
        checksum="metric.source_type.derivation",
        note="Adds metric provenance fields and marks auto-derived physical partition area metrics.",
        apply=_add_metric_provenance_fields,
    ),
]


def run_schema_migrations(connection: Connection, applied_at: str) -> None:
    _ensure_tracking_tables(connection)
    for migration in MIGRATIONS:
        if _is_migration_applied(connection, migration):
            continue
        migration.apply(connection, applied_at)
        _record_migration(connection, migration, applied_at)
    _set_schema_version(connection, CURRENT_SCHEMA_VERSION, applied_at)


def run_legacy_compatibility_guards(connection: Connection, applied_at: str) -> None:
    """Keep old SQLite databases safe when legacy rows are reintroduced.

    Schema migrations above are recorded once. These guards intentionally run at
    startup because old workbooks or hand-edited databases can reintroduce
    legacy parent_residual rows, power metrics, or physicalmapping-only power
    datasets after the migration history has already been recorded.
    """

    _migrate_legacy_physical_mapping_to_power_dataset(connection, applied_at)
    _remove_legacy_parent_residual_rows(connection, applied_at)
    _remove_power_metrics_from_metric_table(connection, applied_at)
