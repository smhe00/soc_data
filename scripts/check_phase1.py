from __future__ import annotations

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

        assert len(components) == 36, f"expected 36 components, got {len(components)}"
        assert len(partitions) == 35, f"expected 35 physical partitions, got {len(partitions)}"
        assert dashboard["metrics"]["partition_count"] == 35
        assert quality_issues == [], f"expected no quality issues, got {quality_issues}"
        assert "AI Team" in teams, f"expected AI Team in responsibility teams, got {teams}"
        assert {row["id"] for row in ai_components} == {"B_NPU", "B_NPU_TENSOR", "B_NPU_SRAM", "B_NPU_DMA"}
        assert len(ai_partitions) == 5, f"expected 5 AI partitions, got {len(ai_partitions)}"
        assert ai_quality_issues == [], f"expected no AI quality issues, got {ai_quality_issues}"

        print(
            {
                "components": len(components),
                "physical_partitions": len(partitions),
                "dashboard_metrics": dashboard["metrics"],
                "quality_issues": len(quality_issues),
                "teams": len(teams),
                "ai_components": len(ai_components),
                "ai_physical_partitions": len(ai_partitions),
            }
        )


if __name__ == "__main__":
    main()
