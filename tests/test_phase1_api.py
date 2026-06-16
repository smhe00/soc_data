from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient
from sqlalchemy import text

import backend.main as backend_app


def test_demo_seed_counts_and_quality(client: TestClient) -> None:
    components = client.get("/api/components").json()
    partitions = client.get("/api/physical-partitions").json()
    quality_issues = client.get("/api/quality/issues").json()
    dashboard = client.get("/api/dashboard").json()

    assert len(components) == 43
    assert len(partitions) == 144
    assert quality_issues == []
    assert dashboard["metrics"]["partition_count"] == 144
    assert dashboard["metrics"]["total_power"] == 45.3
    assert not [row for row in components if row["type"] == "parent_residual"]
    assert not [row for row in partitions if row["partition_type"] == "residual"]


def test_team_import_template_round_trip(client: TestClient) -> None:
    template = client.get("/api/import/template?team=AI%20Team")
    template.raise_for_status()

    upload = client.post(
        "/api/import/excel?team=AI%20Team",
        files={"file": ("ai_team.xlsx", BytesIO(template.content), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    upload.raise_for_status()

    imported = upload.json()["imported"]
    assert imported["logical_components"] == 4
    assert imported["physical_partitions"] == 19
    assert imported["metrics"] == 92


def test_component_detail_save_preserves_quality(client: TestClient) -> None:
    npu = next(row for row in client.get("/api/components?team=AI%20Team").json() if row["id"] == "B_NPU_TENSOR")
    response = client.put(
        "/api/components/B_NPU_TENSOR/detail",
        json={
            "impl_option_id": "S2",
            "team": "AI Team",
            "logical_instance_count": npu["logical_instance_count"],
            "partitions": [
                {
                    "id": partition["id"],
                    "tier_id": partition["tier_id"],
                    "partition_name": partition["partition_name"],
                    "partition_type": partition["partition_type"],
                    "resource_category": partition["resource_category"],
                    "physical_instance_count": partition["physical_instance_count"],
                    "content_share": partition["content_share"],
                    "description": partition["description"],
                }
                for partition in npu["partitions"]
            ],
        },
    )
    response.raise_for_status()

    payload = response.json()
    assert payload["component"]["id"] == "B_NPU_TENSOR"
    assert payload["quality_issues"] == []


def test_application_power_rollup_validation(client: TestClient) -> None:
    invalid_power = client.post(
        "/api/module-power-usecases",
        json={
            "project_id": "BAD_PROJECT",
            "impl_option_id": "S2",
            "physical_mapping_id": "PM_3DIC_A",
            "component_id": "B_CPU",
            "component_name": "CPU_CLUSTER",
            "use_case_name": "Default",
            "operating_point_set_id": "OP_DEFAULT",
            "power_value_w": 0.1,
        },
    )
    assert invalid_power.status_code == 400

    for component_id, component_name, power_w in [("B_CPU", "CPU_CLUSTER", 0.123), ("B0", "SOC_TOP", 0.2)]:
        response = client.post(
            "/api/module-power-usecases",
            json={
                "project_id": "P001",
                "impl_option_id": "S2",
                "physical_mapping_id": "PM_3DIC_A",
                "component_id": component_id,
                "component_name": component_name,
                "use_case_name": "Default",
                "operating_point_set_id": "OP_DEFAULT",
                "power_value_w": power_w,
            },
        )
        response.raise_for_status()

    scenario = client.post(
        "/api/application-scenarios",
        json={"project_id": "P001", "name": "Pytest Power Scenario", "category": "Validation", "description": ""},
    )
    scenario.raise_for_status()
    scenario_id = scenario.json()["id"]

    parent_child_conflict = client.put(
        "/api/application-scenario-composition",
        json={
            "project_id": "P001",
            "impl_option_id": "S2",
            "physical_mapping_id": "PM_3DIC_A",
            "application_scenario_id": scenario_id,
            "selections": [
                {"component_id": "B0", "component_name": "SOC_TOP", "use_case_name": "Default", "operating_point_set_id": "OP_DEFAULT", "included": True},
                {"component_id": "B_CPU", "component_name": "CPU_CLUSTER", "use_case_name": "Default", "operating_point_set_id": "OP_DEFAULT", "included": True},
            ],
        },
    )
    assert parent_child_conflict.status_code == 400

    unsplit = client.put(
        "/api/application-scenario-composition",
        json={
            "project_id": "P001",
            "impl_option_id": "S2",
            "physical_mapping_id": "PM_3DIC_A",
            "application_scenario_id": scenario_id,
            "selections": [
                {"component_id": "B0", "component_name": "SOC_TOP", "use_case_name": "Default", "operating_point_set_id": "OP_DEFAULT", "included": True},
                {"component_id": "B_CPU", "component_name": "CPU_CLUSTER", "use_case_name": "Default", "operating_point_set_id": "OP_DEFAULT", "included": False},
            ],
        },
    )
    unsplit.raise_for_status()

    summary = unsplit.json()["summary"]
    rollup = next(row for row in summary["hierarchy_rollups"] if row["parent_component_id"] == "B0")
    assert summary["total_additive_power_w"] == 0.2
    assert rollup["status"] == "unsplit"
    assert abs(rollup["unsplit_power_w"] - 0.077) < 0.0001


def test_power_dataset_model_and_legacy_alias(client: TestClient) -> None:
    datasets = client.get("/api/power-datasets?impl_option_id=S2")
    datasets.raise_for_status()
    power_dataset = next(row for row in datasets.json() if row["id"] == "PM_3DIC_A")

    assert power_dataset["dataset_type"] == "architecture_estimate"
    assert power_dataset["power_dataset_id"] == "PM_3DIC_A"
    assert power_dataset["physical_mapping_id"] == "PM_3DIC_A"
    assert power_dataset["development_stage"] == "architecture_estimate"
    assert power_dataset["dataset_version"] == "V02"
    assert power_dataset["mapping_version"] == "V02"

    legacy = client.get("/api/physical-mappings?impl_option_id=S2")
    legacy.raise_for_status()
    assert next(row for row in legacy.json() if row["id"] == "PM_3DIC_A")["dataset_type"] == "architecture_estimate"

    created = client.post(
        "/api/power-datasets",
        json={
            "project_id": "P001",
            "impl_option_id": "S2",
            "name": "PTPX Block Simulation Snapshot",
            "dataset_type": "simulation",
            "development_stage": "post_pnr_power",
            "source_type": "ptpx",
            "confidence": "review",
            "dataset_version": "V01",
            "related_physical_mapping_id": "PM_3DIC_A",
            "description": "Pytest PTPX snapshot.",
            "context_json": '{"tool": "ptpx"}',
        },
    )
    created.raise_for_status()
    new_dataset = created.json()

    assert new_dataset["id"].startswith("PD_S2_PTPX_BLOCK_SIMULATION_SNAPSHOT")
    assert new_dataset["power_dataset_id"] == new_dataset["id"]
    assert new_dataset["physical_mapping_id"] == new_dataset["id"]
    assert new_dataset["source_type"] == "ptpx"

    power = client.post(
        "/api/module-power-usecases",
        json={
            "project_id": "P001",
            "impl_option_id": "S2",
            "power_dataset_id": new_dataset["id"],
            "component_id": "B_CPU",
            "component_name": "CPU_CLUSTER",
            "use_case_name": "PTPX_Default",
            "operating_point_set_id": "OP_DEFAULT",
            "power_value_w": 0.456,
            "confidence": "review",
        },
    )
    power.raise_for_status()
    assert power.json()["power_dataset_id"] == new_dataset["id"]

    library = client.get(f"/api/module-power-usecases?impl_option_id=S2&power_dataset_id={new_dataset['id']}")
    library.raise_for_status()
    assert library.json()[0]["power_value_w"] == 0.456
    assert library.json()[0]["power_dataset_id"] == new_dataset["id"]


def test_power_dataset_id_alias_for_application_power(client: TestClient) -> None:
    summary = client.get(
        "/api/application-power-summary?impl_option_id=S2&power_dataset_id=PM_3DIC_A&application_scenario_id=AS_CAMERA_4K60"
    )
    summary.raise_for_status()
    assert summary.json()["filters"]["power_dataset_id"] == "PM_3DIC_A"
    assert summary.json()["total_additive_power_w"] == 5.295

    composition = client.get(
        "/api/application-scenario-composition?impl_option_id=S2&power_dataset_id=PM_3DIC_A&application_scenario_id=AS_CAMERA_4K60"
    )
    composition.raise_for_status()
    assert composition.json()[0]["power_dataset_id"] == "PM_3DIC_A"


def test_power_dataset_alias_conflict_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/module-power-usecases",
        json={
            "project_id": "P001",
            "impl_option_id": "S2",
            "power_dataset_id": "PM_3DIC_A",
            "physical_mapping_id": "PM_2D_BASE",
            "component_id": "B_CPU",
            "component_name": "CPU_CLUSTER",
            "use_case_name": "AliasConflict",
            "operating_point_set_id": "OP_DEFAULT",
            "power_value_w": 0.1,
        },
    )

    assert response.status_code == 400
    assert "Conflicting power dataset aliases" in response.json()["detail"]


def _save_npu_tensor_detail_with_logic_area(client: TestClient, logic_area: float) -> None:
    npu = next(row for row in client.get("/api/components?team=AI%20Team").json() if row["id"] == "B_NPU_TENSOR")
    response = client.put(
        "/api/components/B_NPU_TENSOR/detail",
        json={
            "impl_option_id": "S2",
            "team": "AI Team",
            "logical_instance_count": npu["logical_instance_count"],
            "logic_area": logic_area,
            "partitions": [
                {
                    "id": partition["id"],
                    "tier_id": partition["tier_id"],
                    "partition_name": partition["partition_name"],
                    "partition_type": partition["partition_type"],
                    "resource_category": partition["resource_category"],
                    "physical_instance_count": partition["physical_instance_count"],
                    "content_share": partition["content_share"],
                    "description": partition["description"],
                }
                for partition in npu["partitions"]
            ],
        },
    )
    response.raise_for_status()


def test_metric_provenance_defaults_and_auto_derived_protection(client: TestClient) -> None:
    metrics = client.get("/api/metrics?impl_option_id=S2")
    metrics.raise_for_status()
    partition_metric = next(row for row in metrics.json() if row["id"] == "M_PART_PP_NPU_TOP_logic_T0_P1_LOGIC_AREA")
    logical_metric = next(row for row in metrics.json() if row["id"] == "M_LOG_B_NPU_TENSOR_LOGIC_AREA")

    assert partition_metric["source_type"] == "architecture_estimate"
    assert partition_metric["derivation"] == "derived_from_logical_area"
    assert logical_metric["source_type"] == "architecture_estimate"
    assert logical_metric["derivation"] == "manual"

    protected_metric_id = "M_PART_PP_NPU_TOP_logic_T0_P1_LOGIC_AREA"
    with backend_app.engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE metric "
                "SET metric_value='999.0', confidence='approved', source_type='tool_extracted', derivation='ptpx_report' "
                "WHERE id=:id"
            ),
            {"id": protected_metric_id},
        )

    npu = next(row for row in client.get("/api/components?team=AI%20Team").json() if row["id"] == "B_NPU_TENSOR")
    response = client.put(
        "/api/components/B_NPU_TENSOR/detail",
        json={
            "impl_option_id": "S2",
            "team": "AI Team",
            "logical_instance_count": npu["logical_instance_count"],
            "logic_area": 12.0,
            "partitions": [
                {
                    "id": partition["id"],
                    "tier_id": partition["tier_id"],
                    "partition_name": partition["partition_name"],
                    "partition_type": partition["partition_type"],
                    "resource_category": partition["resource_category"],
                    "physical_instance_count": partition["physical_instance_count"],
                    "content_share": partition["content_share"],
                    "description": partition["description"],
                }
                for partition in npu["partitions"]
            ],
        },
    )
    response.raise_for_status()

    with backend_app.engine.begin() as connection:
        row = connection.execute(
            text("SELECT metric_value, confidence, source_type, derivation FROM metric WHERE id=:id"),
            {"id": protected_metric_id},
        ).mappings().one()

    assert dict(row) == {
        "metric_value": "999.0",
        "confidence": "approved",
        "source_type": "tool_extracted",
        "derivation": "ptpx_report",
    }


