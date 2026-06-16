from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from backend.db import now_iso
from backend.models import Metric


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


def find_metric_by_identity(
    session: Session,
    impl_option_id: str,
    subject_type: str,
    subject_id: str,
    metric_name: str,
    corner: str,
    workload: str,
) -> Metric | None:
    return session.exec(
        select(Metric).where(
            Metric.impl_option_id == impl_option_id,
            Metric.subject_type == subject_type,
            Metric.subject_id == subject_id,
            Metric.metric_name == metric_name,
            Metric.corner == corner,
            Metric.workload == workload,
        )
    ).first()


def can_overwrite_with_auto_derived_metric(metric: Metric) -> bool:
    source_type = (metric.source_type or "").strip()
    if source_type in PROTECTED_AUTO_DERIVED_METRIC_SOURCES:
        return False
    if (metric.confidence or "").strip() == "approved":
        return False
    return True


def upsert_web_metric(
    session: Session,
    metric_id: str,
    impl_option_id: str,
    subject_type: str,
    subject_id: str,
    name: str,
    value: object,
    unit: str,
    category_type: str,
    value_type: str,
    corner: str,
    workload: str,
    source_note: str,
) -> None:
    existing_metric = session.get(Metric, metric_id) or find_metric_by_identity(
        session, impl_option_id, subject_type, subject_id, name, corner, workload
    )
    if existing_metric:
        existing_metric.metric_value = str(value)
        existing_metric.metric_unit = unit
        existing_metric.metric_category = category_type
        existing_metric.value_type = value_type
        existing_metric.corner = corner
        existing_metric.workload = workload
        existing_metric.source_type = "web_ui"
        existing_metric.derivation = "manual"
        existing_metric.source_note = source_note
        session.add(existing_metric)
        return

    session.add(
        Metric(
            id=metric_id,
            impl_option_id=impl_option_id,
            subject_type=subject_type,
            subject_id=subject_id,
            metric_name=name,
            metric_value=str(value),
            metric_unit=unit,
            metric_category=category_type,
            value_type=value_type,
            corner=corner,
            workload=workload,
            confidence="review",
            source_type="web_ui",
            derivation="manual",
            source_note=source_note,
            created_at=now_iso(),
        )
    )


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
    existing_metric = session.get(Metric, metric_id) or find_metric_by_identity(
        session, impl_option_id, "physical_partition", partition_id, name, corner, workload
    )
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
