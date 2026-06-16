from __future__ import annotations


def make_quality_issue(
    severity: str,
    title: str,
    detail: str,
    action: str,
    entity_type: str,
    entity_id: str,
) -> dict[str, str]:
    return {
        "id": f"{entity_type}:{entity_id}:{title}".replace(" ", "_").lower(),
        "severity": severity,
        "title": title,
        "detail": detail,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
    }
