from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from backend.models import LogicalComponent, ProcessNode
from backend.services.metric_service import metric_number, metrics_for


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
