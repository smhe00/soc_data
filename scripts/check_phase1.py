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
            }
        )


if __name__ == "__main__":
    main()