def test_component_area_uses_default_corner_workload_metric(client: TestClient) -> None:
    before = next(row for row in client.get("/api/components?impl_option_id=S2").json() if row["id"] == "B_NPU_TENSOR")
    assert before["logic_area"] != 999.0

    with backend_app.engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO metric "
                "(id, impl_option_id, subject_type, subject_id, metric_name, metric_value, metric_unit, metric_category, value_type, corner, workload, confidence, source_type, derivation, source_note, created_at) "
                "VALUES "
                "('M_LOG_B_NPU_TENSOR_LOGIC_AREA_STRESS', 'S2', 'logical_component', 'B_NPU_TENSOR', 'logic_area', '999.0', 'mm2', 'logical_area', 'number', 'slow', 'stress', 'review', 'simulation', 'manual', 'non-default corner workload', '2026-06-16')"
            )
        )

    after = next(row for row in client.get("/api/components?impl_option_id=S2").json() if row["id"] == "B_NPU_TENSOR")
    assert after["logic_area"] == before["logic_area"]
    assert after["logic_area"] != 999.0


def test_auto_derived_metric_skips_protected_same_identity_with_custom_id(client: TestClient) -> None:
    canonical_id = "M_PART_PP_NPU_TOP_logic_T0_P1_LOGIC_AREA"
    custom_id = "M_TOOL_PP_NPU_TOP_logic_T0_P1_LOGIC_AREA"
    with backend_app.engine.begin() as connection:
        connection.execute(text("DELETE FROM metric WHERE id=:id"), {"id": canonical_id})
        connection.execute(
            text(
                "INSERT INTO metric "
                "(id, impl_option_id, subject_type, subject_id, metric_name, metric_value, metric_unit, metric_category, value_type, corner, workload, confidence, source_type, derivation, source_note, created_at) "
                "VALUES "
                "(:id, 'S2', 'physical_partition', 'PP_NPU_TOP_logic_T0_P1', 'logic_area', '999.0', 'mm2', 'implementation_area', 'number', 'typical', 'nominal', 'approved', 'tool_extracted', 'ptpx_report', 'protected tool value', '2026-06-15')"
            ),
            {"id": custom_id},
        )

    _save_npu_tensor_detail_with_logic_area(client, 12.0)

    with backend_app.engine.begin() as connection:
        rows = connection.execute(
            text(
                "SELECT id, metric_value, confidence, source_type, derivation FROM metric "
                "WHERE impl_option_id='S2' AND subject_type='physical_partition' AND subject_id='PP_NPU_TOP_logic_T0_P1' "
                "AND metric_name='logic_area' AND corner='typical' AND workload='nominal' ORDER BY id"
            )
        ).mappings().all()

    assert [row["id"] for row in rows] == [custom_id]
    assert dict(rows[0]) == {
        "id": custom_id,
        "metric_value": "999.0",
        "confidence": "approved",
        "source_type": "tool_extracted",
        "derivation": "ptpx_report",
    }


