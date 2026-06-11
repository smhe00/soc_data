from __future__ import annotations

from io import BytesIO
from pathlib import Path
import sys

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.main import app


def main() -> None:
    with TestClient(app) as client:
        endpoints = [
            "/api/projects",
            "/api/impl-options",
            "/api/module-definitions",
            "/api/components",
            "/api/components/tree",
            "/api/physical-partitions",
            "/api/tiers",
            "/api/metrics",
            "/api/dashboard",
            "/api/quality/issues",
            "/api/responsibilities/teams",
            "/api/import/template?team=AI%20Team",
        ]
        for endpoint in endpoints:
            response = client.get(endpoint)
            response.raise_for_status()

        components = client.get("/api/components").json()
        partitions = client.get("/api/physical-partitions").json()
        dashboard = client.get("/api/dashboard").json()
        quality_issues = client.get("/api/quality/issues").json()
        teams = client.get("/api/responsibilities/teams").json()
        ai_components = client.get("/api/components?team=AI%20Team").json()
        ai_partitions = client.get("/api/physical-partitions?team=AI%20Team").json()
        ai_quality_issues = client.get("/api/quality/issues?team=AI%20Team").json()
        soc_top = next(row for row in components if row["id"] == "B0")
        npu_top = next(row for row in ai_components if row["id"] == "B_NPU")
        npu = next(row for row in ai_components if row["id"] == "B_NPU_TENSOR")
        detail_update = client.put(
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
        detail_update.raise_for_status()
        detail_result = detail_update.json()
        team_template = client.get("/api/import/template?team=AI%20Team")
        team_template.raise_for_status()
        team_import = client.post(
            "/api/import/excel?team=AI%20Team",
            files={"file": ("ai_team.xlsx", BytesIO(team_template.content), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        team_import.raise_for_status()
        team_import_result = team_import.json()
        power_library = client.get("/api/module-power-usecases?impl_option_id=S2&physical_mapping_id=PM_3DIC_A")
        power_library.raise_for_status()
        power_library_rows = power_library.json()
        operating_point_sets = client.get("/api/operating-point-sets")
        operating_point_sets.raise_for_status()
        operating_point_rows = operating_point_sets.json()
        camera_composition = client.get(
            "/api/application-scenario-composition?impl_option_id=S2&physical_mapping_id=PM_3DIC_A&application_scenario_id=AS_CAMERA_4K60"
        )
        camera_composition.raise_for_status()
        camera_summary = client.get(
            "/api/application-power-summary?impl_option_id=S2&physical_mapping_id=PM_3DIC_A&application_scenario_id=AS_CAMERA_4K60"
        )
        camera_summary.raise_for_status()
        camera_summary_result = camera_summary.json()
        invalid_power = client.post(
            "/api/module-power-usecases",
            json={
                "project_id": "BAD_PROJECT",
                "impl_option_id": "S2",
                "physical_mapping_id": "PM_3DIC_A",
                "component_id": "B_CPU",
                "component_name": "CPU_CLUSTER",
                "use_case_name": "Default",
                "operating_point_set_id": "OP_CAMERA_PERF",
                "power_value_w": 0.1,
            },
        )
        valid_default_power = client.post(
            "/api/module-power-usecases",
            json={
                "project_id": "P001",
                "impl_option_id": "S2",
                "physical_mapping_id": "PM_3DIC_A",
                "component_id": "B_CPU",
                "component_name": "CPU_CLUSTER",
                "use_case_name": "Default",
                "operating_point_set_id": "OP_DEFAULT",
                "power_value_w": 0.123,
            },
        )
        valid_default_power.raise_for_status()
        low_parent_power = client.post(
            "/api/module-power-usecases",
            json={
                "project_id": "P001",
                "impl_option_id": "S2",
                "physical_mapping_id": "PM_3DIC_A",
                "component_id": "B0",
                "component_name": "SOC_TOP",
                "use_case_name": "Default",
                "operating_point_set_id": "OP_DEFAULT",
                "power_value_w": 0.1,
            },
        )
        low_parent_power.raise_for_status()
        created_application_scenario = client.post(
            "/api/application-scenarios",
            json={
                "project_id": "P001",
                "name": "Smoke Test Scenario",
                "category": "Validation",
                "description": "Created by phase 1 smoke test.",
            },
        )
        created_application_scenario.raise_for_status()
        created_application_scenario_id = created_application_scenario.json()["id"]
        updated_application_scenario = client.put(
            f"/api/application-scenarios/{created_application_scenario_id}",
            json={
                "project_id": "P001",
                "name": "Smoke Test Scenario Updated",
                "category": "Validation",
                "description": "Updated by phase 1 smoke test.",
            },
        )
        updated_application_scenario.raise_for_status()
        parent_child_conflict = client.put(
            "/api/application-scenario-composition",
            json={
                "project_id": "P001",
                "impl_option_id": "S2",
                "physical_mapping_id": "PM_3DIC_A",
                "application_scenario_id": created_application_scenario_id,
                "selections": [
                    {
                        "component_id": "B0",
                        "component_name": "SOC_TOP",
                        "use_case_name": "Default",
                        "operating_point_set_id": "OP_DEFAULT",
                        "included": True,
                    },
                    {
                        "component_id": "B_CPU",
                        "component_name": "CPU_CLUSTER",
                        "use_case_name": "Default",
                        "operating_point_set_id": "OP_DEFAULT",
                        "included": True,
                    },
                ],
            },
        )
        negative_residual = client.put(
            "/api/application-scenario-composition",
            json={
                "project_id": "P001",
                "impl_option_id": "S2",
                "physical_mapping_id": "PM_3DIC_A",
                "application_scenario_id": created_application_scenario_id,
                "selections": [
                    {
                        "component_id": "B0",
                        "component_name": "SOC_TOP",
                        "use_case_name": "Default",
                        "operating_point_set_id": "OP_DEFAULT",
                        "included": True,
                    },
                    {
                        "component_id": "B_CPU",
                        "component_name": "CPU_CLUSTER",
                        "use_case_name": "Default",
                        "operating_point_set_id": "OP_DEFAULT",
                        "included": False,
                    },
                ],
            },
        )
        high_parent_power = client.post(
            "/api/module-power-usecases",
            json={
                "project_id": "P001",
                "impl_option_id": "S2",
                "physical_mapping_id": "PM_3DIC_A",
                "component_id": "B0",
                "component_name": "SOC_TOP",
                "use_case_name": "Default",
                "operating_point_set_id": "OP_DEFAULT",
                "power_value_w": 0.2,
            },
        )
        high_parent_power.raise_for_status()
        residual_composition = client.put(
            "/api/application-scenario-composition",
            json={
                "project_id": "P001",
                "impl_option_id": "S2",
                "physical_mapping_id": "PM_3DIC_A",
                "application_scenario_id": created_application_scenario_id,
                "selections": [
                    {
                        "component_id": "B0",
                        "component_name": "SOC_TOP",
                        "use_case_name": "Default",
                        "operating_point_set_id": "OP_DEFAULT",
                        "included": True,
                    },
                    {
                        "component_id": "B_CPU",
                        "component_name": "CPU_CLUSTER",
                        "use_case_name": "Default",
                        "operating_point_set_id": "OP_DEFAULT",
                        "included": False,
                    },
                ],
            },
        )
        residual_composition.raise_for_status()
        smoke_composition = client.put(
            "/api/application-scenario-composition",
            json={
                "project_id": "P001",
                "impl_option_id": "S2",
                "physical_mapping_id": "PM_3DIC_A",
                "application_scenario_id": created_application_scenario_id,
                "selections": [
                    {
                        "component_id": "B_CPU",
                        "component_name": "CPU_CLUSTER",
                        "use_case_name": "Default",
                        "operating_point_set_id": "OP_DEFAULT",
                        "included": True,
                    }
                ],
            },
        )
        smoke_composition.raise_for_status()
        deleted_application_scenario = client.delete(f"/api/application-scenarios/{created_application_scenario_id}")
        deleted_application_scenario.raise_for_status()
        application_scenarios_after_delete = client.get("/api/application-scenarios")
        application_scenarios_after_delete.raise_for_status()
        valid_new_profile_power = client.post(
            "/api/module-power-usecases",
            json={
                "project_id": "P001",
                "impl_option_id": "S2",
                "physical_mapping_id": "PM_3DIC_A",
                "component_id": "B_CPU",
                "component_name": "CPU_CLUSTER",
                "use_case_name": "Idle",
                "operating_point_set_id": "OP_CPU_ECO",
                "operating_point_set_name": "CPU Eco",
                "power_value_w": 0.045,
            },
        )
        valid_new_profile_power.raise_for_status()
        new_profile_power_id = valid_new_profile_power.json()["id"]
        operating_point_rows_after_new_profile = client.get("/api/operating-point-sets").json()
        deleted_new_profile_power = client.delete(f"/api/module-power-usecases/{new_profile_power_id}")
        deleted_new_profile_power.raise_for_status()
        power_library_after_delete = client.get("/api/module-power-usecases?impl_option_id=S2&physical_mapping_id=PM_3DIC_A")
        power_library_after_delete.raise_for_status()
        default_composition = client.put(
            "/api/application-scenario-composition",
            json={
                "project_id": "P001",
                "impl_option_id": "S2",
                "physical_mapping_id": "PM_3DIC_A",
                "application_scenario_id": "AS_CAMERA_4K60",
                "selections": [
                    {
                        "component_id": "B_CPU",
                        "component_name": "CPU_CLUSTER",
                        "use_case_name": "Default",
                        "operating_point_set_id": "OP_DEFAULT",
                        "included": True,
                    }
                ],
            },
        )
        default_composition.raise_for_status()
        default_composition_result = default_composition.json()

        assert len(components) == 43, f"expected 43 components, got {len(components)}"
        assert len(partitions) == 144, f"expected 144 physical partitions, got {len(partitions)}"
        assert not [row for row in components if row["type"] == "parent_residual"], "logical residual should be computed, not stored as component rows"
        assert not [row for row in partitions if row["partition_type"] == "residual"], "physical partition type residual should not be used"
        assert dashboard["metrics"]["partition_count"] == 144
        assert quality_issues == [], f"expected no quality issues, got {quality_issues}"
        assert "AI Team" in teams, f"expected AI Team in responsibility teams, got {teams}"
        assert {row["id"] for row in ai_components} == {"B_NPU", "B_NPU_TENSOR", "B_NPU_SRAM", "B_NPU_DMA"}
        assert len(ai_partitions) == 19, f"expected 19 AI partitions, got {len(ai_partitions)}"
        assert ai_quality_issues == [], f"expected no AI quality issues, got {ai_quality_issues}"
        for component in components:
            self_area = {
                "logic": component["residual_logic_area"] if component["has_children"] else component["logic_area"],
                "sram": component["residual_sram_area"] if component["has_children"] else component["sram_area"],
                "block": component["residual_block_area"] if component["has_children"] else component["block_area"],
            }
            for category, area in self_area.items():
                category_partitions = [partition for partition in component["partitions"] if partition["resource_category"] == category]
                assert area > 0.001 or not category_partitions, f"{component['id']} should not map zero-area {category}"
            subtree_area = {
                "logic": sum(row["base_logic_area"] for row in component["tier_area_distribution"]),
                "sram": sum(row["base_sram_area"] for row in component["tier_area_distribution"]),
                "block": sum(row["base_block_area"] for row in component["tier_area_distribution"]),
            }
            assert abs(component["logic_area"] - subtree_area["logic"]) < 0.01, f"{component['id']} recursive logic mapping is not closed"
            assert abs(component["sram_area"] - subtree_area["sram"]) < 0.01, f"{component['id']} recursive SRAM mapping is not closed"
            assert abs(component["block_area"] - subtree_area["block"]) < 0.01, f"{component['id']} recursive block mapping is not closed"
        soc_top_base_area = soc_top["logic_area"] + soc_top["sram_area"] + soc_top["block_area"]
        soc_top_mapped_area = sum(row["base_total_area"] for row in soc_top["tier_area_distribution"])
        assert abs(soc_top_base_area - soc_top_mapped_area) < 0.01, f"expected SoC top base area closed, got {soc_top_base_area} vs {soc_top_mapped_area}"
        assert npu_top["tier_area_distribution"], "expected subtree tier area distribution for B_NPU"
        assert sum(row["total_area"] for row in npu_top["tier_area_distribution"]) > 0, "expected scaled tier area roll-up"
        assert detail_result["component"]["id"] == "B_NPU_TENSOR"
        assert detail_result["quality_issues"] == []
        assert team_import_result["imported"]["logical_components"] == 4
        assert team_import_result["imported"]["physical_partitions"] == 19
        assert team_import_result["imported"]["metrics"] > 0
        assert len(power_library_rows) == 8, f"expected 8 module power use cases for S2/PM_3DIC_A, got {len(power_library_rows)}"
        assert "OP_DEFAULT" in {row["id"] for row in operating_point_rows}, "Default Profile should be seeded"
        assert valid_new_profile_power.json()["operating_point_set_name"] == "CPU Eco"
        assert "OP_CPU_ECO" in {row["id"] for row in operating_point_rows_after_new_profile}, "new module Profile should be created on valid save"
        assert deleted_new_profile_power.json()["deleted_id"] == new_profile_power_id
        assert new_profile_power_id not in {row["id"] for row in power_library_after_delete.json()}, "deleted module power use case should leave the module library"
        assert len(camera_composition.json()) == 6, f"expected 6 selected module use cases in Camera 4K60"
        assert camera_summary_result["total_additive_power_w"] == 6.4
        assert camera_summary_result["selected_count"] == 6
        assert camera_summary_result["missing_count"] == 0
        assert invalid_power.status_code == 400, "invalid power context should be rejected"
        assert updated_application_scenario.json()["name"] == "Smoke Test Scenario Updated"
        assert parent_child_conflict.status_code == 400, "active parent/child selections should be rejected"
        assert negative_residual.status_code == 400, "active parent with child sum greater than parent should be rejected"
        residual_result = residual_composition.json()["summary"]
        residual_rollup = next(row for row in residual_result["hierarchy_rollups"] if row["parent_component_id"] == "B0")
        assert residual_result["total_additive_power_w"] == 0.2
        assert residual_rollup["status"] == "residual"
        assert abs(residual_rollup["residual_power_w"] - 0.077) < 0.0001
        assert smoke_composition.json()["summary"]["total_additive_power_w"] == 0.123
        assert deleted_application_scenario.json()["deleted_selection_count"] == 1
        assert created_application_scenario_id not in {row["id"] for row in application_scenarios_after_delete.json()}, "deleted application scenario should disappear from list"
        assert default_composition_result["summary"]["total_additive_power_w"] == 0.123

        print(
            {
                "components": len(components),
                "physical_partitions": len(partitions),
                "dashboard_metrics": dashboard["metrics"],
                "quality_issues": len(quality_issues),
                "teams": len(teams),
                "ai_components": len(ai_components),
                "ai_physical_partitions": len(ai_partitions),
                "component_detail_save": detail_result["component"]["id"],
                "ai_team_imported": team_import_result["imported"],
                "camera_power_w": camera_summary_result["total_additive_power_w"],
            }
        )


if __name__ == "__main__":
    main()
