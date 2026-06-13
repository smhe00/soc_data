from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient


def test_demo_seed_counts_and_quality(client: TestClient) -> None:
    components = client.get("/api/components").json()
    partitions = client.get("/api/physical-partitions").json()
    quality_issues = client.get("/api/quality/issues").json()
    dashboard = client.get("/api/dashboard").json()

    assert len(components) == 43
    assert len(partitions) == 144
    assert quality_issues == []
    assert dashboard["metrics"]["partition_count"] == 144
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


def test_camera_power_summary_seed(client: TestClient) -> None:
    summary = client.get(
        "/api/application-power-summary?impl_option_id=S2&physical_mapping_id=PM_3DIC_A&application_scenario_id=AS_CAMERA_4K60"
    )
    summary.raise_for_status()

    payload = summary.json()
    assert payload["total_additive_power_w"] == 5.295
    assert payload["selected_count"] == 10
    assert payload["missing_count"] == 0