def test_auto_derived_metric_updates_unprotected_same_identity_with_custom_id(client: TestClient) -> None:
    canonical_id = "M_PART_PP_NPU_TOP_logic_T0_P1_LOGIC_AREA"
    custom_id = "M_USER_PP_NPU_TOP_logic_T0_P1_LOGIC_AREA"
    with backend_app.engine.begin() as connection:
        connection.execute(text("DELETE FROM metric WHERE id=:id"), {"id": canonical_id})
        connection.execute(
            text(
                "INSERT INTO metric "
                "(id, impl_option_id, subject_type, subject_id, metric_name, metric_value, metric_unit, metric_category, value_type, corner, workload, confidence, source_type, derivation, source_note, created_at) "
                "VALUES "
                "(:id, 'S2', 'physical_partition', 'PP_NPU_TOP_logic_T0_P1', 'logic_area', '111.0', 'mm2', 'implementation_area', 'number', 'typical', 'nominal', 'review', 'architecture_estimate', 'manual', 'unprotected user value', '2026-06-15')"
            ),
            {"id": custom_id},
        )

    _save_npu_tensor_detail_with_logic_area(client, 12.0)

    with backend_app.engine.begin() as connection:
        rows = connection.execute(
            text(
                "SELECT id, metric_value, confidence, source_type, derivation FROM metric "
                "WHERE impl_option_id='S2' AND subject_type='physical_partition' AND subject_id='PP_NPU_TOP_logic_T0_P1' "
                "AND metric_name='logic_area' AND corner='typical' AND workload='nominal' ORDER BY id"
            )
        ).mappings().all()

    assert [row["id"] for row in rows] == [custom_id]
    assert rows[0]["metric_value"] != "111.0"
    assert rows[0]["confidence"] == "review"
    assert rows[0]["source_type"] == "architecture_estimate"
    assert rows[0]["derivation"] == "derived_from_logical_area"


def test_camera_power_summary_seed(client: TestClient) -> None:
    summary = client.get(
        "/api/application-power-summary?impl_option_id=S2&physical_mapping_id=PM_3DIC_A&application_scenario_id=AS_CAMERA_4K60"
    )
    summary.raise_for_status()

    payload = summary.json()
    assert payload["total_additive_power_w"] == 5.295
    assert payload["selected_count"] == 10
    assert payload["missing_count"] == 0
