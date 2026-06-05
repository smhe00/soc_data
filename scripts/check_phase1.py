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
            "/api/scenarios",
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
        npu = next(row for row in ai_components if row["id"] == "B_NPU_TENSOR")
        detail_update = client.put(
            "/api/components/B_NPU_TENSOR/detail",
            json={
                "scenario_id": "S2",
                "team": "AI Team",
                "logical_instance_count": npu["logical_instance_count"],
                "partitions": [
                    {
                        "id": partition["id"],
                        "tier_id": partition["tier_id"],
                        "partition_name": partition["partition_name"],
                        "partition_type": partition["partition_type"],
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

        assert len(components) == 36, f"expected 36 components, got {len(components)}"
        assert len(partitions) == 35, f"expected 35 physical partitions, got {len(partitions)}"
        assert not [row for row in components if row["type"] == "parent_residual"], "logical residual should be computed, not stored as component rows"
        assert not [row for row in partitions if row["partition_type"] == "residual"], "physical partition type residual should not be used"
        assert dashboard["metrics"]["partition_count"] == 35
        assert quality_issues == [], f"expected no quality issues, got {quality_issues}"
        assert "AI Team" in teams, f"expected AI Team in responsibility teams, got {teams}"
        assert {row["id"] for row in ai_components} == {"B_NPU", "B_NPU_TENSOR", "B_NPU_SRAM", "B_NPU_DMA"}
        assert len(ai_partitions) == 5, f"expected 5 AI partitions, got {len(ai_partitions)}"
        assert ai_quality_issues == [], f"expected no AI quality issues, got {ai_quality_issues}"
        assert detail_result["component"]["id"] == "B_NPU_TENSOR"
        assert detail_result["quality_issues"] == []
        assert team_import_result["imported"]["logical_components"] == 4
        assert team_import_result["imported"]["physical_partitions"] == 5
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
