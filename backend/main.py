from __future__ import annotations

import os
import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete
from sqlmodel import Session, SQLModel, create_engine, select

from backend import db
from backend.db import database_id, database_label, database_path_from_id, database_paths, now_iso, switch_database
from backend.models import (
    ApplicationScenarioSelection,
    ImplOption,
    ImplOptionDetail,
    ImplementationInterface,
    ImplementationPackageEscape,
    ImplementationTier,
    LogicalComponent,
    Metric,
    ModuleDefinition,
    PhysicalPartition,
    ProcessNode,
    Project,
    ResponsibilityAssignment,
    Tier,
    PowerObservation,
)
from backend.schemas import (
    ComponentDetailUpdate,
    DatabaseCreateInput,
    DatabaseSelectInput,
    ImplOptionDetailUpdate,
    LogicalComponentDeleteInput,
    LogicalComponentInput,
    PartitionInput,
)
from backend.imports import register_import_routes
from backend.power import register_power_routes, safe_power_id_part
from backend.seed import database_has_project_data, seed_data


def __getattr__(name: str) -> Any:
    if name == "engine":
        return db.engine
    if name in {"BASE_DIR", "DATABASE_DIR", "DEFAULT_DATABASE_PATH", "ACTIVE_DATABASE_PATH", "TEMPLATE_PATH"}:
        return getattr(db, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


app = FastAPI(title="SoC Cross-Die Database API", version="0.2.0")
cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
cors_origin_regex = os.getenv("CORS_ORIGIN_REGEX", r"https?://[^/]+:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


register_power_routes(app)
register_import_routes(app)


ALLOWED_PARTITION_TYPES = {"full", "partial"}
ALLOWED_PARTITION_RESOURCE_CATEGORIES = {"logic", "sram", "block"}
PROTECTED_AUTO_DERIVED_METRIC_SOURCES = {"tool_extracted", "ptpx", "simulation", "silicon_measurement"}
AUTO_DERIVED_PARTITION_METRIC_SOURCE = "architecture_estimate"
AUTO_DERIVED_PARTITION_METRIC_DERIVATION = "derived_from_logical_area"


def number_or_zero(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def metric_id(row: dict[str, Any]) -> str:
    return (
        f"{row['impl_option_id']}-{row['subject_type']}-{row['subject_id']}-"
        f"{row['metric_name']}-{row['corner']}-{row['workload']}"
    )


@app.on_event("startup")
def on_startup() -> None:
    db.DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    db.create_db_and_tables()
    db.ensure_sqlite_schema_compatibility()
    if db.ACTIVE_DATABASE_PATH == db.DEFAULT_DATABASE_PATH.resolve() and os.getenv("SEED_DEMO", "true").lower() in {"1", "true", "yes", "on"}:
        force_seed = os.getenv("FORCE_SEED_DEMO", "false").lower() in {"1", "true", "yes", "on"}
        if force_seed or not database_has_project_data():
            seed_data()


def database_info(path: Path) -> dict[str, Any]:
    resolved = path.resolve()
    is_active = resolved == db.ACTIVE_DATABASE_PATH
    project_count = None
    if resolved.exists():
        try:
            temp_engine = create_engine(f"sqlite:///{resolved}", connect_args={"check_same_thread": False})
            with Session(temp_engine) as session:
                SQLModel.metadata.create_all(temp_engine)
                project_count = len(session.exec(select(Project)).all())
            temp_engine.dispose()
        except Exception:
            project_count = None
    return {
        "id": database_id(resolved),
        "name": database_label(resolved),
        "path": str(resolved),
        "active": is_active,
        "is_demo": resolved == db.DEFAULT_DATABASE_PATH.resolve(),
        "project_count": project_count,
    }


@app.get("/api/databases")
def get_databases() -> dict[str, Any]:
    return {
        "active_id": database_id(db.ACTIVE_DATABASE_PATH),
        "databases": [database_info(path) for path in database_paths()],
    }


@app.post("/api/databases")
def create_database(payload: DatabaseCreateInput) -> dict[str, Any]:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Database name is required.")
    safe_name = "".join(ch.lower() if ch.isalnum() else "_" for ch in name).strip("_")
    while "__" in safe_name:
        safe_name = safe_name.replace("__", "_")
    if not safe_name:
        raise HTTPException(status_code=400, detail="Database name must include letters or numbers.")
    path = (db.DATABASE_DIR / f"{safe_name}.db").resolve()
    if path.exists():
        raise HTTPException(status_code=409, detail=f"Database already exists: {safe_name}")

    previous_path = db.ACTIVE_DATABASE_PATH
    switch_database(path, create_if_missing=True)
    db.create_db_and_tables()
    db.ensure_sqlite_schema_compatibility()
    if payload.seed_demo:
        seed_data()
    info = database_info(db.ACTIVE_DATABASE_PATH)
    if not payload.seed_demo:
        # Keep the new empty database active so the UI can immediately import into it.
        pass
    if previous_path != db.ACTIVE_DATABASE_PATH:
        # The newly created database intentionally remains selected.
        pass
    return {"active_id": database_id(db.ACTIVE_DATABASE_PATH), "database": info, "databases": [database_info(db_path) for db_path in database_paths()]}


@app.post("/api/databases/select")
def select_database(payload: DatabaseSelectInput) -> dict[str, Any]:
    path = database_path_from_id(payload.id)
    switch_database(path)
    db.create_db_and_tables()
    db.ensure_sqlite_schema_compatibility()
    return {"active_id": database_id(db.ACTIVE_DATABASE_PATH), "database": database_info(db.ACTIVE_DATABASE_PATH), "databases": [database_info(db_path) for db_path in database_paths()]}


def metrics_for(session: Session, impl_option_id: str, subject_type: str, subject_id: str) -> dict[str, Metric]:
    rows = session.exec(
        select(Metric).where(
            Metric.impl_option_id == impl_option_id,
            Metric.subject_type == subject_type,
            Metric.subject_id == subject_id,
        )
    ).all()
    return {row.metric_name: row for row in rows}


def metric_number(metrics: dict[str, Metric], name: str) -> float:
    return number_or_zero(metrics[name].metric_value) if name in metrics else 0


def can_overwrite_with_auto_derived_metric(metric: Metric) -> bool:
    source_type = (metric.source_type or "").strip()
    if source_type in PROTECTED_AUTO_DERIVED_METRIC_SOURCES:
        return False
    if (metric.confidence or "").strip() == "approved":
        return False
    return True


def upsert_auto_derived_partition_metric(
    session: Session,
    metric_id: str,
    impl_option_id: str,
    partition_id: str,
    name: str,
    value: object,
    unit: str,
    category_type: str,
    value_type: str,
    corner: str,
    workload: str,
    source_note: str,
) -> None:
    existing_metric = session.get(Metric, metric_id)
    if existing_metric:
        if can_overwrite_with_auto_derived_metric(existing_metric):
            existing_metric.metric_value = str(value)
            existing_metric.metric_unit = unit
            existing_metric.metric_category = category_type
            existing_metric.value_type = value_type
            existing_metric.corner = corner
            existing_metric.workload = workload
            existing_metric.confidence = "review"
            existing_metric.source_type = AUTO_DERIVED_PARTITION_METRIC_SOURCE
            existing_metric.derivation = AUTO_DERIVED_PARTITION_METRIC_DERIVATION
            existing_metric.source_note = source_note
            session.add(existing_metric)
        return

    session.add(
        Metric(
            id=metric_id,
            impl_option_id=impl_option_id,
            subject_type="physical_partition",
            subject_id=partition_id,
            metric_name=name,
            metric_value=str(value),
            metric_unit=unit,
            metric_category=category_type,
            value_type=value_type,
            corner=corner,
            workload=workload,
            confidence="review",
            source_type=AUTO_DERIVED_PARTITION_METRIC_SOURCE,
            derivation=AUTO_DERIVED_PARTITION_METRIC_DERIVATION,
            source_note=source_note,
            created_at=now_iso(),
        )
    )


def normalized_content_share(partition_type: str, value: float | None) -> float:
    if partition_type == "full":
        return 1.0
    return float(value if value is not None else 1.0)


def normalized_resource_category(value: str | None) -> str:
    return value if value in ALLOWED_PARTITION_RESOURCE_CATEGORIES else "block"


def partition_equivalent_instances(partition: PhysicalPartition) -> float:
    return partition.physical_instance_count * normalized_content_share(partition.partition_type, partition.content_share)


def canonical_partition_name(component_name: str, category: str, tier_id: str, partition_type: str, partial_index: int = 0) -> str:
    base_name = f"{component_name}_{category}_{tier_id}"
    return f"{base_name}_P{partial_index}" if partition_type == "partial" else base_name


def component_required_resource_categories(session: Session, component: LogicalComponent, impl_option_id: str) -> set[str]:
    metrics = metrics_for(session, impl_option_id, "logical_component", component.id)
    area_summary = logical_area_summary(session, component, impl_option_id)
    metric_names = {
        "logic": "residual_logic_area" if area_summary["has_children"] else "logic_area",
        "sram": "residual_sram_area" if area_summary["has_children"] else "sram_area",
        "block": "residual_block_area" if area_summary["has_children"] else "block_area",
    }
    categories: set[str] = set()
    for category, metric_name in metric_names.items():
        value = area_summary[metric_name] if area_summary["has_children"] else metric_number(metrics, metric_name)
        if value > 0:
            categories.add(category)
    return categories


def is_global_team(team: str | None) -> bool:
    return not team or team in {"Architecture Team", "All", "All Teams"}


def allowed_component_ids_for_team(session: Session, team: str | None, impl_option_id: str = "S2") -> set[str] | None:
    if is_global_team(team):
        return None

    components = session.exec(select(LogicalComponent).order_by(LogicalComponent.hierarchy_path)).all()
    by_id = {component.id: component for component in components}
    assignments = session.exec(
        select(ResponsibilityAssignment).where(
            ResponsibilityAssignment.impl_option_id == impl_option_id,
            ResponsibilityAssignment.team_name == team,
            ResponsibilityAssignment.can_read == True,
        )
    ).all()
    root_ids = [assignment.logical_component_id for assignment in assignments]
    if not root_ids:
        root_ids = [
            component.id
            for component in components
            if component.owner_team == team
            and (not component.parent_id or by_id.get(component.parent_id, component).owner_team != team)
        ]

    allowed: set[str] = set()
    for root_id in root_ids:
        root = by_id.get(root_id)
        if not root:
            continue
        for component in components:
            if component.id == root.id or component.hierarchy_path.startswith(f"{root.hierarchy_path}/"):
                allowed.add(component.id)
    return allowed


def component_rows_for_team(session: Session, team: str | None, impl_option_id: str = "S2") -> tuple[list[LogicalComponent], set[str] | None]:
    rows = session.exec(select(LogicalComponent).order_by(LogicalComponent.hierarchy_path)).all()
    allowed = allowed_component_ids_for_team(session, team, impl_option_id)
    if allowed is None:
        return rows, None
    return [row for row in rows if row.id in allowed], allowed


def component_id_from_name(session: Session, name: str) -> str:
    base = safe_power_id_part(name)
    component_id = f"B_{base}" if not base.startswith("B_") else base
    index = 2
    while session.get(LogicalComponent, component_id):
        component_id = f"B_{base}_{index}" if not base.startswith("B_") else f"{base}_{index}"
        index += 1
    return component_id


def component_path(session: Session, parent_id: str | None, name: str) -> str:
    if not parent_id:
        return name
    parent = session.get(LogicalComponent, parent_id)
    if not parent:
        raise HTTPException(status_code=400, detail=f"Unknown parent_id: {parent_id}")
    return f"{parent.hierarchy_path}/{name}"


def ensure_unique_component_path(session: Session, project_id: str, hierarchy_path: str, component_id: str | None = None) -> None:
    duplicate = session.exec(
        select(LogicalComponent).where(
            LogicalComponent.project_id == project_id,
            LogicalComponent.hierarchy_path == hierarchy_path,
        )
    ).first()
    if duplicate and duplicate.id != component_id:
        raise HTTPException(
            status_code=409,
            detail=f"Logical component hierarchy_path already exists in project {project_id}: {hierarchy_path}",
        )


def descendant_component_ids(session: Session, component_id: str) -> set[str]:
    rows = session.exec(select(LogicalComponent)).all()
    children: dict[str, list[str]] = {}
    for row in rows:
        if row.parent_id:
            children.setdefault(row.parent_id, []).append(row.id)
    result: set[str] = set()

    def walk(current_id: str) -> None:
        for child_id in children.get(current_id, []):
            result.add(child_id)
            walk(child_id)

    walk(component_id)
    return result


def update_component_subtree_paths(session: Session, component: LogicalComponent) -> None:
    children = session.exec(select(LogicalComponent).where(LogicalComponent.parent_id == component.id)).all()
    for child in children:
        child.hierarchy_path = f"{component.hierarchy_path}/{child.name}"
        child.updated_at = now_iso()
        session.add(child)
        update_component_subtree_paths(session, child)


def ensure_component_write_scope(session: Session, component_id: str | None, team: str | None, impl_option_id: str) -> None:
    if is_global_team(team) or not component_id:
        return
    allowed = allowed_component_ids_for_team(session, team, impl_option_id)
    if allowed is not None and component_id not in allowed:
        raise HTTPException(status_code=403, detail=f"{component_id} is outside team scope {team}")


def scope_component_items(items: list[dict[str, Any]], allowed: set[str] | None) -> list[dict[str, Any]]:
    if allowed is None:
        return items
    return [{**item, "parent": item["parent"] if item["parent"] in allowed else None} for item in items]


def partition_ids_for_components(session: Session, impl_option_id: str, component_ids: set[str]) -> set[str]:
    rows = session.exec(select(PhysicalPartition).where(PhysicalPartition.impl_option_id == impl_option_id)).all()
    return {row.id for row in rows if row.logical_component_id in component_ids}


def absolute_logical_instance_count(session: Session, component: LogicalComponent) -> int:
    count = component.logical_instance_count
    curr = component
    while curr.parent_id:
        parent = session.get(LogicalComponent, curr.parent_id)
        if not parent:
            break
        count *= parent.logical_instance_count
        curr = parent
    return count


def partition_ui(session: Session, partition: PhysicalPartition) -> dict[str, Any]:
    logical = session.get(LogicalComponent, partition.logical_component_id)
    metrics = metrics_for(session, partition.impl_option_id, "physical_partition", partition.id)
    logical_count = logical.logical_instance_count if logical else 0
    content_share = normalized_content_share(partition.partition_type, partition.content_share)
    return {
        "id": partition.id,
        "impl_option_id": partition.impl_option_id,
        "logical_component_id": partition.logical_component_id,
        "logical_component_name": logical.name if logical else partition.logical_component_id,
        "tier_id": partition.tier_id,
        "partition_name": partition.partition_name,
        "partition_type": partition.partition_type,
        "resource_category": normalized_resource_category(partition.resource_category),
        "physical_instance_count": partition.physical_instance_count,
        "content_share": content_share,
        "instance_share": round(partition.physical_instance_count / logical_count, 4) if logical_count else 0,
        "partition_ratio": content_share,
        "logic_area": metric_number(metrics, "logic_area"),
        "sram_area": metric_number(metrics, "sram_area"),
        "block_area": metric_number(metrics, "block_area"),
        "shape_type": metrics["shape_type"].metric_value if "shape_type" in metrics else "",
        "description": partition.description,
    }


def logical_area_summary(session: Session, component: LogicalComponent, impl_option_id: str) -> dict[str, Any]:
    metrics = metrics_for(session, impl_option_id, "logical_component", component.id)
    total = {
        "logic_area": metric_number(metrics, "logic_area"),
        "sram_area": metric_number(metrics, "sram_area"),
        "block_area": metric_number(metrics, "block_area"),
    }
    child_rows = session.exec(select(LogicalComponent).where(LogicalComponent.parent_id == component.id)).all()
    child_sum = {"logic_area": 0.0, "sram_area": 0.0, "block_area": 0.0}
    for child in child_rows:
        child_metrics = metrics_for(session, impl_option_id, "logical_component", child.id)
        for metric_name in child_sum:
            child_sum[metric_name] += metric_number(child_metrics, metric_name)
    residual = {metric_name: round(total[metric_name] - child_sum[metric_name], 4) for metric_name in total}
    return {
        "has_children": bool(child_rows),
        "child_logic_area": round(child_sum["logic_area"], 4),
        "child_sram_area": round(child_sum["sram_area"], 4),
        "child_block_area": round(child_sum["block_area"], 4),
        "residual_logic_area": residual["logic_area"],
        "residual_sram_area": residual["sram_area"],
        "residual_block_area": residual["block_area"],
    }


def descendant_component_ids(session: Session, component_id: str) -> set[str]:
    rows = session.exec(select(LogicalComponent)).all()
    children_by_parent: dict[str, list[str]] = {}
    for row in rows:
        if row.parent_id:
            children_by_parent.setdefault(row.parent_id, []).append(row.id)
    ids = {component_id}
    stack = [component_id]
    while stack:
        parent_id = stack.pop()
        child_ids = children_by_parent.get(parent_id, [])
        ids.update(child_ids)
        stack.extend(child_ids)
    return ids


def process_scale_for_category(process: ProcessNode | None, category: str) -> float:
    if not process:
        return 1
    if category == "logic":
        return process.logic_area_scale
    if category == "sram":
        return process.sram_area_scale
    return process.block_area_scale


def partition_base_area_for_category(partition_row: dict[str, Any]) -> float:
    category = partition_row["resource_category"]
    if category == "logic":
        return partition_row["logic_area"]
    if category == "sram":
        return partition_row["sram_area"]
    if category == "block":
        return partition_row["block_area"]
    return partition_row["logic_area"] + partition_row["sram_area"] + partition_row["block_area"]


def component_tier_area_distribution(session: Session, component: LogicalComponent, impl_option_id: str) -> list[dict[str, Any]]:
    component_ids = descendant_component_ids(session, component.id)
    partitions = session.exec(
        select(PhysicalPartition).where(
            PhysicalPartition.impl_option_id == impl_option_id,
            PhysicalPartition.logical_component_id.in_(component_ids),
        )
    ).all()
    tiers = {tier.id: tier for tier in session.exec(select(Tier).where(Tier.impl_option_id == impl_option_id)).all()}
    processes = {process.id: process for process in session.exec(select(ProcessNode)).all()}
    rows_by_tier: dict[str, dict[str, Any]] = {}

    for partition in partitions:
        partition_row = partition_ui(session, partition)
        tier = tiers.get(partition.tier_id)
        process = processes.get(tier.process_id) if tier else None
        category = partition_row["resource_category"]
        scale = process_scale_for_category(process, category)
        base_area = partition_base_area_for_category(partition_row)
        scaled_area = base_area * scale
        row = rows_by_tier.setdefault(
            partition.tier_id,
            {
                "tier_id": partition.tier_id,
                "tier_name": tier.name if tier else partition.tier_id,
                "process_id": tier.process_id if tier else "",
                "process": f"{process.foundry} {process.node_name}" if process else "",
                "base_logic_area": 0.0,
                "base_sram_area": 0.0,
                "base_block_area": 0.0,
                "base_total_area": 0.0,
                "logic_area": 0.0,
                "sram_area": 0.0,
                "block_area": 0.0,
                "total_area": 0.0,
                "partition_count": 0,
            },
        )
        row[f"base_{category}_area"] += base_area
        row["base_total_area"] += base_area
        row[f"{category}_area"] += scaled_area
        row["total_area"] += scaled_area
        row["partition_count"] += 1

    tier_order = {tier.id: tier.tier_index for tier in tiers.values()}
    return [
        {
            **row,
            "base_logic_area": round(row["base_logic_area"], 4),
            "base_sram_area": round(row["base_sram_area"], 4),
            "base_block_area": round(row["base_block_area"], 4),
            "base_total_area": round(row["base_total_area"], 4),
            "logic_area": round(row["logic_area"], 4),
            "sram_area": round(row["sram_area"], 4),
            "block_area": round(row["block_area"], 4),
            "total_area": round(row["total_area"], 4),
        }
        for row in sorted(rows_by_tier.values(), key=lambda item: tier_order.get(item["tier_id"], 999))
    ]


def component_ui(session: Session, component: LogicalComponent, impl_option_id: str = "S2") -> dict[str, Any]:
    metrics = metrics_for(session, impl_option_id, "logical_component", component.id)
    partitions = session.exec(
        select(PhysicalPartition).where(
            PhysicalPartition.impl_option_id == impl_option_id,
            PhysicalPartition.logical_component_id == component.id,
        )
    ).all()
    tier_ids = sorted({partition.tier_id for partition in partitions})
    confidence_order = {"approved": 0, "review": 1, "draft": 2}
    confidence = min((metric.confidence for metric in metrics.values()), key=lambda item: confidence_order.get(item, 9), default="draft")
    partition_rows = [partition_ui(session, partition) for partition in partitions]
    equivalent_by_category = {
        category: round(sum(row["physical_instance_count"] * row["content_share"] for row in partition_rows if row["resource_category"] == category), 4)
        for category in sorted(ALLOWED_PARTITION_RESOURCE_CATEGORIES)
    }
    physical_instance_count = max(equivalent_by_category.values(), default=0)
    abs_logical_count = absolute_logical_instance_count(session, component)
    instance_share = round(physical_instance_count / component.logical_instance_count, 4) if component.logical_instance_count else 0
    block_area = metric_number(metrics, "block_area")
    if not block_area:
        block_area = sum(row["logic_area"] + row["sram_area"] + row["block_area"] for row in partition_rows)
    area_summary = logical_area_summary(session, component, impl_option_id)
    
    # compute own_mapping_closed
    own_closed = True
    self_area = {
        "logic": area_summary["residual_logic_area"] if area_summary["has_children"] else metric_number(metrics, "logic_area"),
        "sram": area_summary["residual_sram_area"] if area_summary["has_children"] else metric_number(metrics, "sram_area"),
        "block": area_summary["residual_block_area"] if area_summary["has_children"] else metric_number(metrics, "block_area"),
    }
    
    for category in ALLOWED_PARTITION_RESOURCE_CATEGORIES:
        category_partitions = [p for p in partitions if normalized_resource_category(p.resource_category) == category]
        expected_area = self_area[category]
        
        if len(category_partitions) == 0:
            if expected_area > 0.01:
                own_closed = False
            continue
            
        equiv = sum(partition_equivalent_instances(p) for p in category_partitions)
        mapped_area = sum(
            metric_number(metrics_for(session, impl_option_id, "physical_partition", p.id), f"{category}_area")
            for p in category_partitions
        )
        
        if abs(equiv - component.logical_instance_count) > 0.001 or abs(mapped_area - expected_area) > 0.01:
            own_closed = False

    # compute subtree_mapping_closed recursively
    child_rows = session.exec(select(LogicalComponent).where(LogicalComponent.parent_id == component.id)).all()
    if not own_closed:
        subtree_closed = False
    else:
        def check_descendant_closed(c: LogicalComponent) -> bool:
            c_metrics = metrics_for(session, impl_option_id, "logical_component", c.id)
            c_partitions = session.exec(
                select(PhysicalPartition).where(
                    PhysicalPartition.impl_option_id == impl_option_id,
                    PhysicalPartition.logical_component_id == c.id,
                )
            ).all()
            c_area_summary = logical_area_summary(session, c, impl_option_id)
            c_self_area = {
                "logic": c_area_summary["residual_logic_area"] if c_area_summary["has_children"] else metric_number(c_metrics, "logic_area"),
                "sram": c_area_summary["residual_sram_area"] if c_area_summary["has_children"] else metric_number(c_metrics, "sram_area"),
                "block": c_area_summary["residual_block_area"] if c_area_summary["has_children"] else metric_number(c_metrics, "block_area"),
            }
            
            for cat in ALLOWED_PARTITION_RESOURCE_CATEGORIES:
                cat_parts = [p for p in c_partitions if normalized_resource_category(p.resource_category) == cat]
                exp_area = c_self_area[cat]
                if len(cat_parts) == 0:
                    if exp_area > 0.01:
                        return False
                    continue
                eq = sum(partition_equivalent_instances(p) for p in cat_parts)
                ma = sum(
                    metric_number(metrics_for(session, impl_option_id, "physical_partition", p.id), f"{cat}_area")
                    for p in cat_parts
                )
                if abs(eq - c.logical_instance_count) > 0.001 or abs(ma - exp_area) > 0.01:
                    return False
            
            c_children = session.exec(select(LogicalComponent).where(LogicalComponent.parent_id == c.id)).all()
            for child in c_children:
                if not check_descendant_closed(child):
                    return False
            return True

        subtree_closed = True
        for child in child_rows:
            if not check_descendant_closed(child):
                subtree_closed = False
                break

    return {
        "id": component.id,
        "project_id": component.project_id,
        "parent": component.parent_id,
        "name": component.name,
        "type": component.instance_type,
        "domain": component.function_domain,
        "resource": component.resource_type,
        "hierarchy_path": component.hierarchy_path,
        "logical_instance_count": component.logical_instance_count,
        "absolute_logical_instance_count": abs_logical_count,
        "owner_team": component.owner_team,
        "visibility_level": component.visibility_level,
        "physical_instance_count": physical_instance_count,
        "equivalent_instances_by_category": equivalent_by_category,
        "instance_share": instance_share,
        "partition_ratio": instance_share,
        "signal_count_total": metric_number(metrics, "signal_count_total"),
        "logic_area": metric_number(metrics, "logic_area"),
        "sram_area": metric_number(metrics, "sram_area"),
        "block_area": block_area,
        "area": block_area,
        "tier": "/".join(tier_ids) if tier_ids else "-",
        "confidence": confidence,
        "partitions": partition_rows,
        "tier_area_distribution": component_tier_area_distribution(session, component, impl_option_id),
        "description": component.description,
        "own_mapping_closed": own_closed,
        "subtree_mapping_closed": subtree_closed,
        **area_summary,
    }


def build_component_tree(items: list[dict[str, Any]], parent: str | None = None) -> list[dict[str, Any]]:
    return [{**item, "children": build_component_tree(items, item["id"])} for item in items if item["parent"] == parent]


def impl_option_ui(session: Session, impl_option: ImplOption) -> dict[str, Any]:
    metrics = metrics_for(session, impl_option.id, "impl_option", impl_option.id)
    area = metric_number(metrics, "area")
    power = metric_number(metrics, "power")
    return {
        "id": impl_option.id,
        "project_id": impl_option.project_id,
        "name": impl_option.name,
        "process": impl_option.process_combo,
        "process_combo": impl_option.process_combo,
        "die": impl_option.impl_type,
        "impl_type": impl_option.impl_type,
        "area": area,
        "power": power,
        "risk": impl_option.status,
        "cost": "High" if impl_option.id == "S2" else "Medium",
        "thermal": "High" if impl_option.id == "S2" else "Medium",
        "description": impl_option.description,
        "status": impl_option.status,
        "created_at": impl_option.created_at,
        "updated_at": impl_option.updated_at,
    }


def impl_option_detail_ui(session: Session, impl_option_id: str) -> dict[str, Any]:
    implementation = session.get(ImplOptionDetail, impl_option_id)
    tiers = session.exec(select(ImplementationTier).where(ImplementationTier.impl_option_id == impl_option_id).order_by(ImplementationTier.tier_index)).all()
    interfaces = session.exec(select(ImplementationInterface).where(ImplementationInterface.impl_option_id == impl_option_id)).all()
    package_escape = session.get(ImplementationPackageEscape, impl_option_id)
    return {
        "exists": implementation is not None,
        "impl_option_id": impl_option_id,
        "implementation_type": implementation.implementation_type if implementation else "",
        "status": implementation.status if implementation else "draft",
        "version": implementation.version if implementation else 0,
        "updated_at": implementation.updated_at if implementation else "",
        "tiers": [
            {
                "id": tier.tier_id,
                "name": tier.name,
                "process": tier.process,
                "role": tier.role,
                "thickness_um": tier.thickness_um,
            }
            for tier in tiers
        ] if tiers else [
            {
                "id": tier.id,
                "name": tier.name,
                "process": tier.process_id,
                "role": tier.role,
                "thickness_um": tier.thickness_um,
            }
            for tier in session.exec(select(Tier).where(Tier.impl_option_id == impl_option_id).order_by(Tier.tier_index)).all()
        ],
        "interfaces": [
            {
                "id": row.id.removeprefix(f"{impl_option_id}:"),
                "from_tier_id": row.from_tier_id,
                "to_tier_id": row.to_tier_id,
                "orientation": row.orientation,
                "interconnect": row.interconnect,
                "hb_pitch_um": row.hb_pitch_um,
                "upper_tsv_pitch_um": row.upper_tsv_pitch_um,
                "upper_tsv_keepout_um": row.upper_tsv_keepout_um,
                "lower_tsv_pitch_um": row.lower_tsv_pitch_um,
                "lower_tsv_keepout_um": row.lower_tsv_keepout_um,
                "description": row.description,
            }
            for row in interfaces
        ],
        "package_escape": {
            "bottom_tier_id": package_escape.bottom_tier_id if package_escape else "",
            "requires_tsv": package_escape.requires_tsv if package_escape else False,
            "pitch_um": package_escape.pitch_um if package_escape else 0,
            "keepout_um": package_escape.keepout_um if package_escape else 0,
            "description": package_escape.description if package_escape else "",
        },
    }


def impl_option_detail_impact_errors(session: Session, impl_option_id: str, payload: ImplOptionDetailUpdate) -> list[str]:
    errors: list[str] = []
    new_tier_ids = [tier.id for tier in payload.tiers]
    if not new_tier_ids:
        errors.append("At least one implementation tier is required.")
    if len(new_tier_ids) != len(set(new_tier_ids)):
        errors.append("Tier ids must be unique within an implementation.")

    partition_rows = session.exec(select(PhysicalPartition).where(PhysicalPartition.impl_option_id == impl_option_id)).all()
    partition_usage: dict[str, int] = {}
    for row in partition_rows:
        partition_usage[row.tier_id] = partition_usage.get(row.tier_id, 0) + 1

    new_tier_set = set(new_tier_ids)
    for tier_id in sorted(tier_id for tier_id in partition_usage if tier_id not in new_tier_set):
        errors.append(f"Tier {tier_id} is used by {partition_usage[tier_id]} physical partitions and cannot be removed or renamed.")

    existing_tiers = session.exec(select(ImplementationTier).where(ImplementationTier.impl_option_id == impl_option_id)).all()
    existing_index = {row.tier_id: row.tier_index for row in existing_tiers}
    for index, tier_id in enumerate(new_tier_ids):
        if tier_id in partition_usage and tier_id in existing_index and existing_index[tier_id] != index:
            errors.append(f"Tier {tier_id} is used by {partition_usage[tier_id]} physical partitions and cannot be reordered.")

    for row in payload.interfaces:
        if row.from_tier_id not in new_tier_set or row.to_tier_id not in new_tier_set:
            errors.append(f"Interface {row.id} references tiers outside this implementation.")
    if payload.package_escape.bottom_tier_id and payload.package_escape.bottom_tier_id not in new_tier_set:
        errors.append(f"Package escape bottom_tier_id {payload.package_escape.bottom_tier_id} is not in this implementation.")
    return errors


def make_quality_issue(
    severity: str,
    title: str,
    detail: str,
    action: str,
    entity_type: str,
    entity_id: str,
) -> dict[str, str]:
    return {
        "id": f"{entity_type}:{entity_id}:{title}".replace(" ", "_").lower(),
        "severity": severity,
        "title": title,
        "detail": detail,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
    }


def quality_issues_for(session: Session, impl_option_id: str = "S2", team: str | None = None) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    components, allowed_component_ids = component_rows_for_team(session, team, impl_option_id)
    partitions = session.exec(select(PhysicalPartition).where(PhysicalPartition.impl_option_id == impl_option_id)).all()
    metrics = session.exec(select(Metric).where(Metric.impl_option_id == impl_option_id)).all()
    if allowed_component_ids is not None:
        partitions = [row for row in partitions if row.logical_component_id in allowed_component_ids]
        allowed_partition_ids = {row.id for row in partitions}
        metrics = [
            row
            for row in metrics
            if (row.subject_type == "logical_component" and row.subject_id in allowed_component_ids)
            or (row.subject_type == "physical_partition" and row.subject_id in allowed_partition_ids)
        ]
    all_components = session.exec(select(LogicalComponent)).all()
    by_id = {c.id: c for c in all_components}
    abs_counts: dict[str, int] = {}
    def get_abs_count(cid: str) -> int:
        if cid in abs_counts:
            return abs_counts[cid]
        c = by_id.get(cid)
        if not c:
            return 1
        if not c.parent_id:
            abs_counts[cid] = c.logical_instance_count
        else:
            abs_counts[cid] = c.logical_instance_count * get_abs_count(c.parent_id)
        return abs_counts[cid]

    partitions_by_component: dict[str, list[PhysicalPartition]] = {}
    metrics_by_subject: dict[tuple[str, str], dict[str, Metric]] = {}
    children_by_parent: dict[str, list[LogicalComponent]] = {}

    for partition in partitions:
        partitions_by_component.setdefault(partition.logical_component_id, []).append(partition)
    for row in metrics:
        metrics_by_subject.setdefault((row.subject_type, row.subject_id), {})[row.metric_name] = row
    for component in components:
        if component.parent_id:
            children_by_parent.setdefault(component.parent_id, []).append(component)

    metrics_by_identity: dict[tuple[str, str, str, str, str, str], list[Metric]] = {}
    for row in metrics:
        identity = (row.impl_option_id, row.subject_type, row.subject_id, row.metric_name, row.corner, row.workload)
        metrics_by_identity.setdefault(identity, []).append(row)
    for identity, rows in metrics_by_identity.items():
        if len(rows) <= 1:
            continue
        ids = ", ".join(row.id for row in rows)
        identity_detail = "/".join(identity)
        issues.append(
            make_quality_issue(
                "High",
                "Duplicate metric identity",
                f"Metric identity {identity_detail} has multiple rows: {ids}.",
                "Keep one metric row for each impl_option, subject, metric_name, corner, and workload.",
                "metric",
                rows[0].id,
            )
        )

    components_by_path: dict[tuple[str, str], list[LogicalComponent]] = {}
    for component in components:
        components_by_path.setdefault((component.project_id, component.hierarchy_path), []).append(component)
    for (project_id, hierarchy_path), rows in components_by_path.items():
        if len(rows) <= 1:
            continue
        ids = ", ".join(row.id for row in rows)
        issues.append(
            make_quality_issue(
                "High",
                "Duplicate logical hierarchy path",
                f"Project {project_id} has multiple logical components at {hierarchy_path}: {ids}.",
                "Keep one logical component row for this hierarchy path and express repeated instances with logical_instance_count.",
                "logical_component",
                rows[0].id,
            )
        )

    def self_area_by_category(component: LogicalComponent) -> dict[str, float]:
        available = metrics_by_subject.get(("logical_component", component.id), {})
        child_rows = children_by_parent.get(component.id, [])
        return {
            "logic": max(
                0.0,
                metric_number(available, "logic_area")
                - sum(metric_number(metrics_by_subject.get(("logical_component", child.id), {}), "logic_area") for child in child_rows),
            ),
            "sram": max(
                0.0,
                metric_number(available, "sram_area")
                - sum(metric_number(metrics_by_subject.get(("logical_component", child.id), {}), "sram_area") for child in child_rows),
            ),
            "block": max(
                0.0,
                metric_number(available, "block_area")
                - sum(metric_number(metrics_by_subject.get(("logical_component", child.id), {}), "block_area") for child in child_rows),
            ),
        }

    def partition_area_by_category(partition: PhysicalPartition, category: str) -> float:
        partition_metrics = metrics_by_subject.get(("physical_partition", partition.id), {})
        return metric_number(partition_metrics, f"{category}_area")

    own_mapping_closed: dict[str, bool] = {}
    area_epsilon = 0.01

    for component in components:
        component_partitions = partitions_by_component.get(component.id, [])
        self_area = self_area_by_category(component)
        component_closed = True

        for category in sorted(ALLOWED_PARTITION_RESOURCE_CATEGORIES):
            category_partitions = [partition for partition in component_partitions if normalized_resource_category(partition.resource_category) == category]
            expected_area = self_area[category]
            if len(category_partitions) == 0:
                if expected_area > area_epsilon:
                    component_closed = False
                    issues.append(
                        make_quality_issue(
                            "High",
                            f"{category.upper()} implementation coverage not closed",
                            f"{component.name} self/residual {category} maps to 0.000 equivalent instances, expected {component.logical_instance_count}.",
                            "Add physical partition rows for this resource category so count * content_share closes to the logical instance count.",
                            "logical_component",
                            component.id,
                        )
                    )
                continue
                
            equivalent_instances = sum(partition_equivalent_instances(partition) for partition in category_partitions)
            mapped_area = sum(partition_area_by_category(partition, category) for partition in category_partitions)

            if abs(equivalent_instances - component.logical_instance_count) > 0.001:
                component_closed = False
                issues.append(
                    make_quality_issue(
                        "High",
                        f"{category.upper()} implementation coverage not closed",
                        f"{component.name} self/residual {category} maps to {equivalent_instances:.3f} equivalent instances, expected {component.logical_instance_count}.",
                        "Adjust physical_instance_count and content_share for this resource category so count * content_share closes to the logical instance count.",
                        "logical_component",
                        component.id,
                    )
                )
            if abs(mapped_area - expected_area) > area_epsilon:
                component_closed = False
                issues.append(
                    make_quality_issue(
                        "High",
                        f"{category.upper()} area mapping not closed",
                        f"{component.name} self/residual {category} area maps to {mapped_area:.3f} mm2, expected {expected_area:.3f} mm2.",
                        "Adjust physical partition metrics for this resource category so direct partition base area equals the component self/residual area.",
                        "logical_component",
                        component.id,
                    )
                )

        own_mapping_closed[component.id] = component_closed

        for partition in component_partitions:
            if partition.resource_category not in ALLOWED_PARTITION_RESOURCE_CATEGORIES:
                issues.append(
                    make_quality_issue(
                        "Medium",
                        "Unsupported partition resource category",
                        f"{partition.id} uses resource_category={partition.resource_category}.",
                        "Use logic, sram, or block.",
                        "physical_partition",
                        partition.id,
                    )
                )
            if partition.partition_type == "full" and abs(partition.content_share - 1.0) > 0.001:
                issues.append(
                    make_quality_issue(
                        "Medium",
                        "Full partition content_share must be 1",
                        f"{partition.id} is full but content_share={partition.content_share}.",
                        "Set full partitions to content_share=1 or change the partition_type to partial.",
                        "physical_partition",
                        partition.id,
                    )
                )

    subtree_mapping_closed: dict[str, bool] = {}

    def is_subtree_mapping_closed(component: LogicalComponent) -> bool:
        if component.id in subtree_mapping_closed:
            return subtree_mapping_closed[component.id]
        child_rows = children_by_parent.get(component.id, [])
        child_status = all(is_subtree_mapping_closed(child) for child in child_rows)
        subtree_mapping_closed[component.id] = own_mapping_closed.get(component.id, False) and child_status
        return subtree_mapping_closed[component.id]

    for component in components:
        child_rows = children_by_parent.get(component.id, [])
        if not child_rows:
            continue
        open_children = [child.name for child in child_rows if not is_subtree_mapping_closed(child)]
        if open_children:
            issues.append(
                make_quality_issue(
                    "High",
                    "Subtree implementation mapping not closed",
                    f"{component.name} is not fully mapped because child subtree(s) are open: {', '.join(open_children)}.",
                    "Close every child subtree and this component's own residual/self mapping for each non-zero resource category.",
                    "logical_component",
                    component.id,
                )
            )

    required_logical_metrics = {"signal_count_total", "logic_area", "sram_area", "block_area"}
    parent_ids = {row.parent_id for row in components if row.parent_id}
    leaf_components = [row for row in components if row.id not in parent_ids]

    for component in components:
        child_rows = children_by_parent.get(component.id, [])
        if not child_rows:
            continue
        available = metrics_by_subject.get(("logical_component", component.id), {})
        missing_area = sorted({"logic_area", "sram_area", "block_area"} - set(available))
        if missing_area:
            issues.append(
                make_quality_issue(
                    "Medium",
                    "Parent total area metrics missing",
                    f"{component.name} needs total area metrics to compute residual area: {', '.join(missing_area)}.",
                    "Fill parent total logic_area, sram_area, and block_area; residual area is derived automatically.",
                    "logical_component",
                    component.id,
                )
            )
            continue
        for metric_name in ["logic_area", "sram_area", "block_area"]:
            parent_value = metric_number(available, metric_name)
            child_value = sum(metric_number(metrics_by_subject.get(("logical_component", child.id), {}), metric_name) for child in child_rows)
            if parent_value + 0.001 < child_value:
                issues.append(
                    make_quality_issue(
                        "High",
                        "Parent area smaller than child sum",
                        f"{component.name} {metric_name}={parent_value:.3f}, but direct children sum to {child_value:.3f}.",
                        "Parent total area should include child modules; residual area is computed as parent total minus direct child total.",
                        "logical_component",
                        component.id,
                    )
                )

    for component in leaf_components:
        available = metrics_by_subject.get(("logical_component", component.id), {})
        missing = sorted(required_logical_metrics - set(available))
        if missing:
            issues.append(
                make_quality_issue(
                    "Medium",
                    "Logical metrics missing",
                    f"{component.name} is missing logical metrics: {', '.join(missing)}.",
                    "Add the missing metric rows with subject_type=logical_component.",
                    "logical_component",
                    component.id,
                )
            )

    valid_subject_ids = {
        "logical_component": {row.id for row in components},
        "physical_partition": {row.id for row in partitions},
        "tier": {row.id for row in session.exec(select(Tier).where(Tier.impl_option_id == impl_option_id)).all()},
        "impl_option": {impl_option_id},
    }
    for row in metrics:
        if row.subject_id not in valid_subject_ids.get(row.subject_type, set()):
            issues.append(
                make_quality_issue(
                    "High",
                    "Metric subject missing",
                    f"{row.id} references missing {row.subject_type} subject_id={row.subject_id}.",
                    "Fix subject_type / subject_id or import the referenced entity first.",
                    "metric",
                    row.id,
                )
            )
        if row.value_type == "number":
            try:
                float(row.metric_value)
            except ValueError:
                issues.append(
                    make_quality_issue(
                        "High",
                        "Metric value is not numeric",
                        f"{row.id} declares value_type=number but metric_value={row.metric_value!r}.",
                        "Replace metric_value with a numeric value or change value_type.",
                        "metric",
                        row.id,
                    )
                )

    # Check tier area limits after process scaling
    tiers_in_impl_option = session.exec(select(Tier).where(Tier.impl_option_id == impl_option_id)).all()
    processes = {p.id: p for p in session.exec(select(ProcessNode)).all()}
    for tier in tiers_in_impl_option:
        process = processes.get(tier.process_id)
        tier_partitions = [p for p in partitions if p.tier_id == tier.id]
        total_scaled_area = 0.0
        for partition in tier_partitions:
            partition_metrics = metrics_by_subject.get(("physical_partition", partition.id), {})
            p_logic = metric_number(partition_metrics, "logic_area")
            p_sram = metric_number(partition_metrics, "sram_area")
            p_block = metric_number(partition_metrics, "block_area")
            
            scaled_logic = p_logic * process_scale_for_category(process, "logic")
            scaled_sram = p_sram * process_scale_for_category(process, "sram")
            scaled_block = p_block * process_scale_for_category(process, "block")
            
            total_scaled_area += (scaled_logic + scaled_sram + scaled_block)
            
        if tier.area_limit_mm2 > 0 and total_scaled_area > tier.area_limit_mm2:
            issues.append(
                make_quality_issue(
                    "Medium",
                    "Tier physical area limit exceeded",
                    f"Tier {tier.id} ({tier.name}) computed area {total_scaled_area:.3f} mm2 (after process scaling) exceeds its limit of {tier.area_limit_mm2:.3f} mm2.",
                    "Optimize partition mappings, move blocks to other tiers, or use a more advanced process node with better area scaling.",
                    "tier",
                    tier.id,
                )
            )

    return issues


@app.get("/api/design-options")
def get_design_options() -> list[dict[str, Any]]:
    return get_impl_options()


@app.get("/api/projects")
def get_projects() -> list[Project]:
    with Session(db.engine) as session:
        return list(session.exec(select(Project)).all())


@app.get("/api/impl-options")
def get_implOptions() -> list[dict[str, Any]]:
    with Session(db.engine) as session:
        return [impl_option_ui(session, impl_option) for impl_option in session.exec(select(ImplOption)).all()]


@app.get("/api/impl-options/{impl_option_id}/detail")
def get_impl_option_detail(impl_option_id: str) -> dict[str, Any]:
    with Session(db.engine) as session:
        impl_option = session.get(ImplOption, impl_option_id)
        if not impl_option:
            raise HTTPException(status_code=404, detail=f"Unknown impl_option_id: {impl_option_id}")
        return impl_option_detail_ui(session, impl_option_id)


@app.put("/api/impl-options/{impl_option_id}/detail")
def update_impl_option_detail(impl_option_id: str, payload: ImplOptionDetailUpdate) -> dict[str, Any]:
    with Session(db.engine) as session:
        impl_option = session.get(ImplOption, impl_option_id)
        if not impl_option:
            raise HTTPException(status_code=404, detail=f"Unknown impl_option_id: {impl_option_id}")

        errors = impl_option_detail_impact_errors(session, impl_option_id, payload)
        if errors:
            raise HTTPException(status_code=409, detail={"errors": errors})

        previous = session.get(ImplOptionDetail, impl_option_id)
        session.merge(
            ImplOptionDetail(
                impl_option_id=impl_option_id,
                implementation_type=payload.implementation_type,
                status=payload.status,
                version=(previous.version + 1) if previous else 1,
                updated_at=now_iso(),
            )
        )
        session.exec(delete(ImplementationTier).where(ImplementationTier.impl_option_id == impl_option_id))
        session.exec(delete(ImplementationInterface).where(ImplementationInterface.impl_option_id == impl_option_id))
        existing_escape = session.get(ImplementationPackageEscape, impl_option_id)
        if existing_escape:
            session.delete(existing_escape)

        for index, tier in enumerate(payload.tiers):
            session.add(
                ImplementationTier(
                    id=f"{impl_option_id}:{tier.id}",
                    impl_option_id=impl_option_id,
                    tier_id=tier.id,
                    tier_index=index,
                    name=tier.name,
                    process=tier.process,
                    role=tier.role,
                    thickness_um=tier.thickness_um,
                )
            )
        for row in payload.interfaces:
            session.add(
                ImplementationInterface(
                    id=f"{impl_option_id}:{row.id}",
                    impl_option_id=impl_option_id,
                    from_tier_id=row.from_tier_id,
                    to_tier_id=row.to_tier_id,
                    orientation=row.orientation,
                    interconnect=row.interconnect,
                    hb_pitch_um=row.hb_pitch_um,
                    upper_tsv_pitch_um=row.upper_tsv_pitch_um,
                    upper_tsv_keepout_um=row.upper_tsv_keepout_um,
                    lower_tsv_pitch_um=row.lower_tsv_pitch_um,
                    lower_tsv_keepout_um=row.lower_tsv_keepout_um,
                    description=row.description,
                )
            )
        session.add(
            ImplementationPackageEscape(
                impl_option_id=impl_option_id,
                bottom_tier_id=payload.package_escape.bottom_tier_id,
                requires_tsv=payload.package_escape.requires_tsv,
                pitch_um=payload.package_escape.pitch_um,
                keepout_um=payload.package_escape.keepout_um,
                description=payload.package_escape.description,
            )
        )
        session.commit()
        return {"implementation": impl_option_detail_ui(session, impl_option_id), "impact": {"blocked": False, "errors": []}}


@app.get("/api/module-definitions")
def get_module_definitions() -> list[ModuleDefinition]:
    with Session(db.engine) as session:
        return list(session.exec(select(ModuleDefinition)).all())


@app.post("/api/components")
def create_logical_component(payload: LogicalComponentInput) -> dict[str, Any]:
    with Session(db.engine) as session:
        if not session.get(Project, payload.project_id):
            raise HTTPException(status_code=400, detail=f"Unknown project_id: {payload.project_id}")
        if payload.parent_id:
            ensure_component_write_scope(session, payload.parent_id, payload.team, payload.impl_option_id)
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Component name is required.")
        if payload.logical_instance_count < 0:
            raise HTTPException(status_code=400, detail="logical_instance_count must be non-negative")
        component_id = (payload.id or "").strip() or component_id_from_name(session, name)
        if session.get(LogicalComponent, component_id):
            raise HTTPException(status_code=409, detail=f"Logical component already exists: {component_id}")
        if payload.module_definition_id and not session.get(ModuleDefinition, payload.module_definition_id):
            raise HTTPException(status_code=400, detail=f"Unknown module_definition_id: {payload.module_definition_id}")
        hierarchy_path = component_path(session, payload.parent_id, name)
        ensure_unique_component_path(session, payload.project_id, hierarchy_path, component_id)
        row = LogicalComponent(
            id=component_id,
            project_id=payload.project_id,
            parent_id=payload.parent_id or None,
            module_definition_id=payload.module_definition_id or None,
            name=name,
            instance_type=payload.instance_type.strip() or "block",
            resource_type=payload.resource_type.strip() or "logic",
            function_domain=payload.function_domain.strip() or "General",
            hierarchy_path=hierarchy_path,
            logical_instance_count=payload.logical_instance_count,
            owner_team=payload.owner_team.strip() or "Architecture Team",
            visibility_level=payload.visibility_level.strip() or "team",
            description=payload.description or "",
            created_at=now_iso(),
            updated_at=now_iso(),
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return component_ui(session, row, payload.impl_option_id)


@app.put("/api/components/{component_id}")
def update_logical_component(component_id: str, payload: LogicalComponentInput) -> dict[str, Any]:
    with Session(db.engine) as session:
        row = session.get(LogicalComponent, component_id)
        if not row:
            raise HTTPException(status_code=404, detail=f"Unknown logical component: {component_id}")
        ensure_component_write_scope(session, component_id, payload.team, payload.impl_option_id)
        if payload.parent_id:
            ensure_component_write_scope(session, payload.parent_id, payload.team, payload.impl_option_id)
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Component name is required.")
        if payload.logical_instance_count < 0:
            raise HTTPException(status_code=400, detail="logical_instance_count must be non-negative")
        if payload.parent_id == component_id:
            raise HTTPException(status_code=400, detail="A component cannot be its own parent.")
        if payload.parent_id and payload.parent_id in descendant_component_ids(session, component_id):
            raise HTTPException(status_code=400, detail="A component cannot be moved under its own descendant.")
        if payload.parent_id and not session.get(LogicalComponent, payload.parent_id):
            raise HTTPException(status_code=400, detail=f"Unknown parent_id: {payload.parent_id}")
        if payload.module_definition_id and not session.get(ModuleDefinition, payload.module_definition_id):
            raise HTTPException(status_code=400, detail=f"Unknown module_definition_id: {payload.module_definition_id}")
        hierarchy_path = component_path(session, payload.parent_id, name)
        ensure_unique_component_path(session, payload.project_id, hierarchy_path, component_id)

        row.project_id = payload.project_id
        row.parent_id = payload.parent_id or None
        row.module_definition_id = payload.module_definition_id or None
        row.name = name
        row.instance_type = payload.instance_type.strip() or "block"
        row.resource_type = payload.resource_type.strip() or "logic"
        row.function_domain = payload.function_domain.strip() or "General"
        row.logical_instance_count = payload.logical_instance_count
        row.owner_team = payload.owner_team.strip() or "Architecture Team"
        row.visibility_level = payload.visibility_level.strip() or "team"
        row.description = payload.description or ""
        row.hierarchy_path = hierarchy_path
        row.updated_at = now_iso()
        session.add(row)
        update_component_subtree_paths(session, row)
        session.commit()
        session.refresh(row)
        return component_ui(session, row, payload.impl_option_id)


@app.delete("/api/components/{component_id}")
def delete_logical_component(component_id: str, payload: LogicalComponentDeleteInput) -> dict[str, Any]:
    with Session(db.engine) as session:
        row = session.get(LogicalComponent, component_id)
        if not row:
            raise HTTPException(status_code=404, detail=f"Unknown logical component: {component_id}")
        ensure_component_write_scope(session, component_id, payload.team, payload.impl_option_id)
        ids = {component_id, *descendant_component_ids(session, component_id)}
        if not payload.cascade and len(ids) > 1:
            raise HTTPException(status_code=409, detail="Component has children. Enable cascade to delete the subtree.")
        partitions = session.exec(select(PhysicalPartition).where(PhysicalPartition.logical_component_id.in_(ids))).all()
        partition_ids = {partition.id for partition in partitions}
        if partition_ids:
            session.exec(delete(Metric).where(Metric.subject_type == "physical_partition", Metric.subject_id.in_(partition_ids)))
        session.exec(delete(PhysicalPartition).where(PhysicalPartition.logical_component_id.in_(ids)))
        session.exec(delete(Metric).where(Metric.subject_type == "logical_component", Metric.subject_id.in_(ids)))
        session.exec(delete(PowerObservation).where(PowerObservation.scope_type == "component", PowerObservation.scope_id.in_(ids)))
        session.exec(delete(ApplicationScenarioSelection).where(ApplicationScenarioSelection.component_id.in_(ids)))
        for logical_id in sorted(ids, key=lambda value: session.get(LogicalComponent, value).hierarchy_path if session.get(LogicalComponent, value) else "", reverse=True):
            item = session.get(LogicalComponent, logical_id)
            if item:
                session.delete(item)
        session.commit()
        return {"deleted_component_ids": sorted(ids), "deleted_partition_ids": sorted(partition_ids)}


@app.get("/api/components")
def get_components(impl_option_id: str = "S2", team: str | None = None) -> list[dict[str, Any]]:
    with Session(db.engine) as session:
        rows, allowed = component_rows_for_team(session, team, impl_option_id)
        return scope_component_items([component_ui(session, row, impl_option_id) for row in rows], allowed)


@app.get("/api/components/tree")
def get_component_tree(impl_option_id: str = "S2", team: str | None = None) -> list[dict[str, Any]]:
    with Session(db.engine) as session:
        rows, allowed = component_rows_for_team(session, team, impl_option_id)
        return build_component_tree(scope_component_items([component_ui(session, row, impl_option_id) for row in rows], allowed))


@app.get("/api/physical-partitions")
def get_physical_partitions(impl_option_id: str = "S2", team: str | None = None) -> list[dict[str, Any]]:
    with Session(db.engine) as session:
        allowed = allowed_component_ids_for_team(session, team, impl_option_id)
        rows = session.exec(select(PhysicalPartition).where(PhysicalPartition.impl_option_id == impl_option_id)).all()
        if allowed is not None:
            rows = [row for row in rows if row.logical_component_id in allowed]
        return [partition_ui(session, row) for row in rows]



def recalculate_component_partitions(session: Session, impl_option_id: str, component_id: str):
    partitions = session.exec(
        select(PhysicalPartition).where(
            PhysicalPartition.impl_option_id == impl_option_id,
            PhysicalPartition.logical_component_id == component_id,
        )
    ).all()
    if not partitions:
        return

    logical_metrics = metrics_for(session, impl_option_id, "logical_component", component_id)
    current_logic_area = metric_number(logical_metrics, "logic_area")
    current_sram_area = metric_number(logical_metrics, "sram_area")
    current_block_area = metric_number(logical_metrics, "block_area")

    child_rows = session.exec(select(LogicalComponent).where(LogicalComponent.parent_id == component_id)).all()
    child_sum = {"logic_area": 0.0, "sram_area": 0.0, "block_area": 0.0}
    for child in child_rows:
        child_metrics = metrics_for(session, impl_option_id, "logical_component", child.id)
        for m_name in child_sum:
            child_sum[m_name] += metric_number(child_metrics, m_name)

    self_area = {
        "logic": max(0.0, current_logic_area - child_sum["logic_area"]),
        "sram": max(0.0, current_sram_area - child_sum["sram_area"]),
        "block": max(0.0, current_block_area - child_sum["block_area"]),
    }

    required_cats = {cat for cat, val in self_area.items() if val > 0.01}
    if not required_cats:
        required_cats = {"block"}

    partitions_by_cat = {}
    for p in partitions:
        partitions_by_cat.setdefault(normalized_resource_category(p.resource_category), []).append(p)

    for cat in ["logic", "sram", "block"]:
        cat_items = partitions_by_cat.get(cat, [])
        cat_area = self_area[cat]

        total_equiv = 0.0
        for p in cat_items:
            c_share = normalized_content_share(p.partition_type, p.content_share if p.content_share is not None else p.partition_ratio)
            total_equiv += p.physical_instance_count * c_share

        if total_equiv <= 0.001:
            total_equiv = 1.0

        for p in cat_items:
            c_share = normalized_content_share(p.partition_type, p.content_share if p.content_share is not None else p.partition_ratio)
            equiv = p.physical_instance_count * c_share
            share = equiv / total_equiv

            p_logic_val = round(cat_area * share, 3) if cat == "logic" else 0.0
            p_sram_val = round(cat_area * share, 3) if cat == "sram" else 0.0
            p_block_val = round(cat_area * share, 3) if cat == "block" else 0.0
            p_shape = f"{cat}_{p.tier_id.lower()}"

            p_metric_configs = [
                ("logic_area", p_logic_val, "mm2", "implementation_area", "number", "typical", "nominal"),
                ("sram_area", p_sram_val, "mm2", "implementation_area", "number", "typical", "nominal"),
                ("block_area", p_block_val, "mm2", "implementation_area", "number", "typical", "nominal"),
                ("shape_type", p_shape, "", "physical_shape", "text", "typical", "nominal"),
            ]
            for name, val, unit, category_type, val_type, corner, workload in p_metric_configs:
                metric_id = f"M_PART_{p.id}_{name.upper()}"
                upsert_auto_derived_partition_metric(
                    session,
                    metric_id,
                    impl_option_id,
                    p.id,
                    name,
                    val,
                    unit,
                    category_type,
                    val_type,
                    corner,
                    workload,
                    "Recalculated on child area change",
                )


@app.put("/api/components/{component_id}/detail")
def update_component_detail(component_id: str, payload: ComponentDetailUpdate) -> dict[str, Any]:
    with Session(db.engine) as session:
        component = session.get(LogicalComponent, component_id)
        if not component:
            raise HTTPException(status_code=404, detail=f"Unknown logical component: {component_id}")

        allowed = allowed_component_ids_for_team(session, payload.team, payload.impl_option_id)
        if allowed is not None and component_id not in allowed:
            raise HTTPException(status_code=403, detail=f"{component_id} is outside team scope {payload.team}")

        impl_option = session.get(ImplOption, payload.impl_option_id)
        if not impl_option:
            raise HTTPException(status_code=400, detail=f"Unknown impl_option_id: {payload.impl_option_id}")
        tier_ids = {row.id for row in session.exec(select(Tier).where(Tier.impl_option_id == payload.impl_option_id)).all()}
        if payload.logical_instance_count < 0:
            raise HTTPException(status_code=400, detail="logical_instance_count must be non-negative")

        canonical_partitions: list[tuple[PartitionInput, str, str, str]] = []
        partial_counters: dict[tuple[str, str], int] = {}
        for partition in payload.partitions:
            category = normalized_resource_category(partition.resource_category)
            partial_index = 0
            if partition.partition_type == "partial":
                counter_key = (category, partition.tier_id)
                partial_index = partial_counters.get(counter_key, 0) + 1
                partial_counters[counter_key] = partial_index
            partition_name = canonical_partition_name(component.name, category, partition.tier_id, partition.partition_type, partial_index)
            canonical_partitions.append((partition, category, f"PP_{partition_name}", partition_name))

        seen_partition_ids: set[str] = set()
        for partition, category, partition_id, _partition_name in canonical_partitions:
            if partition_id in seen_partition_ids:
                raise HTTPException(status_code=400, detail=f"Duplicate generated partition id: {partition_id}")
            seen_partition_ids.add(partition_id)
            if partition.tier_id not in tier_ids:
                raise HTTPException(status_code=400, detail=f"Unknown tier_id for impl_option {payload.impl_option_id}: {partition.tier_id}")
            if partition.partition_type not in ALLOWED_PARTITION_TYPES:
                raise HTTPException(status_code=400, detail=f"Unsupported partition_type: {partition.partition_type}")
            if category not in ALLOWED_PARTITION_RESOURCE_CATEGORIES:
                raise HTTPException(status_code=400, detail=f"Unsupported resource_category: {partition.resource_category}")
            if partition.physical_instance_count < 0:
                raise HTTPException(status_code=400, detail=f"{partition.id} has negative physical_instance_count")
            content_share = normalized_content_share(partition.partition_type, partition.content_share if partition.content_share is not None else partition.partition_ratio)
            if content_share < 0:
                raise HTTPException(status_code=400, detail=f"{partition.id} has negative content_share")
            if partition.partition_type == "full" and abs(content_share - 1.0) > 0.001:
                raise HTTPException(status_code=400, detail=f"{partition.id} is full, so content_share must be 1")

        component.logical_instance_count = payload.logical_instance_count
        component.updated_at = now_iso()
        session.add(component)

        # Update logical component metrics if provided
        metric_configs = [
            ("signal_count_total", payload.signal_count_total, "count", "logical", "number", "typical", "nominal"),
            ("logic_area", payload.logic_area, "mm2", "logical_area", "number", "typical", "nominal"),
            ("sram_area", payload.sram_area, "mm2", "logical_area", "number", "typical", "nominal"),
            ("block_area", payload.block_area, "mm2", "logical_area", "number", "typical", "nominal"),
        ]
        
        for name, val, unit, category, value_type, corner, workload in metric_configs:
            if val is not None:
                metric_id = f"M_LOG_{component_id}_{name.upper()}"
                existing_metric = session.get(Metric, metric_id)
                if existing_metric:
                    existing_metric.metric_value = str(val)
                    existing_metric.source_type = "web_ui"
                    existing_metric.derivation = "manual"
                    existing_metric.source_note = "Updated via web interface editor"
                    session.add(existing_metric)
                else:
                    new_metric = Metric(
                        id=metric_id,
                        impl_option_id=payload.impl_option_id,
                        subject_type="logical_component",
                        subject_id=component_id,
                        metric_name=name,
                        metric_value=str(val),
                        metric_unit=unit,
                        metric_category=category,
                        value_type=value_type,
                        corner=corner,
                        workload=workload,
                        confidence="review",
                        source_type="web_ui",
                        derivation="manual",
                        source_note="Updated via web interface editor",
                        created_at=now_iso(),
                    )
                    session.add(new_metric)

        existing = session.exec(
            select(PhysicalPartition).where(
                PhysicalPartition.impl_option_id == payload.impl_option_id,
                PhysicalPartition.logical_component_id == component_id,
            )
        ).all()
        for partition in existing:
            if partition.id not in seen_partition_ids:
                session.exec(
                    delete(Metric).where(
                        Metric.impl_option_id == payload.impl_option_id,
                        Metric.subject_type == "physical_partition",
                        Metric.subject_id == partition.id,
                    )
                )
                session.delete(partition)

        for partition, category, partition_id, partition_name in canonical_partitions:
            content_share = normalized_content_share(partition.partition_type, partition.content_share if partition.content_share is not None else partition.partition_ratio)
            row = PhysicalPartition(
                id=partition_id,
                impl_option_id=payload.impl_option_id,
                logical_component_id=component_id,
                tier_id=partition.tier_id,
                partition_name=partition_name,
                partition_type=partition.partition_type,
                resource_category=category,
                physical_instance_count=partition.physical_instance_count,
                partition_ratio=content_share,
                content_share=content_share,
                description=partition.description,
            )
            session.merge(row)

        # Recalculate physical partition metrics to maintain data consistency
        logical_metrics = metrics_for(session, payload.impl_option_id, "logical_component", component_id)
        current_logic_area = payload.logic_area if payload.logic_area is not None else metric_number(logical_metrics, "logic_area")
        current_sram_area = payload.sram_area if payload.sram_area is not None else metric_number(logical_metrics, "sram_area")
        current_block_area = payload.block_area if payload.block_area is not None else metric_number(logical_metrics, "block_area")

        child_rows = session.exec(select(LogicalComponent).where(LogicalComponent.parent_id == component_id)).all()
        child_sum = {"logic_area": 0.0, "sram_area": 0.0, "block_area": 0.0}
        for child in child_rows:
            child_metrics = metrics_for(session, payload.impl_option_id, "logical_component", child.id)
            for m_name in child_sum:
                child_sum[m_name] += metric_number(child_metrics, m_name)

        self_area = {
            "logic": max(0.0, current_logic_area - child_sum["logic_area"]),
            "sram": max(0.0, current_sram_area - child_sum["sram_area"]),
            "block": max(0.0, current_block_area - child_sum["block_area"]),
        }

        required_cats = {cat for cat, val in self_area.items() if val > 0.01}
        if not required_cats:
            required_cats = {"block"}

        partitions_by_cat = {}
        for item in canonical_partitions:
            partitions_by_cat.setdefault(item[1], []).append(item)

        for cat in ["logic", "sram", "block"]:
            cat_items = partitions_by_cat.get(cat, [])
            cat_area = self_area[cat]
            
            total_equiv = 0.0
            for p_in, _, _, _ in cat_items:
                c_share = normalized_content_share(p_in.partition_type, p_in.content_share if p_in.content_share is not None else p_in.partition_ratio)
                total_equiv += p_in.physical_instance_count * c_share
                
            if total_equiv <= 0.001:
                total_equiv = 1.0
                
            for p_in, _, p_id, _ in cat_items:
                c_share = normalized_content_share(p_in.partition_type, p_in.content_share if p_in.content_share is not None else p_in.partition_ratio)
                equiv = p_in.physical_instance_count * c_share
                share = equiv / total_equiv
                
                p_logic_val = round(cat_area * share, 3) if cat == "logic" else 0.0
                p_sram_val = round(cat_area * share, 3) if cat == "sram" else 0.0
                p_block_val = round(cat_area * share, 3) if cat == "block" else 0.0
                p_shape = f"{cat}_{p_in.tier_id.lower()}"
                
                p_metric_configs = [
                    ("logic_area", p_logic_val, "mm2", "implementation_area", "number", "typical", "nominal"),
                    ("sram_area", p_sram_val, "mm2", "implementation_area", "number", "typical", "nominal"),
                    ("block_area", p_block_val, "mm2", "implementation_area", "number", "typical", "nominal"),
                    ("shape_type", p_shape, "", "physical_shape", "text", "typical", "nominal"),
                ]
                for name, val, unit, category_type, val_type, corner, workload in p_metric_configs:
                    metric_id = f"M_PART_{p_id}_{name.upper()}"
                    upsert_auto_derived_partition_metric(
                        session,
                        metric_id,
                        payload.impl_option_id,
                        p_id,
                        name,
                        val,
                        unit,
                        category_type,
                        val_type,
                        corner,
                        workload,
                        "Recalculated on component detail save",
                    )

        if component.parent_id:
            recalculate_component_partitions(session, payload.impl_option_id, component.parent_id)

        session.commit()
        session.refresh(component)
        return {
            "component": component_ui(session, component, payload.impl_option_id),
            "quality_issues": quality_issues_for(session, payload.impl_option_id, payload.team),
        }


@app.get("/api/tiers")
def get_tiers(impl_option_id: str = "S2") -> list[dict[str, Any]]:
    with Session(db.engine) as session:
        tiers = session.exec(select(Tier).where(Tier.impl_option_id == impl_option_id).order_by(Tier.tier_index)).all()
        process_nodes = {node.id: node for node in session.exec(select(ProcessNode)).all()}
        return [
            {
                "id": tier.id,
                "impl_option_id": tier.impl_option_id,
                "tier_index": tier.tier_index,
                "name": tier.name,
                "process_id": tier.process_id,
                "process": f"{process_nodes[tier.process_id].foundry} {process_nodes[tier.process_id].node_name}" if tier.process_id in process_nodes else tier.process_id,
                "role": tier.role,
                "orientation": tier.orientation,
                "thickness_um": tier.thickness_um,
                "area": tier.area_limit_mm2,
                "area_limit_mm2": tier.area_limit_mm2,
                "power": metric_number(metrics_for(session, impl_option_id, "tier", tier.id), "power"),
                "utilization": metric_number(metrics_for(session, impl_option_id, "tier", tier.id), "utilization"),
                "interconnect": "HB < 1um" if tier.id == "T0" else "HB + TSV" if tier.id == "T1" else "TSV < 5um",
                "description": tier.description,
            }
            for tier in tiers
        ]


@app.get("/api/metrics")
def get_metrics(impl_option_id: str | None = None, team: str | None = None) -> list[Metric]:
    with Session(db.engine) as session:
        statement = select(Metric)
        if impl_option_id:
            statement = statement.where(Metric.impl_option_id == impl_option_id)
        rows = list(session.exec(statement).all())
        if is_global_team(team):
            return rows
        scoped_impl_option_id = impl_option_id or "S2"
        allowed_component_ids = allowed_component_ids_for_team(session, team, scoped_impl_option_id) or set()
        allowed_partition_ids = partition_ids_for_components(session, scoped_impl_option_id, allowed_component_ids)
        return [
            row
            for row in rows
            if row.impl_option_id == scoped_impl_option_id
            and (
                (row.subject_type == "logical_component" and row.subject_id in allowed_component_ids)
                or (row.subject_type == "physical_partition" and row.subject_id in allowed_partition_ids)
            )
        ]


@app.get("/api/quality/issues")
def get_quality_issues(impl_option_id: str = "S2", team: str | None = None) -> list[dict[str, str]]:
    with Session(db.engine) as session:
        return quality_issues_for(session, impl_option_id, team)


@app.get("/api/responsibilities/teams")
def get_responsibility_teams(impl_option_id: str = "S2") -> list[str]:
    with Session(db.engine) as session:
        assignments = session.exec(
            select(ResponsibilityAssignment).where(ResponsibilityAssignment.impl_option_id == impl_option_id)
        ).all()
        teams = {assignment.team_name for assignment in assignments}
        teams.update(row.owner_team for row in session.exec(select(LogicalComponent)).all() if row.owner_team)
        return ["Architecture Team"] + sorted(team for team in teams if team != "Architecture Team")


@app.get("/api/dashboard")
def get_dashboard(impl_option_id: str = "S2") -> dict[str, Any]:
    with Session(db.engine) as session:
        implOptions = [impl_option_ui(session, row) for row in session.exec(select(ImplOption)).all()]
        component_rows = session.exec(select(LogicalComponent).order_by(LogicalComponent.hierarchy_path)).all()
        components = [component_ui(session, row, impl_option_id) for row in component_rows]
        partitions = [partition_ui(session, row) for row in session.exec(select(PhysicalPartition).where(PhysicalPartition.impl_option_id == impl_option_id)).all()]
        target = next((item for item in implOptions if item["id"] == impl_option_id), implOptions[0])
        parent_ids = {row.parent_id for row in component_rows if row.parent_id}
        leaf_ids = {row.id for row in component_rows if row.id not in parent_ids}
        leaf_components = [item for item in components if item["id"] in leaf_ids]
        sram_area = sum(item["sram_area"] for item in leaf_components)
        phy_area = sum(item["block_area"] for item in leaf_components if "phy" in item["resource"])
        resource_area = {"Logic + mixed": 0.0, "SRAM / memory": 0.0, "PHY / Analog": 0.0}
        for item in leaf_components:
            if "phy" in item["resource"]:
                resource_area["PHY / Analog"] += item["block_area"]
            elif "memory" in item["resource"] and "logic" not in item["resource"]:
                resource_area["SRAM / memory"] += item["block_area"]
            else:
                resource_area["Logic + mixed"] += item["block_area"]
        total = sum(resource_area.values()) or 1
        return {
            "target_impl_option": target,
            "metrics": {
                "total_area": target["area"],
                "total_power": target["power"],
                "total_sram_area": round(sram_area, 2),
                "phy_area": round(phy_area, 1),
                "partition_count": len(partitions),
            },
            "resource_mix": [
                {"label": label, "value": round(value / total * 100), "tone": tone}
                for (label, value), tone in zip(resource_area.items(), ["bg-slate-900", "bg-slate-500", "bg-slate-300"])
            ],
            "projects": list(session.exec(select(Project)).all()),
            "implOptions": implOptions,
        }


