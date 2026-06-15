from __future__ import annotations

from backend.imports import drop_redundant_legacy_metric_rows, validate_import_rows


def _empty_import_rows() -> dict[str, list[dict]]:
    return {
        "module_definitions": [],
        "projects": [],
        "implOptions": [],
        "tiers": [],
        "logical_components": [],
        "physical_partitions": [],
        "metrics": [],
    }


def _metric_row(metric_id: str, metric_value: str = "1.0") -> dict:
    return {
        "id": metric_id,
        "impl_option_id": "S2",
        "subject_type": "logical_component",
        "subject_id": "B_CPU",
        "metric_name": "logic_area",
        "metric_value": metric_value,
        "metric_unit": "mm2",
        "metric_category": "logical_area",
        "value_type": "number",
        "corner": "typical",
        "workload": "nominal",
        "confidence": "review",
        "source_note": "",
        "created_at": "2026-06-15",
    }


def test_import_validation_rejects_duplicate_metric_identity_in_workbook() -> None:
    rows = _empty_import_rows()
    rows["metrics"] = [_metric_row("M_A"), _metric_row("M_B")]

    errors = validate_import_rows(
        rows,
        {
            "projects": {"P001"},
            "implOptions": {"S2"},
            "logical_components": {"B_CPU"},
            "physical_partitions": set(),
            "tiers": set(),
            "module_definitions": set(),
            "metric_identities": {},
        },
    )

    assert any("duplicate metric identity" in error for error in errors)


def test_import_validation_rejects_metric_identity_conflict_with_existing_row() -> None:
    rows = _empty_import_rows()
    rows["metrics"] = [_metric_row("M_NEW")]
    identity = ("S2", "logical_component", "B_CPU", "logic_area", "typical", "nominal")

    errors = validate_import_rows(
        rows,
        {
            "projects": {"P001"},
            "implOptions": {"S2"},
            "logical_components": {"B_CPU"},
            "physical_partitions": set(),
            "tiers": set(),
            "module_definitions": set(),
            "metric_identities": {identity: "M_EXISTING"},
        },
    )

    assert any("already belongs to M_EXISTING" in error for error in errors)


def test_import_drops_known_legacy_metric_when_canonical_identity_exists() -> None:
    rows = _empty_import_rows()
    legacy = {
        **_metric_row("M_IMPL_OPTION_AREA", "74.6"),
        "subject_type": "impl_option",
        "subject_id": "S2",
        "metric_name": "area",
        "metric_category": "physical",
    }
    canonical = {
        **_metric_row("M_IMPL_OPTION_S2_AREA", "119.0"),
        "subject_type": "impl_option",
        "subject_id": "S2",
        "metric_name": "area",
        "metric_category": "physical",
    }
    rows["metrics"] = [legacy, canonical]

    drop_redundant_legacy_metric_rows(rows, {"metric_identities": {}})

    assert [row["id"] for row in rows["metrics"]] == ["M_IMPL_OPTION_S2_AREA"]
