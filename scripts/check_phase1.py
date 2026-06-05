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
        ]
        for endpoint in endpoints:
            response = client.get(endpoint)
            response.raise_for_status()

        components = client.get("/api/components").json()
        partitions = client.get("/api/physical-partitions").json()
        dashboard = client.get("/api/dashboard").json()
        quality_issues = client.get("/api/quality/issues").json()

        assert len(components) == 36, f"expected 36 components, got {len(components)}"
        assert len(partitions) == 35, f"expected 35 physical partitions, got {len(partitions)}"
        assert dashboard["metrics"]["partition_count"] == 35
        assert quality_issues == [], f"expected no quality issues, got {quality_issues}"

        print(
            {
                "components": len(components),
                "physical_partitions": len(partitions),
                "dashboard_metrics": dashboard["metrics"],
                "quality_issues": len(quality_issues),
            }
        )


if __name__ == "__main__":
    main()
