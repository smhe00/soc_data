from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
from tempfile import SpooledTemporaryFile
from tempfile import NamedTemporaryFile
from typing import Any

from sqlalchemy import delete, text
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from pydantic import BaseModel
from sqlmodel import Field, Session, SQLModel, create_engine, select


BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = f"sqlite:///{BASE_DIR / 'soc_3dic.db'}"
TEMPLATE_PATH = BASE_DIR.parent / "templates" / "soc_mapping_metrics_review_v7.xlsx"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def now_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


class Project(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    product_family: str
    generation: str
    owner: str
    phase: str
    description: str = ""
    created_at: str
    updated_at: str


class Scenario(SQLModel, table=True):
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    name: str
    scenario_type: str
    process_combo: str
    description: str = ""
    status: str
    created_at: str
    updated_at: str


class ModuleDefinition(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    module_type: str
    ip_owner: str
    reuse_class: str
    description: str = ""


class LogicalComponent(SQLModel, table=True):
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    parent_id: str | None = Field(default=None, foreign_key="logicalcomponent.id")
    module_definition_id: str | None = Field(default=None, foreign_key="moduledefinition.id")
    name: str
    instance_type: str
    resource_type: str
    function_domain: str
    hierarchy_path: str
    logical_instance_count: int = 1
    owner_team: str = "Architecture Team"
    visibility_level: str = "team"
    description: str = ""
    created_at: str
    updated_at: str


class ProcessNode(SQLModel, table=True):
    id: str = Field(primary_key=True)
    foundry: str
    node_name: str
    logic_density_mtr_per_mm2: float
    sram_density_mb_per_mm2: float
    voltage_nominal: float
    cost_factor: float
    maturity_level: str
    description: str = ""


class Tier(SQLModel, table=True):
    id: str = Field(primary_key=True)
    scenario_id: str = Field(foreign_key="scenario.id")
    tier_index: int
    name: str
    process_id: str = Field(foreign_key="processnode.id")
    role: str
    orientation: str
    thickness_um: float = 0
    area_limit_mm2: float
    description: str = ""


class PhysicalPartition(SQLModel, table=True):
    id: str = Field(primary_key=True)
    scenario_id: str = Field(foreign_key="scenario.id")
    logical_component_id: str = Field(foreign_key="logicalcomponent.id")
    tier_id: str = Field(foreign_key="tier.id")
    partition_name: str
    partition_type: str
    physical_instance_count: int = 1
    partition_ratio: float = 1
    content_share: float = 1
    description: str = ""


class Metric(SQLModel, table=True):
    id: str = Field(primary_key=True)
    scenario_id: str = Field(foreign_key="scenario.id")
    subject_type: str
    subject_id: str
    metric_name: str
    metric_value: str
    metric_unit: str = ""
    metric_category: str = ""
    value_type: str = "number"
    corner: str = "typical"
    workload: str = "nominal"
    confidence: str = "draft"
    source_note: str = ""
    created_at: str


class ResponsibilityAssignment(SQLModel, table=True):
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    scenario_id: str = Field(foreign_key="scenario.id")
    user_id: str
    team_name: str
    logical_component_id: str = Field(foreign_key="logicalcomponent.id")
    scope_type: str = "subtree"
    can_read: bool = True
    can_write: bool = True


class PartitionInput(BaseModel):
    id: str
    tier_id: str
    partition_name: str
    partition_type: str
    physical_instance_count: int
    content_share: float | None = None
    partition_ratio: float | None = None
    description: str = ""


class ComponentDetailUpdate(BaseModel):
    scenario_id: str = "S2"
    team: str | None = None
    logical_instance_count: int
    partitions: list[PartitionInput]


app = FastAPI(title="SoC Cross-Die Database API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def ensure_sqlite_schema_compatibility() -> None:
    with engine.begin() as connection:
        rows = connection.execute(text("PRAGMA table_info(logicalcomponent)")).fetchall()
        columns = {row[1] for row in rows}
        if "owner_team" not in columns:
            connection.execute(text("ALTER TABLE logicalcomponent ADD COLUMN owner_team VARCHAR DEFAULT 'Architecture Team'"))
        if "visibility_level" not in columns:
            connection.execute(text("ALTER TABLE logicalcomponent ADD COLUMN visibility_level VARCHAR DEFAULT 'team'"))
        partition_rows = connection.execute(text("PRAGMA table_info(physicalpartition)")).fetchall()
        partition_columns = {row[1] for row in partition_rows}
        if "content_share" not in partition_columns:
            connection.execute(text("ALTER TABLE physicalpartition ADD COLUMN content_share FLOAT DEFAULT 1"))
            connection.execute(
                text(
                    "UPDATE physicalpartition "
                    "SET content_share = CASE WHEN partition_type = 'full' THEN 1 ELSE partition_ratio END"
                )
            )
        connection.execute(text("UPDATE physicalpartition SET partition_type = 'partial' WHERE partition_type = 'residual'"))
        connection.execute(
            text(
                "UPDATE physicalpartition "
                "SET logical_component_id = ("
                "SELECT parent_id FROM logicalcomponent WHERE logicalcomponent.id = physicalpartition.logical_component_id"
                ") "
                "WHERE logical_component_id IN ("
                "SELECT id FROM logicalcomponent WHERE instance_type = 'parent_residual' AND parent_id IS NOT NULL"
                ")"
            )
        )
        connection.execute(
            text(
                "DELETE FROM metric "
                "WHERE subject_type = 'logical_component' "
                "AND subject_id IN (SELECT id FROM logicalcomponent WHERE instance_type = 'parent_residual')"
            )
        )
        connection.execute(text("DELETE FROM logicalcomponent WHERE instance_type = 'parent_residual'"))


def number_or_zero(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def metric_id(row: dict[str, Any]) -> str:
    return (
        f"{row['scenario_id']}-{row['subject_type']}-{row['subject_id']}-"
        f"{row['metric_name']}-{row['corner']}-{row['workload']}"
    )


def seed_data() -> None:
    created = now_iso()
    with Session(engine) as session:
        demo_scenarios = ["S1", "S2", "S3"]
        session.exec(delete(Metric).where(Metric.scenario_id.in_(demo_scenarios)))
        session.exec(delete(PhysicalPartition).where(PhysicalPartition.scenario_id.in_(demo_scenarios)))
        session.exec(delete(Tier).where(Tier.scenario_id.in_(demo_scenarios)))
        session.exec(delete(ResponsibilityAssignment).where(ResponsibilityAssignment.project_id == "P001"))
        session.exec(delete(LogicalComponent).where(LogicalComponent.project_id == "P001"))
        session.exec(delete(ModuleDefinition).where(ModuleDefinition.id.like("MD_%")))
        session.exec(delete(Scenario).where(Scenario.id.in_(demo_scenarios)))
        session.exec(delete(Project).where(Project.id.in_(["P001", "P002"])))

        projects = [
            Project(
                id="P001",
                name="Orion X1 Mobile SoC",
                product_family="Premium Smartphone SoC",
                generation="2027-A",
                owner="Mobile Architecture Team",
                phase="Architecture Planning",
                description="Realistic phase-1 demo for a flagship application processor with CPU/GPU/NPU/ISP/video/display/memory/IO/security domains.",
                created_at=created,
                updated_at=created,
            )
        ]
        scenarios = [
            Scenario(id="S1", project_id="P001", name="Monolithic N3E Baseline", scenario_type="1 die", process_combo="N3E monolithic", description="Single large advanced-node die used as a planning baseline.", status="Medium", created_at=created, updated_at=created),
            Scenario(id="S2", project_id="P001", name="3DIC Performance Option", scenario_type="3 tiers W2W", process_combo="N3E logic + N5 SRAM/cache + N6 IO/analog", description="Compute logic on top tier, SRAM/cache and medium logic on middle tier, IO/PHY/always-on/analog on bottom tier.", status="High", created_at=created, updated_at=created),
            Scenario(id="S3", project_id="P001", name="Cost-Optimized 2.5D Option", scenario_type="2 dies on interposer", process_combo="N4P application die + N6 IO/cache die", description="Lower-risk split with a main application die and a companion cache/IO die.", status="Medium", created_at=created, updated_at=created),
        ]
        process_nodes = [
            ProcessNode(id="PN3E", foundry="TSMC", node_name="N3E", logic_density_mtr_per_mm2=235.0, sram_density_mb_per_mm2=1.85, voltage_nominal=0.70, cost_factor=1.9, maturity_level="Ramp", description="Advanced high-performance mobile logic process."),
            ProcessNode(id="PN4P", foundry="TSMC", node_name="N4P", logic_density_mtr_per_mm2=185.0, sram_density_mb_per_mm2=1.45, voltage_nominal=0.74, cost_factor=1.45, maturity_level="Mature", description="Cost-optimized advanced mobile logic process."),
            ProcessNode(id="PN5", foundry="TSMC", node_name="N5", logic_density_mtr_per_mm2=171.3, sram_density_mb_per_mm2=1.35, voltage_nominal=0.75, cost_factor=1.25, maturity_level="Production", description="Memory/cache-friendly advanced process."),
            ProcessNode(id="PN6", foundry="TSMC", node_name="N6", logic_density_mtr_per_mm2=118.0, sram_density_mb_per_mm2=1.05, voltage_nominal=0.80, cost_factor=0.85, maturity_level="Mature", description="Mature companion die process for IO, PHY, always-on, and analog-friendly logic."),
        ]
        module_definitions = [
            ModuleDefinition(id="MD_CPU_P_CORE", name="ARMV9_BIG_CORE", module_type="cpu_core", ip_owner="CPU Team", reuse_class="replicated", description="High-performance Armv9-class CPU core."),
            ModuleDefinition(id="MD_CPU_E_CORE", name="ARMV9_EFF_CORE", module_type="cpu_core", ip_owner="CPU Team", reuse_class="replicated", description="Efficiency CPU core."),
            ModuleDefinition(id="MD_GPU_SHADER", name="IMMORTALIS_SHADER_SLICE", module_type="gpu_slice", ip_owner="GPU Team", reuse_class="replicated", description="Mobile GPU shader slice."),
            ModuleDefinition(id="MD_NPU_TENSOR", name="NPU_TENSOR_TILE", module_type="ai_accelerator", ip_owner="AI Team", reuse_class="replicated", description="INT8/FP16 tensor tile."),
            ModuleDefinition(id="MD_SRAM_BANK", name="SRAM_BANK_8MB", module_type="memory_macro", ip_owner="Memory Team", reuse_class="compiler_macro", description="Compiled SRAM macro bank."),
            ModuleDefinition(id="MD_ISP_PIPE", name="ISP_PIPELINE", module_type="image_pipeline", ip_owner="Camera Team", reuse_class="replicated", description="Image signal processing pipeline."),
            ModuleDefinition(id="MD_VIDEO_CODEC", name="VIDEO_CODEC_ENGINE", module_type="media_engine", ip_owner="Media Team", reuse_class="configurable", description="Encode/decode media engine."),
            ModuleDefinition(id="MD_DISPLAY_PIPE", name="DISPLAY_PIPE", module_type="display_pipeline", ip_owner="Display Team", reuse_class="replicated", description="Display compositor and timing pipe."),
            ModuleDefinition(id="MD_LPDDR_CTRL", name="LPDDR5X_CONTROLLER", module_type="memory_controller", ip_owner="Memory Team", reuse_class="replicated", description="LPDDR5X memory controller channel."),
            ModuleDefinition(id="MD_PHY", name="SERDES_PHY", module_type="phy_analog", ip_owner="PHY Team", reuse_class="fixed_hard_macro", description="Fixed IO/PHY hard macro."),
            ModuleDefinition(id="MD_CRYPTO", name="CRYPTO_ENGINE", module_type="security", ip_owner="Security Team", reuse_class="shared_ip", description="AES/SHA/public-key accelerator."),
            ModuleDefinition(id="MD_NOC", name="COHERENT_NOC", module_type="interconnect", ip_owner="Platform Team", reuse_class="platform_fabric", description="Coherent system fabric and QoS."),
        ]

        owner_overrides = {
            "B0": "Architecture Team",
            "B_CPU": "CPU Team",
            "B_GPU": "GPU Team",
            "B_NPU": "AI Team",
            "B_ISP": "Camera Team",
            "B_MEDIA": "Media Team",
            "B_DISPLAY": "Display Team",
            "B_MODEM": "Modem Team",
            "B_MEM": "Memory Team",
            "B_NOC": "Platform Team",
            "B_IO": "PHY Team",
            "B_SEC": "Security Team",
            "B_PMU": "Power Team",
        }
        owner_by_component: dict[str, str] = {}

        def logical(row: tuple[str, str | None, str | None, str, str, str, str, int, str]) -> LogicalComponent:
            id, parent_id, module_definition_id, name, instance_type, resource_type, function_domain, count, description = row
            path = name if parent_id is None else f"{logical_paths[parent_id]}/{name}"
            logical_paths[id] = path
            owner_team = owner_overrides.get(id) or (owner_by_component[parent_id] if parent_id else "Architecture Team")
            owner_by_component[id] = owner_team
            visibility_level = "public_summary" if id == "B0" else "team"
            return LogicalComponent(id=id, project_id="P001", parent_id=parent_id, module_definition_id=module_definition_id, name=name, instance_type=instance_type, resource_type=resource_type, function_domain=function_domain, hierarchy_path=path, logical_instance_count=count, owner_team=owner_team, visibility_level=visibility_level, description=description, created_at=created, updated_at=created)

        logical_paths: dict[str, str] = {}
        logical_rows: list[tuple[str, str | None, str | None, str, str, str, str, int, str]] = [
            ("B0", None, None, "SOC_TOP", "top", "mixed", "SoC", 1, "Logical root for the Orion X1 mobile SoC."),
            ("B_CPU", "B0", None, "CPU_CLUSTER", "subsystem", "logic+memory", "Compute", 1, "4P+4E CPU cluster with shared DSU/L3."),
            ("B_CPU_P", "B_CPU", "MD_CPU_P_CORE", "P_CORE", "block", "logic", "CPU", 4, "Four high-performance CPU cores."),
            ("B_CPU_E", "B_CPU", "MD_CPU_E_CORE", "E_CORE", "block", "logic", "CPU", 4, "Four efficiency CPU cores."),
            ("B_CPU_L3", "B_CPU", "MD_SRAM_BANK", "CPU_DSU_L3", "cache", "logic+memory", "CPU Cache", 1, "Shared DSU and 12 MB L3 cache."),
            ("B_GPU", "B0", None, "GPU_TOP", "subsystem", "logic+memory", "Graphics", 1, "Flagship mobile GPU with shader slices and cache."),
            ("B_GPU_SHADER", "B_GPU", "MD_GPU_SHADER", "GPU_SHADER_SLICE", "block", "logic", "Graphics", 6, "Six shader slices."),
            ("B_GPU_L2", "B_GPU", "MD_SRAM_BANK", "GPU_L2_CACHE", "cache", "memory", "Graphics Memory", 2, "GPU L2/cache SRAM banks."),
            ("B_NPU", "B0", None, "NPU_TOP", "subsystem", "logic+memory", "AI", 1, "AI accelerator subsystem."),
            ("B_NPU_TENSOR", "B_NPU", "MD_NPU_TENSOR", "NPU_TENSOR_TILE", "block", "logic", "AI Compute", 8, "Eight tensor compute tiles."),
            ("B_NPU_SRAM", "B_NPU", "MD_SRAM_BANK", "NPU_LOCAL_SRAM", "macro_group", "memory", "AI Memory", 8, "Local SRAM banks for tensor tiles."),
            ("B_NPU_DMA", "B_NPU", None, "NPU_DMA_QOS", "block", "logic", "AI Data Movement", 1, "DMA, command processor, and QoS logic."),
            ("B_ISP", "B0", None, "ISP_TOP", "subsystem", "logic+memory", "Camera", 1, "Triple-camera ISP complex."),
            ("B_ISP_PIPE", "B_ISP", "MD_ISP_PIPE", "ISP_PIPE", "block", "logic", "Camera", 3, "Three concurrent image pipelines."),
            ("B_CV_DSP", "B_ISP", None, "CV_DSP", "block", "logic+memory", "Camera AI", 1, "Computer-vision DSP for camera features."),
            ("B_MEDIA", "B0", None, "MEDIA_TOP", "subsystem", "logic", "Media", 1, "Video encode/decode subsystem."),
            ("B_VDEC", "B_MEDIA", "MD_VIDEO_CODEC", "VIDEO_DECODER", "block", "logic", "Video Decode", 1, "8K/4K multi-format decode engine."),
            ("B_VENC", "B_MEDIA", "MD_VIDEO_CODEC", "VIDEO_ENCODER", "block", "logic", "Video Encode", 1, "4K/8K encode engine."),
            ("B_DISPLAY", "B0", None, "DISPLAY_TOP", "subsystem", "logic", "Display", 1, "Display compositor and panel interface subsystem."),
            ("B_DPU", "B_DISPLAY", "MD_DISPLAY_PIPE", "DISPLAY_PIPE", "block", "logic", "Display", 2, "Dual display pipelines."),
            ("B_MODEM", "B0", None, "5G_MODEM_TOP", "subsystem", "logic+memory", "Cellular", 1, "Integrated 5G baseband and RF digital frontend."),
            ("B_MODEM_DSP", "B_MODEM", None, "BASEBAND_DSP", "block", "logic", "Cellular DSP", 2, "Dual vector DSP baseband engines."),
            ("B_MODEM_SRAM", "B_MODEM", "MD_SRAM_BANK", "BASEBAND_SRAM", "macro_group", "memory", "Cellular Memory", 4, "Baseband SRAM banks."),
            ("B_MODEM_RF", "B_MODEM", None, "RF_DIGITAL_FRONTEND", "block", "logic", "Cellular RF", 1, "Digital RF control and calibration logic."),
            ("B_MEM", "B0", None, "MEMORY_SUBSYSTEM", "subsystem", "logic+memory", "Memory", 1, "LPDDR controllers, system cache, and memory fabric."),
            ("B_SYS_CACHE", "B_MEM", "MD_SRAM_BANK", "SYSTEM_LEVEL_CACHE", "cache", "memory", "System Cache", 1, "32 MB system-level cache."),
            ("B_LPDDR_CTRL", "B_MEM", "MD_LPDDR_CTRL", "LPDDR5X_CONTROLLER", "block", "logic", "Memory Controller", 4, "Four LPDDR5X controller channels."),
            ("B_NOC", "B0", "MD_NOC", "SYSTEM_NOC", "subsystem", "logic", "Interconnect", 1, "Coherent NoC, SMMU, DMA fabric, and QoS."),
            ("B_IO", "B0", None, "IO_SUBSYSTEM", "subsystem", "phy_analog", "External IO", 1, "External memory, storage, USB/PCIe, camera/display PHYs."),
            ("B_DDR_PHY", "B_IO", "MD_PHY", "LPDDR5X_PHY", "phy", "phy_analog", "Memory IO", 4, "Four LPDDR5X PHY slices."),
            ("B_UFS_PHY", "B_IO", "MD_PHY", "UFS_PHY", "phy", "phy_analog", "Storage IO", 1, "UFS 4.x PHY."),
            ("B_USB_PCIE_PHY", "B_IO", "MD_PHY", "USB_PCIE_PHY", "phy", "phy_analog", "High-Speed IO", 1, "Shared USB/PCIe PHY complex."),
            ("B_MIPI_PHY", "B_IO", "MD_PHY", "MIPI_PHY", "phy", "phy_analog", "Camera/Display IO", 6, "MIPI D-PHY/C-PHY slices."),
            ("B_SEC", "B0", None, "SECURE_ISLAND", "subsystem", "logic+memory", "Security", 1, "Root-of-trust and secure enclave."),
            ("B_CRYPTO", "B_SEC", "MD_CRYPTO", "CRYPTO_ENGINE", "block", "logic", "Security", 1, "Crypto accelerator."),
            ("B_PMU", "B0", None, "AON_PMU_SENSOR_HUB", "subsystem", "mixed", "Always On", 1, "Always-on PMU, sensor hub, clock/reset, and low-power control."),
        ]
        logical_components = [logical(row) for row in logical_rows]
        responsibility_roots = [
            ("Architecture Team", "arch_lead", "B0"),
            ("CPU Team", "cpu_owner", "B_CPU"),
            ("GPU Team", "gpu_owner", "B_GPU"),
            ("AI Team", "ai_owner", "B_NPU"),
            ("Camera Team", "camera_owner", "B_ISP"),
            ("Media Team", "media_owner", "B_MEDIA"),
            ("Display Team", "display_owner", "B_DISPLAY"),
            ("Modem Team", "modem_owner", "B_MODEM"),
            ("Memory Team", "memory_owner", "B_MEM"),
            ("Platform Team", "platform_owner", "B_NOC"),
            ("PHY Team", "phy_owner", "B_IO"),
            ("Security Team", "security_owner", "B_SEC"),
            ("Power Team", "power_owner", "B_PMU"),
        ]
        responsibilities = [
            ResponsibilityAssignment(
                id=f"RA_{team.upper().replace(' ', '_')}_{root}",
                project_id="P001",
                scenario_id="S2",
                user_id=user_id,
                team_name=team,
                logical_component_id=root,
                scope_type="subtree",
                can_read=True,
                can_write=True,
            )
            for team, user_id, root in responsibility_roots
        ]
        tiers = [
            Tier(id="T0", scenario_id="S2", tier_index=0, name="Compute Logic Tier", process_id="PN3E", role="CPU/GPU/NPU/ISP/media high-performance logic", orientation="Face-down", thickness_um=42, area_limit_mm2=72.0, description="Advanced logic tier with hot compute blocks and fine-pitch hybrid bonding."),
            Tier(id="T1", scenario_id="S2", tier_index=1, name="SRAM + Cache Tier", process_id="PN5", role="Large SRAM/cache plus medium logic", orientation="Face-up / Face-to-face", thickness_um=48, area_limit_mm2=64.0, description="Cache/SRAM-heavy tier serving CPU/GPU/NPU and modem memories."),
            Tier(id="T2", scenario_id="S2", tier_index=2, name="IO + Always-On Tier", process_id="PN6", role="LPDDR/PHY/IO/security/AON/analog-friendly logic", orientation="Backside PDN", thickness_um=60, area_limit_mm2=44.0, description="Mature-node companion tier for IO PHYs, PMU, RF digital, and low-power islands."),
        ]

        partition_rows = [
            ("PP_CPU_P_T0", "B_CPU_P", "T0", "P_CORE_CLUSTER_TOP", "full", 4, 1.00),
            ("PP_CPU_E_T0", "B_CPU_E", "T0", "E_CORE_CLUSTER_TOP", "full", 4, 1.00),
            ("PP_CPU_L3_LOGIC_T0", "B_CPU_L3", "T0", "CPU_DSU_LOGIC_TOP", "partial", 1, 0.25),
            ("PP_CPU_L3_SRAM_T1", "B_CPU_L3", "T1", "CPU_L3_SRAM_MID", "partial", 1, 0.75),
            ("PP_GPU_SHADER_T0_A", "B_GPU_SHADER", "T0", "GPU_SHADER_TOP_A", "full", 4, 0.667),
            ("PP_GPU_SHADER_T0_B", "B_GPU_SHADER", "T0", "GPU_SHADER_TOP_B", "full", 2, 0.333),
            ("PP_GPU_L2_T1", "B_GPU_L2", "T1", "GPU_L2_CACHE_MID", "full", 2, 1.00),
            ("PP_GPU_RES_T0", "B_GPU", "T0", "GPU_FRONTEND_RESIDUAL_TOP", "partial", 1, 0.70),
            ("PP_GPU_RES_T1", "B_GPU", "T1", "GPU_MEMORY_RESIDUAL_MID", "partial", 1, 0.30),
            ("PP_NPU_TENSOR_T0", "B_NPU_TENSOR", "T0", "NPU_TENSOR_TOP", "full", 4, 0.50),
            ("PP_NPU_TENSOR_T1", "B_NPU_TENSOR", "T1", "NPU_TENSOR_MID", "full", 4, 0.50),
            ("PP_NPU_SRAM_T1", "B_NPU_SRAM", "T1", "NPU_LOCAL_SRAM_MID", "full", 8, 1.00),
            ("PP_NPU_DMA_T0", "B_NPU_DMA", "T0", "NPU_DMA_TOP", "partial", 1, 0.60),
            ("PP_NPU_DMA_T1", "B_NPU_DMA", "T1", "NPU_DMA_MID", "partial", 1, 0.40),
            ("PP_ISP_PIPE_T0", "B_ISP_PIPE", "T0", "ISP_PIPE_TOP", "full", 2, 0.667),
            ("PP_ISP_PIPE_T1", "B_ISP_PIPE", "T1", "ISP_PIPE_MID", "full", 1, 0.333),
            ("PP_CV_DSP_T0", "B_CV_DSP", "T0", "CV_DSP_TOP", "full", 1, 1.00),
            ("PP_VDEC_T0", "B_VDEC", "T0", "VIDEO_DECODER_TOP", "full", 1, 1.00),
            ("PP_VENC_T0", "B_VENC", "T0", "VIDEO_ENCODER_TOP", "full", 1, 1.00),
            ("PP_DPU_T0", "B_DPU", "T0", "DISPLAY_PIPE_TOP", "full", 2, 1.00),
            ("PP_MODEM_DSP_T0", "B_MODEM_DSP", "T0", "BASEBAND_DSP_TOP", "full", 2, 1.00),
            ("PP_MODEM_SRAM_T1", "B_MODEM_SRAM", "T1", "BASEBAND_SRAM_MID", "full", 4, 1.00),
            ("PP_MODEM_RF_T2", "B_MODEM_RF", "T2", "RF_DIGITAL_BOTTOM", "full", 1, 1.00),
            ("PP_SYS_CACHE_T1", "B_SYS_CACHE", "T1", "SLC_CACHE_MID", "full", 1, 1.00),
            ("PP_LPDDR_CTRL_T2", "B_LPDDR_CTRL", "T2", "LPDDR_CTRL_BOTTOM", "full", 4, 1.00),
            ("PP_NOC_T0", "B_NOC", "T0", "NOC_COMPUTE_TOP", "partial", 1, 0.55),
            ("PP_NOC_T1", "B_NOC", "T1", "NOC_CACHE_MID", "partial", 1, 0.30),
            ("PP_NOC_T2", "B_NOC", "T2", "NOC_IO_BOTTOM", "partial", 1, 0.15),
            ("PP_DDR_PHY_T2", "B_DDR_PHY", "T2", "LPDDR5X_PHY_BOTTOM", "full", 4, 1.00),
            ("PP_UFS_PHY_T2", "B_UFS_PHY", "T2", "UFS_PHY_BOTTOM", "full", 1, 1.00),
            ("PP_USB_PCIE_PHY_T2", "B_USB_PCIE_PHY", "T2", "USB_PCIE_PHY_BOTTOM", "full", 1, 1.00),
            ("PP_MIPI_PHY_T2", "B_MIPI_PHY", "T2", "MIPI_PHY_BOTTOM", "full", 6, 1.00),
            ("PP_CRYPTO_T2", "B_CRYPTO", "T2", "CRYPTO_SECURE_BOTTOM", "full", 1, 1.00),
            ("PP_SEC_RES_T2", "B_SEC", "T2", "SECURE_ISLAND_RESIDUAL_BOTTOM", "full", 1, 1.00),
            ("PP_PMU_T2", "B_PMU", "T2", "AON_PMU_SENSOR_BOTTOM", "full", 1, 1.00),
        ]
        partitions = [
            PhysicalPartition(id=id, scenario_id="S2", logical_component_id=logical_id, tier_id=tier_id, partition_name=name, partition_type=ptype, physical_instance_count=count, partition_ratio=1.0 if ptype == "full" else ratio, content_share=1.0 if ptype == "full" else ratio, description=f"{name} maps {logical_id} to {tier_id}.")
            for id, logical_id, tier_id, name, ptype, count, ratio in partition_rows
        ]

        logical_metric_values = {
            "B0": (2200, 84.0, 168.0, 285.0, 0.0), "B_CPU": (620, 10.0, 28.0, 42.0, 9.8), "B_CPU_P": (320, 0.0, 18.4, 20.2, 7.8), "B_CPU_E": (220, 0.0, 5.8, 6.5, 2.2), "B_CPU_L3": (180, 9.6, 2.1, 12.8, 1.6),
            "B_GPU": (740, 10.5, 30.8, 44.0, 9.4), "B_GPU_SHADER": (520, 0.0, 27.6, 30.2, 8.6), "B_GPU_L2": (96, 8.6, 0.8, 9.9, 0.8), "B_NPU": (680, 14.2, 24.7, 43.5, 7.2), "B_NPU_TENSOR": (360, 0.0, 20.8, 22.4, 6.4), "B_NPU_SRAM": (128, 12.8, 0.9, 14.2, 0.7), "B_NPU_DMA": (104, 0.8, 2.5, 3.6, 0.6),
            "B_ISP": (420, 4.0, 13.3, 19.0, 3.6), "B_ISP_PIPE": (240, 1.8, 9.6, 12.0, 2.8), "B_CV_DSP": (150, 1.2, 3.7, 5.2, 0.9), "B_MEDIA": (240, 1.2, 7.8, 10.0, 2.1), "B_VDEC": (120, 0.5, 3.6, 4.6, 0.9), "B_VENC": (130, 0.6, 4.2, 5.3, 1.1), "B_DISPLAY": (150, 0.8, 4.2, 5.6, 1.0), "B_DPU": (120, 0.6, 3.6, 4.8, 0.9),
            "B_MODEM": (520, 7.8, 19.6, 31.0, 5.4), "B_MODEM_DSP": (260, 1.6, 10.2, 12.6, 3.2), "B_MODEM_SRAM": (90, 5.4, 0.7, 6.4, 0.5), "B_MODEM_RF": (110, 0.8, 3.8, 5.1, 0.9), "B_MEM": (260, 32.0, 6.0, 42.0, 2.5), "B_SYS_CACHE": (80, 25.6, 0.9, 28.2, 1.1), "B_LPDDR_CTRL": (180, 1.2, 4.8, 6.1, 1.4), "B_NOC": (300, 0.8, 8.5, 10.5, 2.2),
            "B_IO": (210, 0.5, 18.0, 24.0, 2.0), "B_DDR_PHY": (70, 0.0, 8.8, 9.6, 1.1), "B_UFS_PHY": (24, 0.0, 1.5, 1.8, 0.2), "B_USB_PCIE_PHY": (42, 0.0, 2.8, 3.4, 0.4), "B_MIPI_PHY": (52, 0.0, 3.6, 4.5, 0.3), "B_SEC": (95, 1.2, 2.2, 4.0, 0.6), "B_CRYPTO": (50, 0.2, 1.2, 1.7, 0.4), "B_PMU": (86, 0.8, 2.8, 4.2, 0.3),
        }
        partition_metric_values = {
            id: (logic_area, sram_area, block_area, power, shape)
            for id, logic_area, sram_area, block_area, power, shape in [
                ("PP_CPU_P_T0", 18.6, 0.0, 0.0, 7.8, "quad_core_cluster"), ("PP_CPU_E_T0", 5.8, 0.0, 0.0, 2.2, "compact_core_cluster"), ("PP_CPU_L3_LOGIC_T0", 2.1, 0.0, 0.0, 0.5, "narrow_logic"), ("PP_CPU_L3_SRAM_T1", 0.2, 9.8, 0.0, 1.1, "sram_array"),
                ("PP_GPU_SHADER_T0_A", 18.8, 0.0, 0.0, 5.8, "shader_bank_a"), ("PP_GPU_SHADER_T0_B", 9.5, 0.0, 0.0, 2.9, "shader_bank_b"), ("PP_GPU_L2_T1", 0.7, 8.7, 0.0, 0.8, "sram_array"), ("PP_GPU_RES_T0", 3.6, 0.2, 0.0, 1.0, "frontend_logic"), ("PP_GPU_RES_T1", 0.4, 1.1, 0.0, 0.2, "memory_glue"),
                ("PP_NPU_TENSOR_T0", 11.0, 0.0, 0.0, 3.3, "tensor_array_top"), ("PP_NPU_TENSOR_T1", 10.6, 0.0, 0.0, 3.1, "tensor_array_mid"), ("PP_NPU_SRAM_T1", 0.9, 13.0, 0.0, 0.7, "sram_array"), ("PP_NPU_DMA_T0", 1.6, 0.1, 0.0, 0.3, "dma_logic"), ("PP_NPU_DMA_T1", 1.0, 0.7, 0.0, 0.3, "memory_qos"),
                ("PP_ISP_PIPE_T0", 6.6, 0.7, 0.0, 1.8, "pipeline_pair"), ("PP_ISP_PIPE_T1", 3.4, 1.2, 0.0, 1.0, "pipeline_single"), ("PP_CV_DSP_T0", 3.7, 1.2, 0.0, 0.9, "dsp_block"), ("PP_VDEC_T0", 3.7, 0.5, 0.0, 0.9, "codec_block"), ("PP_VENC_T0", 4.2, 0.6, 0.0, 1.1, "codec_block"), ("PP_DPU_T0", 3.8, 0.6, 0.0, 0.9, "display_pipe_pair"),
                ("PP_MODEM_DSP_T0", 10.4, 1.5, 0.0, 3.2, "dsp_pair"), ("PP_MODEM_SRAM_T1", 0.6, 5.5, 0.0, 0.5, "sram_array"), ("PP_MODEM_RF_T2", 3.9, 0.9, 0.0, 0.9, "rf_digital"), ("PP_SYS_CACHE_T1", 0.9, 26.0, 0.0, 1.1, "large_slc"), ("PP_LPDDR_CTRL_T2", 4.9, 1.2, 0.0, 1.4, "controller_cluster"),
                ("PP_NOC_T0", 4.7, 0.2, 0.0, 1.2, "compute_fabric"), ("PP_NOC_T1", 2.6, 0.4, 0.0, 0.7, "cache_fabric"), ("PP_NOC_T2", 1.4, 0.2, 0.0, 0.3, "io_fabric"), ("PP_DDR_PHY_T2", 1.0, 0.0, 8.8, 1.1, "phy_edge"), ("PP_UFS_PHY_T2", 0.2, 0.0, 1.6, 0.2, "phy_edge"), ("PP_USB_PCIE_PHY_T2", 0.4, 0.0, 3.0, 0.4, "phy_edge"), ("PP_MIPI_PHY_T2", 0.6, 0.0, 3.9, 0.3, "phy_edge_array"), ("PP_CRYPTO_T2", 1.3, 0.2, 0.0, 0.4, "secure_logic"), ("PP_SEC_RES_T2", 1.0, 1.0, 0.0, 0.2, "secure_island"), ("PP_PMU_T2", 2.9, 0.8, 0.5, 0.3, "aon_mixed"),
            ]
        }
        metrics: list[Metric] = []
        for component_id, (signals, sram_area, logic_area, block_area, power) in logical_metric_values.items():
            for name, value, unit, category, workload in [("signal_count_total", signals, "count", "logical", "nominal"), ("logic_area", logic_area, "mm2", "logical_area", "nominal"), ("sram_area", sram_area, "mm2", "logical_area", "nominal"), ("block_area", block_area, "mm2", "logical_area", "nominal"), ("power", power, "W", "power", "peak")]:
                metrics.append(metric(f"M_LOG_{component_id}_{name.upper()}", "S2", "logical_component", component_id, name, value, unit, category, "number", "typical", workload, "review", "Architecture planning estimate for the realistic mobile SoC demo."))
        for partition_id, (logic_area, sram_area, block_area, power, shape_type) in partition_metric_values.items():
            for name, value, unit, category, workload, value_type in [("logic_area", logic_area, "mm2", "implementation_area", "nominal", "number"), ("sram_area", sram_area, "mm2", "implementation_area", "nominal", "number"), ("block_area", block_area, "mm2", "implementation_area", "nominal", "number"), ("power", power, "W", "power", "peak", "number"), ("shape_type", shape_type, "", "physical_shape", "nominal", "text")]:
                metrics.append(metric(f"M_PART_{partition_id}_{name.upper()}", "S2", "physical_partition", partition_id, name, value, unit, category, value_type, "typical", workload, "review", "Physical partition estimate for the realistic mobile SoC demo."))
        metrics.extend([
            metric("M_TIER_T0_POWER", "S2", "tier", "T0", "power", 31.2, "W", "power", "number", "typical", "peak", "review", "Compute-tier peak budget."),
            metric("M_TIER_T1_POWER", "S2", "tier", "T1", "power", 8.7, "W", "power", "number", "typical", "peak", "review", "SRAM/cache-tier peak budget."),
            metric("M_TIER_T2_POWER", "S2", "tier", "T2", "power", 5.4, "W", "power", "number", "typical", "peak", "review", "IO/always-on tier peak budget."),
            metric("M_TIER_T0_UTIL", "S2", "tier", "T0", "utilization", 78, "%", "physical", "number", "typical", "nominal", "review", "Tier utilization target."),
            metric("M_TIER_T1_UTIL", "S2", "tier", "T1", "utilization", 71, "%", "physical", "number", "typical", "nominal", "review", "Tier utilization target."),
            metric("M_TIER_T2_UTIL", "S2", "tier", "T2", "utilization", 63, "%", "physical", "number", "typical", "nominal", "review", "Tier utilization target."),
            metric("M_SCENARIO_S1_AREA", "S1", "scenario", "S1", "area", 182.0, "mm2", "physical", "number", "typical", "nominal", "review", "Monolithic N3E planning estimate including keepout and IO ring."),
            metric("M_SCENARIO_S1_POWER", "S1", "scenario", "S1", "power", 49.5, "W", "power", "number", "typical", "peak", "review", "Monolithic peak workload power."),
            metric("M_SCENARIO_S2_AREA", "S2", "scenario", "S2", "area", 119.0, "mm2", "physical", "number", "typical", "nominal", "review", "Projected exposed package footprint for the 3-tier option."),
            metric("M_SCENARIO_S2_POWER", "S2", "scenario", "S2", "power", 45.3, "W", "power", "number", "typical", "peak", "review", "3DIC peak workload power with shorter memory paths."),
            metric("M_SCENARIO_S3_AREA", "S3", "scenario", "S3", "area", 143.0, "mm2", "physical", "number", "typical", "nominal", "review", "2.5D option exposed package footprint estimate."),
            metric("M_SCENARIO_S3_POWER", "S3", "scenario", "S3", "power", 47.0, "W", "power", "number", "typical", "peak", "review", "2.5D option peak workload power."),
        ])

        for row in projects + scenarios + process_nodes + module_definitions + logical_components + tiers + partitions + metrics + responsibilities:
            session.merge(row)
        session.commit()


def metric(
    id: str,
    scenario_id: str,
    subject_type: str,
    subject_id: str,
    metric_name: str,
    metric_value: object,
    metric_unit: str,
    metric_category: str,
    value_type: str,
    corner: str,
    workload: str,
    confidence: str,
    source_note: str,
) -> Metric:
    return Metric(
        id=id,
        scenario_id=scenario_id,
        subject_type=subject_type,
        subject_id=subject_id,
        metric_name=metric_name,
        metric_value=str(metric_value),
        metric_unit=metric_unit,
        metric_category=metric_category,
        value_type=value_type,
        corner=corner,
        workload=workload,
        confidence=confidence,
        source_note=source_note,
        created_at=now_iso(),
    )


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()
    ensure_sqlite_schema_compatibility()
    if os.getenv("SEED_DEMO", "true").lower() in {"1", "true", "yes", "on"}:
        seed_data()


def metrics_for(session: Session, scenario_id: str, subject_type: str, subject_id: str) -> dict[str, Metric]:
    rows = session.exec(
        select(Metric).where(
            Metric.scenario_id == scenario_id,
            Metric.subject_type == subject_type,
            Metric.subject_id == subject_id,
        )
    ).all()
    return {row.metric_name: row for row in rows}


def metric_number(metrics: dict[str, Metric], name: str) -> float:
    return number_or_zero(metrics[name].metric_value) if name in metrics else 0


def normalized_content_share(partition_type: str, value: float | None) -> float:
    if partition_type == "full":
        return 1.0
    return float(value if value is not None else 1.0)


def partition_equivalent_instances(partition: PhysicalPartition) -> float:
    return partition.physical_instance_count * normalized_content_share(partition.partition_type, partition.content_share)


def is_global_team(team: str | None) -> bool:
    return not team or team in {"Architecture Team", "All", "All Teams"}


def allowed_component_ids_for_team(session: Session, team: str | None, scenario_id: str = "S2") -> set[str] | None:
    if is_global_team(team):
        return None

    components = session.exec(select(LogicalComponent).order_by(LogicalComponent.hierarchy_path)).all()
    by_id = {component.id: component for component in components}
    assignments = session.exec(
        select(ResponsibilityAssignment).where(
            ResponsibilityAssignment.scenario_id == scenario_id,
            ResponsibilityAssignment.team_name == team,
            ResponsibilityAssignment.can_read == True,
        )
    ).all()
    root_ids = [assignment.logical_component_id for assignment in assignments]
    if not root_ids:
        root_ids = [
            component.id
            for component in components
            if component.owner_team == team
            and (not component.parent_id or by_id.get(component.parent_id, component).owner_team != team)
        ]

    allowed: set[str] = set()
    for root_id in root_ids:
        root = by_id.get(root_id)
        if not root:
            continue
        for component in components:
            if component.id == root.id or component.hierarchy_path.startswith(f"{root.hierarchy_path}/"):
                allowed.add(component.id)
    return allowed


def component_rows_for_team(session: Session, team: str | None, scenario_id: str = "S2") -> tuple[list[LogicalComponent], set[str] | None]:
    rows = session.exec(select(LogicalComponent).order_by(LogicalComponent.hierarchy_path)).all()
    allowed = allowed_component_ids_for_team(session, team, scenario_id)
    if allowed is None:
        return rows, None
    return [row for row in rows if row.id in allowed], allowed


def scope_component_items(items: list[dict[str, Any]], allowed: set[str] | None) -> list[dict[str, Any]]:
    if allowed is None:
        return items
    return [{**item, "parent": item["parent"] if item["parent"] in allowed else None} for item in items]


def partition_ids_for_components(session: Session, scenario_id: str, component_ids: set[str]) -> set[str]:
    rows = session.exec(select(PhysicalPartition).where(PhysicalPartition.scenario_id == scenario_id)).all()
    return {row.id for row in rows if row.logical_component_id in component_ids}


def partition_ui(session: Session, partition: PhysicalPartition) -> dict[str, Any]:
    logical = session.get(LogicalComponent, partition.logical_component_id)
    metrics = metrics_for(session, partition.scenario_id, "physical_partition", partition.id)
    logical_count = logical.logical_instance_count if logical and logical.logical_instance_count else 0
    content_share = normalized_content_share(partition.partition_type, partition.content_share)
    return {
        "id": partition.id,
        "scenario_id": partition.scenario_id,
        "logical_component_id": partition.logical_component_id,
        "logical_component_name": logical.name if logical else partition.logical_component_id,
        "tier_id": partition.tier_id,
        "partition_name": partition.partition_name,
        "partition_type": partition.partition_type,
        "physical_instance_count": partition.physical_instance_count,
        "content_share": content_share,
        "instance_share": round(partition.physical_instance_count / logical_count, 4) if logical_count else 0,
        "partition_ratio": content_share,
        "logic_area": metric_number(metrics, "logic_area"),
        "sram_area": metric_number(metrics, "sram_area"),
        "block_area": metric_number(metrics, "block_area"),
        "power": metric_number(metrics, "power"),
        "shape_type": metrics["shape_type"].metric_value if "shape_type" in metrics else "",
        "description": partition.description,
    }


def logical_area_summary(session: Session, component: LogicalComponent, scenario_id: str) -> dict[str, Any]:
    metrics = metrics_for(session, scenario_id, "logical_component", component.id)
    total = {
        "logic_area": metric_number(metrics, "logic_area"),
        "sram_area": metric_number(metrics, "sram_area"),
        "block_area": metric_number(metrics, "block_area"),
    }
    child_rows = session.exec(select(LogicalComponent).where(LogicalComponent.parent_id == component.id)).all()
    child_sum = {"logic_area": 0.0, "sram_area": 0.0, "block_area": 0.0}
    for child in child_rows:
        child_metrics = metrics_for(session, scenario_id, "logical_component", child.id)
        for metric_name in child_sum:
            child_sum[metric_name] += metric_number(child_metrics, metric_name)
    residual = {metric_name: round(total[metric_name] - child_sum[metric_name], 4) for metric_name in total}
    return {
        "has_children": bool(child_rows),
        "child_logic_area": round(child_sum["logic_area"], 4),
        "child_sram_area": round(child_sum["sram_area"], 4),
        "child_block_area": round(child_sum["block_area"], 4),
        "residual_logic_area": residual["logic_area"],
        "residual_sram_area": residual["sram_area"],
        "residual_block_area": residual["block_area"],
    }


def component_ui(session: Session, component: LogicalComponent, scenario_id: str = "S2") -> dict[str, Any]:
    metrics = metrics_for(session, scenario_id, "logical_component", component.id)
    partitions = session.exec(
        select(PhysicalPartition).where(
            PhysicalPartition.scenario_id == scenario_id,
            PhysicalPartition.logical_component_id == component.id,
        )
    ).all()
    tier_ids = sorted({partition.tier_id for partition in partitions})
    confidence_order = {"approved": 0, "review": 1, "draft": 2}
    confidence = min((metric.confidence for metric in metrics.values()), key=lambda item: confidence_order.get(item, 9), default="draft")
    partition_rows = [partition_ui(session, partition) for partition in partitions]
    physical_instance_count = round(sum(row["physical_instance_count"] * row["content_share"] for row in partition_rows), 4)
    instance_share = round(physical_instance_count / component.logical_instance_count, 4) if component.logical_instance_count else 0
    block_area = metric_number(metrics, "block_area")
    if not block_area:
        block_area = sum(row["logic_area"] + row["sram_area"] + row["block_area"] for row in partition_rows)
    area_summary = logical_area_summary(session, component, scenario_id)
    return {
        "id": component.id,
        "parent": component.parent_id,
        "name": component.name,
        "type": component.instance_type,
        "domain": component.function_domain,
        "resource": component.resource_type,
        "hierarchy_path": component.hierarchy_path,
        "logical_instance_count": component.logical_instance_count,
        "owner_team": component.owner_team,
        "visibility_level": component.visibility_level,
        "physical_instance_count": physical_instance_count,
        "instance_share": instance_share,
        "partition_ratio": instance_share,
        "signal_count_total": metric_number(metrics, "signal_count_total"),
        "logic_area": metric_number(metrics, "logic_area"),
        "sram_area": metric_number(metrics, "sram_area"),
        "block_area": block_area,
        "area": block_area,
        "power": metric_number(metrics, "power") + sum(row["power"] for row in partition_rows),
        "tier": "/".join(tier_ids) if tier_ids else "-",
        "confidence": confidence,
        "partitions": partition_rows,
        "description": component.description,
        **area_summary,
    }


def build_component_tree(items: list[dict[str, Any]], parent: str | None = None) -> list[dict[str, Any]]:
    return [{**item, "children": build_component_tree(items, item["id"])} for item in items if item["parent"] == parent]


def scenario_ui(session: Session, scenario: Scenario) -> dict[str, Any]:
    metrics = metrics_for(session, scenario.id, "scenario", scenario.id)
    area = metric_number(metrics, "area")
    power = metric_number(metrics, "power")
    return {
        "id": scenario.id,
        "project_id": scenario.project_id,
        "name": scenario.name,
        "process": scenario.process_combo,
        "process_combo": scenario.process_combo,
        "die": scenario.scenario_type,
        "scenario_type": scenario.scenario_type,
        "area": area,
        "power": power,
        "risk": scenario.status,
        "cost": "High" if scenario.id == "S2" else "Medium",
        "thermal": "High" if scenario.id == "S2" else "Medium",
        "description": scenario.description,
        "status": scenario.status,
        "created_at": scenario.created_at,
        "updated_at": scenario.updated_at,
    }


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


def quality_issues_for(session: Session, scenario_id: str = "S2", team: str | None = None) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    components, allowed_component_ids = component_rows_for_team(session, team, scenario_id)
    partitions = session.exec(select(PhysicalPartition).where(PhysicalPartition.scenario_id == scenario_id)).all()
    metrics = session.exec(select(Metric).where(Metric.scenario_id == scenario_id)).all()
    if allowed_component_ids is not None:
        partitions = [row for row in partitions if row.logical_component_id in allowed_component_ids]
        allowed_partition_ids = {row.id for row in partitions}
        metrics = [
            row
            for row in metrics
            if (row.subject_type == "logical_component" and row.subject_id in allowed_component_ids)
            or (row.subject_type == "physical_partition" and row.subject_id in allowed_partition_ids)
        ]
    partitions_by_component: dict[str, list[PhysicalPartition]] = {}
    metrics_by_subject: dict[tuple[str, str], dict[str, Metric]] = {}

    for partition in partitions:
        partitions_by_component.setdefault(partition.logical_component_id, []).append(partition)
    for row in metrics:
        metrics_by_subject.setdefault((row.subject_type, row.subject_id), {})[row.metric_name] = row

    for component in components:
        component_partitions = partitions_by_component.get(component.id, [])
        if not component_partitions:
            continue

        equivalent_instances = sum(partition_equivalent_instances(partition) for partition in component_partitions)
        if abs(equivalent_instances - component.logical_instance_count) > 0.001:
            issues.append(
                make_quality_issue(
                    "High",
                    "Implementation coverage not closed",
                    f"{component.name} maps to {equivalent_instances:.3f} equivalent instances, expected {component.logical_instance_count}.",
                    "Adjust physical_instance_count and content_share so count * content_share closes to the logical instance count.",
                    "logical_component",
                    component.id,
                )
            )

        for partition in component_partitions:
            if partition.partition_type == "full" and abs(partition.content_share - 1.0) > 0.001:
                issues.append(
                    make_quality_issue(
                        "Medium",
                        "Full partition content_share must be 1",
                        f"{partition.id} is full but content_share={partition.content_share}.",
                        "Set full partitions to content_share=1 or change the partition_type to partial.",
                        "physical_partition",
                        partition.id,
                    )
                )

    required_logical_metrics = {"signal_count_total", "logic_area", "sram_area", "block_area"}
    parent_ids = {row.parent_id for row in components if row.parent_id}
    leaf_components = [row for row in components if row.id not in parent_ids]
    children_by_parent: dict[str, list[LogicalComponent]] = {}
    for component in components:
        if component.parent_id:
            children_by_parent.setdefault(component.parent_id, []).append(component)

    for component in components:
        child_rows = children_by_parent.get(component.id, [])
        if not child_rows:
            continue
        available = metrics_by_subject.get(("logical_component", component.id), {})
        missing_area = sorted({"logic_area", "sram_area", "block_area"} - set(available))
        if missing_area:
            issues.append(
                make_quality_issue(
                    "Medium",
                    "Parent total area metrics missing",
                    f"{component.name} needs total area metrics to compute residual area: {', '.join(missing_area)}.",
                    "Fill parent total logic_area, sram_area, and block_area; residual area is derived automatically.",
                    "logical_component",
                    component.id,
                )
            )
            continue
        for metric_name in ["logic_area", "sram_area", "block_area"]:
            parent_value = metric_number(available, metric_name)
            child_value = sum(metric_number(metrics_by_subject.get(("logical_component", child.id), {}), metric_name) for child in child_rows)
            if parent_value + 0.001 < child_value:
                issues.append(
                    make_quality_issue(
                        "High",
                        "Parent area smaller than child sum",
                        f"{component.name} {metric_name}={parent_value:.3f}, but direct children sum to {child_value:.3f}.",
                        "Parent total area should include child modules; residual area is computed as parent total minus direct child total.",
                        "logical_component",
                        component.id,
                    )
                )

    for component in leaf_components:
        available = metrics_by_subject.get(("logical_component", component.id), {})
        missing = sorted(required_logical_metrics - set(available))
        if missing:
            issues.append(
                make_quality_issue(
                    "Medium",
                    "Logical metrics missing",
                    f"{component.name} is missing logical metrics: {', '.join(missing)}.",
                    "Add the missing metric rows with subject_type=logical_component.",
                    "logical_component",
                    component.id,
                )
            )

    valid_subject_ids = {
        "logical_component": {row.id for row in components},
        "physical_partition": {row.id for row in partitions},
        "tier": {row.id for row in session.exec(select(Tier).where(Tier.scenario_id == scenario_id)).all()},
        "scenario": {scenario_id},
    }
    for row in metrics:
        if row.subject_id not in valid_subject_ids.get(row.subject_type, set()):
            issues.append(
                make_quality_issue(
                    "High",
                    "Metric subject missing",
                    f"{row.id} references missing {row.subject_type} subject_id={row.subject_id}.",
                    "Fix subject_type / subject_id or import the referenced entity first.",
                    "metric",
                    row.id,
                )
            )
        if row.value_type == "number":
            try:
                float(row.metric_value)
            except ValueError:
                issues.append(
                    make_quality_issue(
                        "High",
                        "Metric value is not numeric",
                        f"{row.id} declares value_type=number but metric_value={row.metric_value!r}.",
                        "Replace metric_value with a numeric value or change value_type.",
                        "metric",
                        row.id,
                    )
                )

    return issues


@app.get("/api/projects")
def get_projects() -> list[Project]:
    with Session(engine) as session:
        return list(session.exec(select(Project)).all())


@app.get("/api/scenarios")
def get_scenarios() -> list[dict[str, Any]]:
    with Session(engine) as session:
        return [scenario_ui(session, scenario) for scenario in session.exec(select(Scenario)).all()]


@app.get("/api/module-definitions")
def get_module_definitions() -> list[ModuleDefinition]:
    with Session(engine) as session:
        return list(session.exec(select(ModuleDefinition)).all())


@app.get("/api/components")
def get_components(scenario_id: str = "S2", team: str | None = None) -> list[dict[str, Any]]:
    with Session(engine) as session:
        rows, allowed = component_rows_for_team(session, team, scenario_id)
        return scope_component_items([component_ui(session, row, scenario_id) for row in rows], allowed)


@app.get("/api/components/tree")
def get_component_tree(scenario_id: str = "S2", team: str | None = None) -> list[dict[str, Any]]:
    with Session(engine) as session:
        rows, allowed = component_rows_for_team(session, team, scenario_id)
        return build_component_tree(scope_component_items([component_ui(session, row, scenario_id) for row in rows], allowed))


@app.get("/api/physical-partitions")
def get_physical_partitions(scenario_id: str = "S2", team: str | None = None) -> list[dict[str, Any]]:
    with Session(engine) as session:
        allowed = allowed_component_ids_for_team(session, team, scenario_id)
        rows = session.exec(select(PhysicalPartition).where(PhysicalPartition.scenario_id == scenario_id)).all()
        if allowed is not None:
            rows = [row for row in rows if row.logical_component_id in allowed]
        return [partition_ui(session, row) for row in rows]


@app.put("/api/components/{component_id}/detail")
def update_component_detail(component_id: str, payload: ComponentDetailUpdate) -> dict[str, Any]:
    with Session(engine) as session:
        component = session.get(LogicalComponent, component_id)
        if not component:
            raise HTTPException(status_code=404, detail=f"Unknown logical component: {component_id}")

        allowed = allowed_component_ids_for_team(session, payload.team, payload.scenario_id)
        if allowed is not None and component_id not in allowed:
            raise HTTPException(status_code=403, detail=f"{component_id} is outside team scope {payload.team}")

        scenario = session.get(Scenario, payload.scenario_id)
        if not scenario:
            raise HTTPException(status_code=400, detail=f"Unknown scenario_id: {payload.scenario_id}")
        tier_ids = {row.id for row in session.exec(select(Tier).where(Tier.scenario_id == payload.scenario_id)).all()}
        if payload.logical_instance_count < 0:
            raise HTTPException(status_code=400, detail="logical_instance_count must be non-negative")

        seen_partition_ids: set[str] = set()
        for partition in payload.partitions:
            if not partition.id:
                raise HTTPException(status_code=400, detail="partition id is required")
            if partition.id in seen_partition_ids:
                raise HTTPException(status_code=400, detail=f"Duplicate partition id: {partition.id}")
            seen_partition_ids.add(partition.id)
            if partition.tier_id not in tier_ids:
                raise HTTPException(status_code=400, detail=f"Unknown tier_id for scenario {payload.scenario_id}: {partition.tier_id}")
            if partition.partition_type not in ALLOWED_PARTITION_TYPES:
                raise HTTPException(status_code=400, detail=f"Unsupported partition_type: {partition.partition_type}")
            if partition.physical_instance_count < 0:
                raise HTTPException(status_code=400, detail=f"{partition.id} has negative physical_instance_count")
            content_share = normalized_content_share(partition.partition_type, partition.content_share if partition.content_share is not None else partition.partition_ratio)
            if content_share < 0:
                raise HTTPException(status_code=400, detail=f"{partition.id} has negative content_share")
            if partition.partition_type == "full" and abs(content_share - 1.0) > 0.001:
                raise HTTPException(status_code=400, detail=f"{partition.id} is full, so content_share must be 1")

        component.logical_instance_count = payload.logical_instance_count
        component.updated_at = now_iso()
        session.add(component)

        existing = session.exec(
            select(PhysicalPartition).where(
                PhysicalPartition.scenario_id == payload.scenario_id,
                PhysicalPartition.logical_component_id == component_id,
            )
        ).all()
        for partition in existing:
            if partition.id not in seen_partition_ids:
                session.exec(
                    delete(Metric).where(
                        Metric.scenario_id == payload.scenario_id,
                        Metric.subject_type == "physical_partition",
                        Metric.subject_id == partition.id,
                    )
                )
                session.delete(partition)

        for partition in payload.partitions:
            content_share = normalized_content_share(partition.partition_type, partition.content_share if partition.content_share is not None else partition.partition_ratio)
            row = PhysicalPartition(
                id=partition.id,
                scenario_id=payload.scenario_id,
                logical_component_id=component_id,
                tier_id=partition.tier_id,
                partition_name=partition.partition_name,
                partition_type=partition.partition_type,
                physical_instance_count=partition.physical_instance_count,
                partition_ratio=content_share,
                content_share=content_share,
                description=partition.description,
            )
            session.merge(row)

        session.commit()
        session.refresh(component)
        return {
            "component": component_ui(session, component, payload.scenario_id),
            "quality_issues": quality_issues_for(session, payload.scenario_id, payload.team),
        }


@app.get("/api/tiers")
def get_tiers(scenario_id: str = "S2") -> list[dict[str, Any]]:
    with Session(engine) as session:
        tiers = session.exec(select(Tier).where(Tier.scenario_id == scenario_id).order_by(Tier.tier_index)).all()
        process_nodes = {node.id: node for node in session.exec(select(ProcessNode)).all()}
        return [
            {
                "id": tier.id,
                "scenario_id": tier.scenario_id,
                "tier_index": tier.tier_index,
                "name": tier.name,
                "process_id": tier.process_id,
                "process": f"{process_nodes[tier.process_id].foundry} {process_nodes[tier.process_id].node_name}" if tier.process_id in process_nodes else tier.process_id,
                "role": tier.role,
                "orientation": tier.orientation,
                "thickness_um": tier.thickness_um,
                "area": tier.area_limit_mm2,
                "area_limit_mm2": tier.area_limit_mm2,
                "power": metric_number(metrics_for(session, scenario_id, "tier", tier.id), "power"),
                "utilization": metric_number(metrics_for(session, scenario_id, "tier", tier.id), "utilization"),
                "interconnect": "HB < 1um" if tier.id == "T0" else "HB + TSV" if tier.id == "T1" else "TSV < 5um",
                "description": tier.description,
            }
            for tier in tiers
        ]


@app.get("/api/metrics")
def get_metrics(scenario_id: str | None = None, team: str | None = None) -> list[Metric]:
    with Session(engine) as session:
        statement = select(Metric)
        if scenario_id:
            statement = statement.where(Metric.scenario_id == scenario_id)
        rows = list(session.exec(statement).all())
        if is_global_team(team):
            return rows
        scoped_scenario_id = scenario_id or "S2"
        allowed_component_ids = allowed_component_ids_for_team(session, team, scoped_scenario_id) or set()
        allowed_partition_ids = partition_ids_for_components(session, scoped_scenario_id, allowed_component_ids)
        return [
            row
            for row in rows
            if row.scenario_id == scoped_scenario_id
            and (
                (row.subject_type == "logical_component" and row.subject_id in allowed_component_ids)
                or (row.subject_type == "physical_partition" and row.subject_id in allowed_partition_ids)
            )
        ]


@app.get("/api/quality/issues")
def get_quality_issues(scenario_id: str = "S2", team: str | None = None) -> list[dict[str, str]]:
    with Session(engine) as session:
        return quality_issues_for(session, scenario_id, team)


@app.get("/api/responsibilities/teams")
def get_responsibility_teams(scenario_id: str = "S2") -> list[str]:
    with Session(engine) as session:
        assignments = session.exec(
            select(ResponsibilityAssignment).where(ResponsibilityAssignment.scenario_id == scenario_id)
        ).all()
        teams = {assignment.team_name for assignment in assignments}
        teams.update(row.owner_team for row in session.exec(select(LogicalComponent)).all() if row.owner_team)
        return ["Architecture Team"] + sorted(team for team in teams if team != "Architecture Team")


@app.get("/api/dashboard")
def get_dashboard() -> dict[str, Any]:
    with Session(engine) as session:
        scenarios = [scenario_ui(session, row) for row in session.exec(select(Scenario)).all()]
        component_rows = session.exec(select(LogicalComponent).order_by(LogicalComponent.hierarchy_path)).all()
        components = [component_ui(session, row, "S2") for row in component_rows]
        partitions = [partition_ui(session, row) for row in session.exec(select(PhysicalPartition).where(PhysicalPartition.scenario_id == "S2")).all()]
        target = next((item for item in scenarios if item["id"] == "S2"), scenarios[0])
        parent_ids = {row.parent_id for row in component_rows if row.parent_id}
        leaf_ids = {row.id for row in component_rows if row.id not in parent_ids}
        leaf_components = [item for item in components if item["id"] in leaf_ids]
        sram_area = sum(item["sram_area"] for item in leaf_components)
        phy_area = sum(item["block_area"] for item in leaf_components if "phy" in item["resource"])
        resource_area = {"Logic + mixed": 0.0, "SRAM / memory": 0.0, "PHY / Analog": 0.0}
        for item in leaf_components:
            if "phy" in item["resource"]:
                resource_area["PHY / Analog"] += item["block_area"]
            elif "memory" in item["resource"] and "logic" not in item["resource"]:
                resource_area["SRAM / memory"] += item["block_area"]
            else:
                resource_area["Logic + mixed"] += item["block_area"]
        total = sum(resource_area.values()) or 1
        return {
            "target_scenario": target,
            "metrics": {
                "total_area": target["area"],
                "total_power": target["power"],
                "total_sram_area": round(sram_area, 2),
                "phy_area": round(phy_area, 1),
                "partition_count": len(partitions),
            },
            "resource_mix": [
                {"label": label, "value": round(value / total * 100), "tone": tone}
                for (label, value), tone in zip(resource_area.items(), ["bg-slate-900", "bg-slate-500", "bg-slate-300"])
            ],
            "projects": list(session.exec(select(Project)).all()),
            "scenarios": scenarios,
        }


IMPORT_SHEETS: dict[str, tuple[type[SQLModel], list[str], set[str]]] = {
    "module_definitions": (
        ModuleDefinition,
        ["id", "name", "module_type", "ip_owner", "reuse_class", "description"],
        {"id", "name", "module_type"},
    ),
    "projects": (
        Project,
        ["id", "name", "product_family", "generation", "owner", "phase"],
        {"id", "name", "product_family", "generation", "owner", "phase"},
    ),
    "scenarios": (
        Scenario,
        ["id", "project_id", "name", "scenario_type", "process_combo", "status"],
        {"id", "project_id", "name", "scenario_type", "process_combo", "status"},
    ),
    "tiers": (
        Tier,
        ["id", "scenario_id", "tier_index", "name", "process_id", "role", "orientation", "area_limit_mm2"],
        {"id", "scenario_id", "tier_index", "name", "process_id", "role"},
    ),
    "logical_components": (
        LogicalComponent,
        ["id", "project_id", "parent_id", "module_definition_id", "name", "instance_type", "resource_type", "function_domain", "hierarchy_path", "logical_instance_count", "description"],
        {"id", "project_id", "name", "instance_type", "resource_type", "function_domain", "hierarchy_path", "logical_instance_count"},
    ),
    "physical_partitions": (
        PhysicalPartition,
        ["id", "scenario_id", "logical_component_id", "tier_id", "partition_name", "partition_type", "physical_instance_count", "content_share", "description"],
        {"id", "scenario_id", "logical_component_id", "tier_id", "partition_name", "partition_type", "physical_instance_count"},
    ),
    "metrics": (
        Metric,
        ["id", "scenario_id", "subject_type", "subject_id", "metric_name", "metric_value", "metric_unit", "metric_category", "value_type", "corner", "workload", "confidence", "source_note", "created_at"],
        {"scenario_id", "subject_type", "subject_id", "metric_name", "metric_value", "value_type", "corner", "workload", "confidence"},
    ),
}

ALLOWED_SUBJECT_TYPES = {"logical_component", "physical_partition", "tier", "scenario"}
ALLOWED_VALUE_TYPES = {"number", "text", "boolean"}
ALLOWED_CONFIDENCE = {"approved", "review", "draft"}
ALLOWED_PARTITION_TYPES = {"full", "partial"}


def normalize_cell(value: Any) -> Any:
    if value == "":
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    return value


def read_sheet_rows(workbook_file: SpooledTemporaryFile[bytes], sheet_name: str, expected_columns: list[str], required_columns: set[str]) -> list[dict[str, Any]]:
    workbook = load_workbook(workbook_file, data_only=True)
    if sheet_name not in workbook.sheetnames:
        raise HTTPException(status_code=400, detail=f"Missing sheet: {sheet_name}")
    sheet = workbook[sheet_name]
    header = [str(cell.value or "").strip() for cell in sheet[1]]
    aliases = {"content_share": "partition_ratio"} if sheet_name == "physical_partitions" else {}
    missing = [column for column in expected_columns if column not in header and aliases.get(column) not in header]
    if missing:
        raise HTTPException(status_code=400, detail=f"Sheet {sheet_name} is missing columns: {', '.join(missing)}")
    indexes = {column: header.index(column if column in header else aliases[column]) for column in expected_columns}
    rows: list[dict[str, Any]] = []
    for row_index, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
        record = {column: normalize_cell(row[indexes[column]]) for column in expected_columns}
        if all(value is None for value in record.values()):
            continue
        missing_required = [column for column in required_columns if record.get(column) is None]
        if missing_required:
            raise HTTPException(status_code=400, detail=f"Sheet {sheet_name} row {row_index} missing required columns: {', '.join(missing_required)}")
        rows.append(record)
    return rows


def prepare_import_rows(all_rows: dict[str, list[dict[str, Any]]]) -> None:
    created = now_iso()
    for row in all_rows["projects"]:
        row.setdefault("description", "")
        row["created_at"] = row.get("created_at") or created
        row["updated_at"] = row.get("updated_at") or created
    for row in all_rows["scenarios"]:
        row.setdefault("description", "")
        row["created_at"] = row.get("created_at") or created
        row["updated_at"] = row.get("updated_at") or created
    for row in all_rows["tiers"]:
        row["thickness_um"] = row.get("thickness_um") or 0
        row.setdefault("description", "")
    for row in all_rows["logical_components"]:
        row["parent_id"] = row.get("parent_id") or None
        row["module_definition_id"] = row.get("module_definition_id") or None
        row["logical_instance_count"] = int(row["logical_instance_count"])
        row["owner_team"] = row.get("owner_team") or "Architecture Team"
        row["visibility_level"] = row.get("visibility_level") or "team"
        row["created_at"] = row.get("created_at") or created
        row["updated_at"] = row.get("updated_at") or created
    for row in all_rows["physical_partitions"]:
        row["physical_instance_count"] = int(row["physical_instance_count"])
        raw_content_share = row.get("content_share")
        row["content_share"] = normalized_content_share(row["partition_type"], float(raw_content_share) if raw_content_share is not None else None)
        row["partition_ratio"] = row["content_share"]
    for row in all_rows["metrics"]:
        row["metric_value"] = str(row["metric_value"])
        row["metric_unit"] = row.get("metric_unit") or ""
        row["metric_category"] = row.get("metric_category") or ""
        row["source_note"] = row.get("source_note") or ""
        row["created_at"] = row.get("created_at") or created
        if not row.get("id"):
            row["id"] = metric_id(row)


def validate_import_rows(all_rows: dict[str, list[dict[str, Any]]], existing_refs: dict[str, set[str]] | None = None) -> list[str]:
    errors: list[str] = []
    existing_refs = existing_refs or {}
    project_ids = {row["id"] for row in all_rows["projects"]} | existing_refs.get("projects", set())
    module_definition_ids = {row["id"] for row in all_rows["module_definitions"]} | existing_refs.get("module_definitions", set())
    scenario_ids = {row["id"] for row in all_rows["scenarios"]} | existing_refs.get("scenarios", set())
    tier_ids = {row["id"] for row in all_rows["tiers"]} | existing_refs.get("tiers", set())
    component_ids = {row["id"] for row in all_rows["logical_components"]} | existing_refs.get("logical_components", set())
    partition_ids = {row["id"] for row in all_rows["physical_partitions"]} | existing_refs.get("physical_partitions", set())

    for row in all_rows["scenarios"]:
        if row["project_id"] not in project_ids:
            errors.append(f"scenario {row['id']} references missing project_id {row['project_id']}")
    for row in all_rows["logical_components"]:
        if row["instance_type"] == "parent_residual":
            errors.append(f"logical_component {row['id']} uses parent_residual; residual/self area is computed from parent total metrics minus child metrics")
        if row["project_id"] not in project_ids:
            errors.append(f"logical_component {row['id']} references missing project_id {row['project_id']}")
        if row.get("parent_id") and row["parent_id"] not in component_ids:
            errors.append(f"logical_component {row['id']} references missing parent_id {row['parent_id']}")
        if row.get("module_definition_id") and row["module_definition_id"] not in module_definition_ids:
            errors.append(f"logical_component {row['id']} references missing module_definition_id {row['module_definition_id']}")
    for row in all_rows["tiers"]:
        if row["scenario_id"] not in scenario_ids:
            errors.append(f"tier {row['id']} references missing scenario_id {row['scenario_id']}")
    for row in all_rows["physical_partitions"]:
        if row["scenario_id"] not in scenario_ids:
            errors.append(f"physical_partition {row['id']} references missing scenario_id {row['scenario_id']}")
        if row["logical_component_id"] not in component_ids:
            errors.append(f"physical_partition {row['id']} references missing logical_component_id {row['logical_component_id']}")
        if row["tier_id"] not in tier_ids:
            errors.append(f"physical_partition {row['id']} references missing tier_id {row['tier_id']}")
        if row["partition_type"] not in ALLOWED_PARTITION_TYPES:
            errors.append(f"physical_partition {row['id']} uses unsupported partition_type {row['partition_type']}")
        if row["physical_instance_count"] < 0:
            errors.append(f"physical_partition {row['id']} has negative physical_instance_count")
        if row["content_share"] < 0:
            errors.append(f"physical_partition {row['id']} has negative content_share")
    for row in all_rows["metrics"]:
        if row["scenario_id"] not in scenario_ids:
            errors.append(f"metric {row['id']} references missing scenario_id {row['scenario_id']}")
        if row["subject_type"] not in ALLOWED_SUBJECT_TYPES:
            errors.append(f"metric {row['id']} uses unsupported subject_type {row['subject_type']}")
        if row["subject_type"] == "logical_component" and row["subject_id"] not in component_ids:
            errors.append(f"metric {row['id']} references missing logical_component subject_id {row['subject_id']}")
        if row["subject_type"] == "physical_partition" and row["subject_id"] not in partition_ids:
            errors.append(f"metric {row['id']} references missing physical_partition subject_id {row['subject_id']}")
        if row["subject_type"] == "tier" and row["subject_id"] not in tier_ids:
            errors.append(f"metric {row['id']} references missing tier subject_id {row['subject_id']}")
        if row["subject_type"] == "scenario" and row["subject_id"] not in scenario_ids:
            errors.append(f"metric {row['id']} references missing scenario subject_id {row['subject_id']}")
        if row["value_type"] not in ALLOWED_VALUE_TYPES:
            errors.append(f"metric {row['id']} uses unsupported value_type {row['value_type']}")
        if row["confidence"] not in ALLOWED_CONFIDENCE:
            errors.append(f"metric {row['id']} uses unsupported confidence {row['confidence']}")
        if row["value_type"] == "number":
            try:
                float(row["metric_value"])
            except (TypeError, ValueError):
                errors.append(f"metric {row['id']} has non-numeric metric_value {row['metric_value']}")
    return errors


def existing_reference_ids(session: Session) -> dict[str, set[str]]:
    return {
        "projects": {row.id for row in session.exec(select(Project)).all()},
        "module_definitions": {row.id for row in session.exec(select(ModuleDefinition)).all()},
        "scenarios": {row.id for row in session.exec(select(Scenario)).all()},
        "tiers": {row.id for row in session.exec(select(Tier)).all()},
        "logical_components": {row.id for row in session.exec(select(LogicalComponent)).all()},
        "physical_partitions": {row.id for row in session.exec(select(PhysicalPartition)).all()},
    }


def validate_team_import_scope(all_rows: dict[str, list[dict[str, Any]]], session: Session, team: str | None, scenario_id: str = "S2") -> list[str]:
    if is_global_team(team):
        return []

    errors: list[str] = []
    allowed_component_ids = allowed_component_ids_for_team(session, team, scenario_id) or set()
    if not allowed_component_ids:
        return [f"team {team} has no assigned component scope in scenario {scenario_id}"]

    existing_partitions = session.exec(select(PhysicalPartition).where(PhysicalPartition.scenario_id == scenario_id)).all()
    allowed_partition_ids = {row.id for row in existing_partitions if row.logical_component_id in allowed_component_ids}
    workbook_partition_ids = {row["id"] for row in all_rows["physical_partitions"] if row["logical_component_id"] in allowed_component_ids}
    allowed_partition_ids |= workbook_partition_ids

    immutable_logical_fields = {
        "project_id",
        "parent_id",
        "module_definition_id",
        "name",
        "instance_type",
        "resource_type",
        "function_domain",
        "hierarchy_path",
    }
    for row in all_rows["logical_components"]:
        if row["id"] not in allowed_component_ids:
            errors.append(f"logical_component {row['id']} is outside team scope {team}")
            continue
        existing = session.get(LogicalComponent, row["id"])
        if existing:
            for field in immutable_logical_fields:
                if (row.get(field) or None) != (getattr(existing, field) or None):
                    errors.append(f"logical_component {row['id']} cannot change structural field {field} in a team workbook")

    for row in all_rows["physical_partitions"]:
        if row["scenario_id"] != scenario_id:
            errors.append(f"physical_partition {row['id']} uses scenario_id {row['scenario_id']}, expected {scenario_id}")
        if row["logical_component_id"] not in allowed_component_ids:
            errors.append(f"physical_partition {row['id']} maps outside team scope {team}")

    for row in all_rows["metrics"]:
        if row["scenario_id"] != scenario_id:
            errors.append(f"metric {row['id']} uses scenario_id {row['scenario_id']}, expected {scenario_id}")
        if row["subject_type"] == "logical_component" and row["subject_id"] not in allowed_component_ids:
            errors.append(f"metric {row['id']} references logical_component outside team scope {team}")
        elif row["subject_type"] == "physical_partition" and row["subject_id"] not in allowed_partition_ids:
            errors.append(f"metric {row['id']} references physical_partition outside team scope {team}")
        elif row["subject_type"] in {"tier", "scenario"}:
            errors.append(f"metric {row['id']} uses shared subject_type {row['subject_type']}; team workbooks may only update logical_component or physical_partition metrics")

    return errors


def row_dict(row: SQLModel, columns: list[str]) -> dict[str, Any]:
    return {column: getattr(row, column, None) for column in columns}


def write_import_sheet(workbook: Workbook, sheet_name: str, columns: list[str], rows: list[dict[str, Any]], editable: bool = True) -> None:
    sheet = workbook.create_sheet(sheet_name)
    sheet.append(columns)
    for row in rows:
        sheet.append([row.get(column) for column in columns])

    header_fill = PatternFill("solid", fgColor="0F172A" if editable else "334155")
    header_font = Font(color="FFFFFF", bold=True)
    for cell in sheet[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")

    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for index, column in enumerate(columns, start=1):
        max_len = max([len(str(column))] + [len(str(row.get(column) or "")) for row in rows[:100]])
        sheet.column_dimensions[get_column_letter(index)].width = min(max(max_len + 2, 12), 36)

    if sheet_name == "metrics":
        validations = {
            "subject_type": ["logical_component", "physical_partition"],
            "value_type": sorted(ALLOWED_VALUE_TYPES),
            "corner": ["typical", "best", "worst"],
            "workload": ["nominal", "peak", "idle"],
            "confidence": sorted(ALLOWED_CONFIDENCE),
        }
        for column_name, values in validations.items():
            if column_name not in columns:
                continue
            column_letter = get_column_letter(columns.index(column_name) + 1)
            validation = DataValidation(type="list", formula1=f'"{",".join(values)}"', allow_blank=False)
            sheet.add_data_validation(validation)
            validation.add(f"{column_letter}2:{column_letter}500")

    if sheet_name == "physical_partitions":
        validations = {
            "partition_type": sorted(ALLOWED_PARTITION_TYPES),
        }
        for column_name, values in validations.items():
            if column_name not in columns:
                continue
            column_letter = get_column_letter(columns.index(column_name) + 1)
            validation = DataValidation(type="list", formula1=f'"{",".join(values)}"', allow_blank=False)
            sheet.add_data_validation(validation)
            validation.add(f"{column_letter}2:{column_letter}500")


def build_team_import_workbook(session: Session, team: str, scenario_id: str = "S2") -> str:
    allowed_component_ids = allowed_component_ids_for_team(session, team, scenario_id)
    if allowed_component_ids is None:
        raise HTTPException(status_code=400, detail="Team template is only generated for scoped teams. Use the full template for Architecture Team.")
    if not allowed_component_ids:
        raise HTTPException(status_code=404, detail=f"No component scope found for team {team}.")

    workbook = Workbook()
    workbook.remove(workbook.active)
    workbook.properties.title = f"SoC team import workbook - {team}"

    scope_sheet = workbook.create_sheet("responsibility_scope")
    scope_sheet.append(["field", "value"])
    scope_sheet.append(["team", team])
    scope_sheet.append(["scenario_id", scenario_id])
    scope_sheet.append(["editable_sheets", "logical_components, physical_partitions, metrics"])
    scope_sheet.append(["rule", "Do not edit rows outside this workbook. Shared reference sheets are context only."])
    for cell in scope_sheet[1]:
        cell.fill = PatternFill("solid", fgColor="0F172A")
        cell.font = Font(color="FFFFFF", bold=True)
    scope_sheet.column_dimensions["A"].width = 22
    scope_sheet.column_dimensions["B"].width = 90

    projects = [row_dict(row, IMPORT_SHEETS["projects"][1]) for row in session.exec(select(Project)).all()]
    scenarios = [row_dict(row, IMPORT_SHEETS["scenarios"][1]) for row in session.exec(select(Scenario)).all()]
    tiers = [row_dict(row, IMPORT_SHEETS["tiers"][1]) for row in session.exec(select(Tier).where(Tier.scenario_id == scenario_id).order_by(Tier.tier_index)).all()]

    components = session.exec(select(LogicalComponent).order_by(LogicalComponent.hierarchy_path)).all()
    scoped_components = [row for row in components if row.id in allowed_component_ids]
    module_definition_ids = {row.module_definition_id for row in scoped_components if row.module_definition_id}
    module_definitions = [
        row_dict(row, IMPORT_SHEETS["module_definitions"][1])
        for row in session.exec(select(ModuleDefinition)).all()
        if row.id in module_definition_ids
    ]
    logical_components = [row_dict(row, IMPORT_SHEETS["logical_components"][1]) for row in scoped_components]

    partitions = [
        row
        for row in session.exec(select(PhysicalPartition).where(PhysicalPartition.scenario_id == scenario_id)).all()
        if row.logical_component_id in allowed_component_ids
    ]
    physical_partitions = [row_dict(row, IMPORT_SHEETS["physical_partitions"][1]) for row in partitions]
    partition_ids = {row.id for row in partitions}

    metrics = [
        row
        for row in session.exec(select(Metric).where(Metric.scenario_id == scenario_id)).all()
        if (row.subject_type == "logical_component" and row.subject_id in allowed_component_ids)
        or (row.subject_type == "physical_partition" and row.subject_id in partition_ids)
    ]
    metric_rows = [row_dict(row, IMPORT_SHEETS["metrics"][1]) for row in metrics]

    sheet_rows = {
        "module_definitions": module_definitions,
        "projects": projects,
        "scenarios": scenarios,
        "tiers": tiers,
        "logical_components": logical_components,
        "physical_partitions": physical_partitions,
        "metrics": metric_rows,
    }
    editable_sheets = {"logical_components", "physical_partitions", "metrics"}
    for sheet_name, (_, columns, _) in IMPORT_SHEETS.items():
        write_import_sheet(workbook, sheet_name, columns, sheet_rows[sheet_name], sheet_name in editable_sheets)

    temp_file = NamedTemporaryFile(prefix=f"soc_{team.lower().replace(' ', '_')}_", suffix=".xlsx", delete=False)
    temp_file.close()
    workbook.save(temp_file.name)
    return temp_file.name


@app.post("/api/import/excel")
async def import_excel(file: UploadFile = File(...), team: str | None = None, scenario_id: str = "S2") -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported.")

    workbook_bytes = await file.read()
    all_rows: dict[str, list[dict[str, Any]]] = {}
    for sheet_name, (_, columns, required) in IMPORT_SHEETS.items():
        with SpooledTemporaryFile() as temp_file:
            temp_file.write(workbook_bytes)
            temp_file.seek(0)
            all_rows[sheet_name] = read_sheet_rows(temp_file, sheet_name, columns, required)
    prepare_import_rows(all_rows)

    imported: dict[str, int] = {}
    with Session(engine) as session:
        existing_refs = existing_reference_ids(session) if not is_global_team(team) else None
        errors = validate_import_rows(all_rows, existing_refs)
        errors.extend(validate_team_import_scope(all_rows, session, team, scenario_id))
        if errors:
            raise HTTPException(status_code=400, detail={"errors": errors})

        editable_sheets = set(IMPORT_SHEETS) if is_global_team(team) else {"logical_components", "physical_partitions", "metrics"}
        for sheet_name, (model, _, _) in IMPORT_SHEETS.items():
            count = 0
            if sheet_name not in editable_sheets:
                imported[sheet_name] = count
                continue
            for row in all_rows[sheet_name]:
                session.merge(model(**row))
                count += 1
            imported[sheet_name] = count
        session.commit()
    return {"filename": file.filename, "imported": imported, "errors": []}


@app.get("/api/import/template")
def get_import_template(background_tasks: BackgroundTasks, team: str | None = None, scenario_id: str = "S2") -> FileResponse:
    if not is_global_team(team):
        with Session(engine) as session:
            path = build_team_import_workbook(session, team or "", scenario_id)
        background_tasks.add_task(os.remove, path)
        safe_team = (team or "team").lower().replace(" ", "_")
        return FileResponse(
            path,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename=f"soc_team_import_{safe_team}_{scenario_id}.xlsx",
        )

    if not TEMPLATE_PATH.exists():
        raise HTTPException(status_code=404, detail="Import template has not been generated.")
    return FileResponse(
        TEMPLATE_PATH,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="soc_mapping_metrics_review_v7.xlsx",
    )
