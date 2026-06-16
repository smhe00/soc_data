from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from sqlmodel import SQLModel, create_engine

from . import config
from . import migrations
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


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


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
        migrations.run_schema_migrations(connection, now_utc_iso())
        migrations.run_legacy_compatibility_guards(connection, now_utc_iso())
