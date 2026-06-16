from __future__ import annotations

from backend.models import PhysicalPartition


ALLOWED_PARTITION_TYPES = {"full", "partial"}
ALLOWED_PARTITION_RESOURCE_CATEGORIES = {"logic", "sram", "block"}


def normalized_content_share(partition_type: str, value: float | None) -> float:
    if partition_type == "full":
        return 1.0
    return float(value if value is not None else 1.0)


def normalized_resource_category(value: str | None) -> str:
    return value if value in ALLOWED_PARTITION_RESOURCE_CATEGORIES else "block"


def partition_equivalent_instances(partition: PhysicalPartition) -> float:
    return partition.physical_instance_count * normalized_content_share(partition.partition_type, partition.content_share)


def canonical_partition_name(component_name: str, category: str, tier_id: str, partition_type: str, partial_index: int = 0) -> str:
    base_name = f"{component_name}_{category}_{tier_id}"
    return f"{base_name}_P{partial_index}" if partition_type == "partial" else base_name
