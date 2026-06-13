from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlmodel import SQLModel, create_engine

from . import config
from . import models as models  # Registers SQLModel metadata.


BASE_DIR = config.BASE_DIR
DATABASE_DIR = config.DATABASE_DIR
DEFAULT_DATABASE_PATH = config.DEFAULT_DATABASE_PATH
ACTIVE_DATABASE_PATH = config.ACTIVE_DATABASE_PATH
TEMPLATE_PATH = config.TEMPLATE_PATH

engine = create_engine(f"sqlite:///{ACTIVE_DATABASE_PATH}", connect_args={"check_same_thread": False})


def get_engine():
    return engine


def now_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def database_id(path: Path) -> str:
    return path.stem


def database_label(path: Path) -> str:
    return "Demo database" if path.resolve() == DEFAULT_DATABASE_PATH.resolve() else path.stem.replace("_", " ")


def database_paths() -> list[Path]:
    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    paths = [DEFAULT_DATABASE_PATH]
    paths.extend(sorted(DATABASE_DIR.glob("*.db")))
    unique: dict[str, Path] = {}
    for path in paths:
        unique[str(path.resolve())] = path.resolve()
    return list(unique.values())


def database_path_from_id(db_id: str) -> Path:
    cleaned = db_id.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Database id is required.")
    for path in database_paths():
        if database_id(path) == cleaned:
            return path
    raise HTTPException(status_code=404, detail=f"Database not found: {db_id}")


def switch_database(path: Path, create_if_missing: bool = False) -> None:
    global engine, ACTIVE_DATABASE_PATH
    resolved = path.resolve()
    if create_if_missing:
        resolved.parent.mkdir(parents=True, exist_ok=True)
        resolved.touch(exist_ok=True)
    if not resolved.exists():
        raise HTTPException(status_code=404, detail=f"Database file not found: {database_id(resolved)}")
    engine.dispose()
    ACTIVE_DATABASE_PATH = resolved
    config.ACTIVE_DATABASE_PATH = resolved
    engine = create_engine(f"sqlite:///{ACTIVE_DATABASE_PATH}", connect_args={"check_same_thread": False})


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def ensure_sqlite_schema_compatibility() -> None:
    with engine.begin() as connection:
        rows = connection.execute(text("PRAGMA table_info(logicalcomponent)")).fetchall()
        columns = {row[1] for row in rows}
        if "owner_team" not in columns:
            connection.execute(text("ALTER TABLE logicalcomponent ADD COLUMN owner_team VARCHAR DEFAULT 'Architecture Team'"))
        if "visibility_level" not in columns:
            connection.execute(text("ALTER TABLE logicalcomponent ADD COLUMN visibility_level VARCHAR DEFAULT 'team'"))
        partition_rows = connection.execute(text("PRAGMA table_info(physicalpartition)")).fetchall()
        partition_columns = {row[1] for row in partition_rows}
        if "content_share" not in partition_columns:
            connection.execute(text("ALTER TABLE physicalpartition ADD COLUMN content_share FLOAT DEFAULT 1"))
            connection.execute(
                text(
                    "UPDATE physicalpartition "
                    "SET content_share = CASE WHEN partition_type = 'full' THEN 1 ELSE partition_ratio END"
                )
            )
        if "resource_category" not in partition_columns:
            connection.execute(text("ALTER TABLE physicalpartition ADD COLUMN resource_category VARCHAR DEFAULT 'block'"))
        process_rows = connection.execute(text("PRAGMA table_info(processnode)")).fetchall()
        process_columns = {row[1] for row in process_rows}
        if "logic_area_scale" not in process_columns:
            connection.execute(text("ALTER TABLE processnode ADD COLUMN logic_area_scale FLOAT DEFAULT 1"))
        if "sram_area_scale" not in process_columns:
            connection.execute(text("ALTER TABLE processnode ADD COLUMN sram_area_scale FLOAT DEFAULT 1"))
        if "block_area_scale" not in process_columns:
            connection.execute(text("ALTER TABLE processnode ADD COLUMN block_area_scale FLOAT DEFAULT 1"))
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
        connection.execute(
            text(
                "DELETE FROM metric "
                "WHERE subject_type = 'logical_component' "
                "AND subject_id IN (SELECT id FROM logicalcomponent WHERE instance_type = 'parent_residual')"
            )
        )
        connection.execute(text("DELETE FROM logicalcomponent WHERE instance_type = 'parent_residual'"))
        connection.execute(
            text(
                "DELETE FROM metric "
                "WHERE metric_name = 'power' "
                "AND subject_type IN ('logical_component', 'physical_partition')"
            )
        )
