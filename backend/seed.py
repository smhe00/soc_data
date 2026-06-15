from __future__ import annotations

from sqlalchemy import delete
from sqlmodel import Session, select

from . import db
from .models import (
    ApplicationScenario,
    ApplicationScenarioSelection,
    ImplOption,
    LogicalComponent,
    Metric,
    ModuleDefinition,
    OperatingPointSet,
    PhysicalMapping,
    PhysicalPartition,
    PowerDataset,
    ProcessNode,
    Project,
    ResponsibilityAssignment,
    Tier,
    PowerObservation,
)


def canonical_partition_name(component_name: str, category: str, tier_id: str, partition_type: str, partial_index: int = 0) -> str:
    base_name = f"{component_name}_{category}_{tier_id}"
    return f"{base_name}_P{partial_index}" if partition_type == "partial" else base_name


def seed_data() -> None:
    db.create_db_and_tables()
    created = db.now_iso()
    with Session(db.engine) as session:
        demo_impl_options = ["S1", "S2", "S3"]
        session.exec(delete(Metric).where(Metric.impl_option_id.in_(demo_impl_options)))
        session.exec(delete(PhysicalPartition).where(PhysicalPartition.impl_option_id.in_(demo_impl_options)))
        session.exec(delete(Tier).where(Tier.impl_option_id.in_(demo_impl_options)))
        session.exec(delete(ResponsibilityAssignment).where(ResponsibilityAssignment.project_id == "P001"))
        session.exec(delete(LogicalComponent).where(LogicalComponent.project_id == "P001"))
        session.exec(delete(ModuleDefinition).where(ModuleDefinition.id.like("MD_%")))
        session.exec(delete(ImplOption).where(ImplOption.id.in_(demo_impl_options)))
        session.exec(delete(Project).where(Project.id.in_(["P001", "P002"])))
        session.exec(delete(ApplicationScenarioSelection))
        session.exec(delete(PowerObservation))
        session.exec(delete(OperatingPointSet))
        session.exec(delete(PowerDataset))
        session.exec(delete(PhysicalMapping))
        session.exec(delete(ApplicationScenario))

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
        implOptions = [
            ImplOption(id="S1", project_id="P001", name="Monolithic N3E Baseline", impl_type="1 die", process_combo="N3E monolithic", description="Single large advanced-node die used as a planning baseline.", status="Medium", created_at=created, updated_at=created),
            ImplOption(id="S2", project_id="P001", name="3DIC Performance Option", impl_type="3 tiers W2W", process_combo="N3E logic + N5 SRAM/cache + N6 IO/analog", description="Compute logic on top tier, SRAM/cache and medium logic on middle tier, IO/PHY/always-on/analog on bottom tier.", status="High", created_at=created, updated_at=created),
            ImplOption(id="S3", project_id="P001", name="Cost-Optimized 2.5D Option", impl_type="2 dies on interposer", process_combo="N4P application die + N6 IO/cache die", description="Lower-risk split with a main application die and a companion cache/IO die.", status="Medium", created_at=created, updated_at=created),
        ]
        process_nodes = [
            ProcessNode(id="PN3E", foundry="TSMC", node_name="N3E", logic_density_mtr_per_mm2=235.0, sram_density_mb_per_mm2=1.85, logic_area_scale=1.00, sram_area_scale=1.00, block_area_scale=1.00, voltage_nominal=0.70, cost_factor=1.9, maturity_level="Ramp", description="Advanced high-performance mobile logic process; base area reference for demo logical metrics."),
            ProcessNode(id="PN4P", foundry="TSMC", node_name="N4P", logic_density_mtr_per_mm2=185.0, sram_density_mb_per_mm2=1.45, logic_area_scale=1.27, sram_area_scale=1.28, block_area_scale=1.18, voltage_nominal=0.74, cost_factor=1.45, maturity_level="Mature", description="Cost-optimized advanced mobile logic process."),
            ProcessNode(id="PN5", foundry="TSMC", node_name="N5", logic_density_mtr_per_mm2=171.3, sram_density_mb_per_mm2=1.35, logic_area_scale=1.37, sram_area_scale=1.37, block_area_scale=1.25, voltage_nominal=0.75, cost_factor=1.25, maturity_level="Production", description="Memory/cache-friendly advanced process."),
            ProcessNode(id="PN6", foundry="TSMC", node_name="N6", logic_density_mtr_per_mm2=118.0, sram_density_mb_per_mm2=1.05, logic_area_scale=1.99, sram_area_scale=1.76, block_area_scale=1.45, voltage_nominal=0.80, cost_factor=0.85, maturity_level="Mature", description="Mature companion die process for IO, PHY, always-on, and analog-friendly logic."),
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
            ModuleDefinition(id="MD_CPU_ALU", name="CPU_EXECUTION_UNIT", module_type="cpu_subblock", ip_owner="CPU Team", reuse_class="replicated", description="CPU execution and ALU datapath."),
            ModuleDefinition(id="MD_L1_CACHE", name="CPU_L1_CACHE", module_type="memory_macro", ip_owner="CPU Team", reuse_class="compiler_macro", description="L1 Instruction and Data cache."),
            ModuleDefinition(id="MD_L2_CACHE", name="CPU_L2_CACHE", module_type="memory_macro", ip_owner="CPU Team", reuse_class="compiler_macro", description="L2 cache macro."),
            ModuleDefinition(id="MD_DISPLAY_PIXEL_PROC", name="DISPLAY_PIXEL_PROCESSOR", module_type="display_subblock", ip_owner="Display Team", reuse_class="replicated", description="Pixel blending and color management pipe unit."),
            ModuleDefinition(id="MD_DISPLAY_PIPE_SRAM", name="DISPLAY_LINE_BUFFER", module_type="memory_macro", ip_owner="Display Team", reuse_class="compiler_macro", description="Display line buffer and FIFO SRAM."),
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
            ("B_CPU_P_ALU", "B_CPU_P", "MD_CPU_ALU", "P_CORE_ALU", "block", "logic", "CPU", 1, "CPU Core execution ALU datapath."),
            ("B_CPU_P_CTRL", "B_CPU_P", None, "P_CORE_CTRL", "block", "logic", "CPU", 1, "CPU Core control logic."),
            ("B_CPU_P_L1", "B_CPU_P", "MD_L1_CACHE", "P_CORE_L1_CACHE", "cache", "logic+memory", "CPU Cache", 1, "L1 Instruction and Data cache."),
            ("B_CPU_E", "B_CPU", "MD_CPU_E_CORE", "E_CORE", "block", "logic", "CPU", 4, "Four efficiency CPU cores."),
            ("B_CPU_E_ALU", "B_CPU_E", "MD_CPU_ALU", "E_CORE_ALU", "block", "logic", "CPU", 1, "Efficiency CPU Core execution ALU datapath."),
            ("B_CPU_E_CTRL", "B_CPU_E", None, "E_CORE_CTRL", "block", "logic", "CPU", 1, "Efficiency CPU Core control logic."),
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
            ("B_DPU_PIXEL_PROC", "B_DPU", "MD_DISPLAY_PIXEL_PROC", "DISPLAY_PIXEL_PROC", "block", "logic", "Display", 1, "Display compositor pixel processor block."),
            ("B_DPU_SRAM", "B_DPU", "MD_DISPLAY_PIPE_SRAM", "DISPLAY_PIPE_FIFO", "cache", "logic+memory", "Display", 1, "Display line buffer and FIFO SRAM."),
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
                impl_option_id="S2",
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
            Tier(id="T0", impl_option_id="S2", tier_index=0, name="Compute Logic Tier", process_id="PN3E", role="CPU/GPU/NPU/ISP/media high-performance logic", orientation="Face-down", thickness_um=42, area_limit_mm2=300.0, description="Advanced logic tier with hot compute blocks and fine-pitch hybrid bonding."),
            Tier(id="T1", impl_option_id="S2", tier_index=1, name="SRAM + Cache Tier", process_id="PN5", role="Large SRAM/cache plus medium logic", orientation="Face-up / Face-to-face", thickness_um=48, area_limit_mm2=250.0, description="Cache/SRAM-heavy tier serving CPU/GPU/NPU and modem memories."),
            Tier(id="T2", impl_option_id="S2", tier_index=2, name="IO + Always-On Tier", process_id="PN6", role="LPDDR/PHY/IO/security/AON/analog-friendly logic", orientation="Backside PDN", thickness_um=60, area_limit_mm2=180.0, description="Mature-node companion tier for IO PHYs, PMU, RF digital, and low-power islands."),
        ]

        logical_metric_values = {
            "B0": (2200, 84.0, 168.0, 285.0), "B_CPU": (620, 10.0, 28.0, 42.0),
            "B_CPU_P": (320, 0.0, 18.4, 20.2),
            "B_CPU_P_ALU": (160, 0.0, 10.0, 10.0),
            "B_CPU_P_CTRL": (80, 0.0, 5.0, 5.0),
            "B_CPU_P_L1": (80, 0.0, 2.0, 3.2),
            "B_CPU_E": (220, 0.0, 5.8, 6.5),
            "B_CPU_E_ALU": (120, 0.0, 3.5, 4.0),
            "B_CPU_E_CTRL": (60, 0.0, 1.5, 1.5),
            "B_CPU_L3": (180, 9.6, 2.1, 12.8),
            "B_GPU": (740, 10.5, 30.8, 44.0), "B_GPU_SHADER": (520, 0.0, 27.6, 30.2), "B_GPU_L2": (96, 8.6, 0.8, 9.9), "B_NPU": (680, 14.2, 24.7, 43.5), "B_NPU_TENSOR": (360, 0.0, 20.8, 22.4), "B_NPU_SRAM": (128, 12.8, 0.9, 14.2), "B_NPU_DMA": (104, 0.8, 2.5, 3.6),
            "B_ISP": (420, 4.0, 13.3, 19.0), "B_ISP_PIPE": (240, 1.8, 9.6, 12.0), "B_CV_DSP": (150, 1.2, 3.7, 5.2), "B_MEDIA": (240, 1.2, 7.8, 10.0), "B_VDEC": (120, 0.5, 3.6, 4.6), "B_VENC": (130, 0.6, 4.2, 5.3), "B_DISPLAY": (150, 0.8, 4.2, 5.6),
            "B_DPU": (120, 0.6, 3.6, 4.8),
            "B_DPU_PIXEL_PROC": (70, 0.0, 2.0, 3.0),
            "B_DPU_SRAM": (40, 0.4, 0.5, 1.0),
            "B_MODEM": (520, 7.8, 19.6, 31.0), "B_MODEM_DSP": (260, 1.6, 10.2, 12.6), "B_MODEM_SRAM": (90, 5.4, 0.7, 6.4), "B_MODEM_RF": (110, 0.8, 3.8, 5.1), "B_MEM": (260, 32.0, 6.0, 42.0), "B_SYS_CACHE": (80, 25.6, 0.9, 28.2), "B_LPDDR_CTRL": (180, 1.2, 4.8, 6.1), "B_NOC": (300, 0.8, 8.5, 10.5),
            "B_IO": (210, 0.5, 18.0, 24.0), "B_DDR_PHY": (70, 0.0, 8.8, 9.6), "B_UFS_PHY": (24, 0.0, 1.5, 1.8), "B_USB_PCIE_PHY": (42, 0.0, 2.8, 3.4), "B_MIPI_PHY": (52, 0.0, 3.6, 4.5), "B_SEC": (95, 1.2, 2.2, 4.0), "B_CRYPTO": (50, 0.2, 1.2, 1.7), "B_PMU": (86, 0.8, 2.8, 4.2),
        }
        logical_by_id = {component.id: component for component in logical_components}
        children_by_parent: dict[str, list[LogicalComponent]] = {}
        for component in logical_components:
            if component.parent_id:
                children_by_parent.setdefault(component.parent_id, []).append(component)

        def required_categories_for_seed(component_id: str) -> list[str]:
            values = logical_metric_values[component_id]
            child_values = [logical_metric_values[child.id] for child in children_by_parent.get(component_id, []) if child.id in logical_metric_values]
            if child_values:
                sram_area = values[1] - sum(row[1] for row in child_values)
                logic_area = values[2] - sum(row[2] for row in child_values)
                block_area = values[3] - sum(row[3] for row in child_values)
            else:
                sram_area, logic_area, block_area = values[1], values[2], values[3]
            categories = []
            if logic_area > 0.001:
                categories.append("logic")
            if sram_area > 0.001:
                categories.append("sram")
            if block_area > 0.001:
                categories.append("block")
            return categories or ["block"]

        mapping_specs = [
            ("B0", [("T0", 1, 0.45), ("T1", 1, 0.35), ("T2", 1, 0.20)]),
            ("B_CPU", [("T0", 1, 1.00)]),
            ("B_CPU_P", [("T0", 4, 1.00)]),
            ("B_CPU_P_ALU", [("T0", 4, 1.00)]),
            ("B_CPU_P_CTRL", [("T0", 4, 1.00)]),
            ("B_CPU_P_L1", [("T0", 4, 1.00)]),
            ("B_CPU_E", [("T0", 4, 1.00)]),
            ("B_CPU_E_ALU", [("T0", 4, 1.00)]),
            ("B_CPU_E_CTRL", [("T0", 4, 1.00)]),
            ("B_CPU_L3", [("T0", 1, 0.25), ("T1", 1, 0.75)]),
            ("B_GPU_SHADER", [("T0", 6, 1.00)]),
            ("B_GPU_L2", [("T1", 2, 1.00)]),
            ("B_GPU", [("T0", 1, 0.70), ("T1", 1, 0.30)]),
            ("B_NPU", [("T0", 1, 0.60), ("T1", 1, 0.40)]),
            ("B_NPU_TENSOR", [("T0", 4, 1.00), ("T1", 4, 1.00)]),
            ("B_NPU_SRAM", [("T1", 8, 1.00)]),
            ("B_NPU_DMA", [("T0", 1, 0.60), ("T1", 1, 0.40)]),
            ("B_ISP", [("T0", 1, 1.00)]),
            ("B_ISP_PIPE", [("T0", 2, 1.00), ("T1", 1, 1.00)]),
            ("B_CV_DSP", [("T0", 1, 1.00)]),
            ("B_MEDIA", [("T0", 1, 1.00)]),
            ("B_VDEC", [("T0", 1, 1.00)]),
            ("B_VENC", [("T0", 1, 1.00)]),
            ("B_DISPLAY", [("T0", 1, 1.00)]),
            ("B_DPU", [("T0", 2, 1.00)]),
            ("B_DPU_PIXEL_PROC", [("T0", 2, 1.00)]),
            ("B_DPU_SRAM", [("T0", 2, 1.00)]),
            ("B_MODEM", [("T2", 1, 1.00)]),
            ("B_MODEM_DSP", [("T0", 2, 1.00)]),
            ("B_MODEM_SRAM", [("T1", 4, 1.00)]),
            ("B_MODEM_RF", [("T2", 1, 1.00)]),
            ("B_MEM", [("T1", 1, 0.60), ("T2", 1, 0.40)]),
            ("B_SYS_CACHE", [("T1", 1, 1.00)]),
            ("B_LPDDR_CTRL", [("T2", 4, 1.00)]),
            ("B_NOC", [("T0", 1, 0.55), ("T1", 1, 0.30), ("T2", 1, 0.15)]),
            ("B_IO", [("T2", 1, 1.00)]),
            ("B_DDR_PHY", [("T2", 4, 1.00)]),
            ("B_UFS_PHY", [("T2", 1, 1.00)]),
            ("B_USB_PCIE_PHY", [("T2", 1, 1.00)]),
            ("B_MIPI_PHY", [("T2", 6, 1.00)]),
            ("B_CRYPTO", [("T2", 1, 1.00)]),
            ("B_SEC", [("T2", 1, 1.00)]),
            ("B_PMU", [("T2", 1, 1.00)]),
        ]
        partition_rows: list[tuple[str, str, str, str, str, str, int, float]] = []
        for component_id, placements in mapping_specs:
            comp = logical_by_id[component_id]
            component_name = comp.name
            
            # calculate parent multiplier to convert absolute counts in mapping_specs to relative
            curr = comp.parent_id
            parent_mult = 1
            while curr:
                p = logical_by_id[curr]
                parent_mult *= p.logical_instance_count
                curr = p.parent_id
                
            relative_placements = []
            for tier_id, count, share in placements:
                rel_count = count / parent_mult
                if rel_count.is_integer():
                    rel_count = int(rel_count)
                relative_placements.append((tier_id, rel_count, share))
                
            for category in required_categories_for_seed(component_id):
                partial_index = 0
                full_copy_count = sum(c for _, c, share in relative_placements if abs(share - 1.0) < 0.001)
                is_split = not (full_copy_count == comp.logical_instance_count and all(abs(share - 1.0) < 0.001 for _, _, share in relative_placements))
                for tier_id, count, share in relative_placements:
                    partition_type = "partial" if is_split else "full"
                    if partition_type == "partial":
                        partial_index += 1
                    partition_name = canonical_partition_name(component_name, category, tier_id, partition_type, partial_index)
                    partition_rows.append((f"PP_{partition_name}", component_id, tier_id, partition_name, partition_type, category, count, share))
        partitions = [
            PhysicalPartition(id=id, impl_option_id="S2", logical_component_id=logical_id, tier_id=tier_id, partition_name=name, partition_type=ptype, resource_category=category, physical_instance_count=count, partition_ratio=1.0 if ptype == "full" else ratio, content_share=1.0 if ptype == "full" else ratio, description=f"{name} maps {category} content of {logical_id} to {tier_id}.")
            for id, logical_id, tier_id, name, ptype, category, count, ratio in partition_rows
        ]
        def category_area_for_seed(component_id: str, category: str) -> float:
            values = logical_metric_values[component_id]
            child_values = [logical_metric_values[child.id] for child in children_by_parent.get(component_id, []) if child.id in logical_metric_values]
            index = {"sram": 1, "logic": 2, "block": 3}[category]
            value = values[index] - sum(row[index] for row in child_values) if child_values else values[index]
            return max(0.0, value)

        partition_metric_values: dict[str, tuple[float, float, float, str]] = {}
        rows_by_component_category: dict[tuple[str, str], list[tuple[str, str, str, str, str, str, int, float]]] = {}
        for row in partition_rows:
            rows_by_component_category.setdefault((row[1], row[5]), []).append(row)
        for (component_id, category), rows in rows_by_component_category.items():
            category_area = category_area_for_seed(component_id, category)
            total_equivalent = sum(count * (1.0 if ptype == "full" else ratio) for _, _, _, _, ptype, _, count, ratio in rows) or 1.0
            for partition_id, _logical_id, tier_id, _name, ptype, _category, count, ratio in rows:
                equivalent = count * (1.0 if ptype == "full" else ratio)
                share = equivalent / total_equivalent
                logic_area = round(category_area * share, 3) if category == "logic" else 0.0
                sram_area = round(category_area * share, 3) if category == "sram" else 0.0
                block_area = round(category_area * share, 3) if category == "block" else 0.0
                partition_metric_values[partition_id] = (logic_area, sram_area, block_area, f"{category}_{tier_id.lower()}")
        metrics: list[Metric] = []
        for component_id, (signals, sram_area, logic_area, block_area) in logical_metric_values.items():
            for name, value, unit, category, workload in [("signal_count_total", signals, "count", "logical", "nominal"), ("logic_area", logic_area, "mm2", "logical_area", "nominal"), ("sram_area", sram_area, "mm2", "logical_area", "nominal"), ("block_area", block_area, "mm2", "logical_area", "nominal")]:
                metrics.append(metric(f"M_LOG_{component_id}_{name.upper()}", "S2", "logical_component", component_id, name, value, unit, category, "number", "typical", workload, "review", "Architecture planning estimate for the realistic mobile SoC demo."))
        for partition_id, (logic_area, sram_area, block_area, shape_type) in partition_metric_values.items():
            for name, value, unit, category, workload, value_type in [("logic_area", logic_area, "mm2", "implementation_area", "nominal", "number"), ("sram_area", sram_area, "mm2", "implementation_area", "nominal", "number"), ("block_area", block_area, "mm2", "implementation_area", "nominal", "number"), ("shape_type", shape_type, "", "physical_shape", "nominal", "text")]:
                metrics.append(metric(f"M_PART_{partition_id}_{name.upper()}", "S2", "physical_partition", partition_id, name, value, unit, category, value_type, "typical", workload, "review", "Physical partition estimate for the realistic mobile SoC demo."))
        metrics.extend([
            metric("M_TIER_T0_POWER", "S2", "tier", "T0", "power", 31.2, "W", "power", "number", "typical", "peak", "review", "Compute-tier peak budget."),
            metric("M_TIER_T1_POWER", "S2", "tier", "T1", "power", 8.7, "W", "power", "number", "typical", "peak", "review", "SRAM/cache-tier peak budget."),
            metric("M_TIER_T2_POWER", "S2", "tier", "T2", "power", 5.4, "W", "power", "number", "typical", "peak", "review", "IO/always-on tier peak budget."),
            metric("M_TIER_T0_UTIL", "S2", "tier", "T0", "utilization", 78, "%", "physical", "number", "typical", "nominal", "review", "Tier utilization target."),
            metric("M_TIER_T1_UTIL", "S2", "tier", "T1", "utilization", 71, "%", "physical", "number", "typical", "nominal", "review", "Tier utilization target."),
            metric("M_TIER_T2_UTIL", "S2", "tier", "T2", "utilization", 63, "%", "physical", "number", "typical", "nominal", "review", "Tier utilization target."),
            metric("M_IMPL_OPTION_S1_AREA", "S1", "impl_option", "S1", "area", 182.0, "mm2", "physical", "number", "typical", "nominal", "review", "Monolithic N3E planning estimate including keepout and IO ring."),
            metric("M_IMPL_OPTION_S1_POWER", "S1", "impl_option", "S1", "power", 49.5, "W", "power", "number", "typical", "peak", "review", "Monolithic peak workload power."),
            metric("M_IMPL_OPTION_S2_AREA", "S2", "impl_option", "S2", "area", 119.0, "mm2", "physical", "number", "typical", "nominal", "review", "Projected exposed package footprint for the 3-tier option."),
            metric("M_IMPL_OPTION_S2_POWER", "S2", "impl_option", "S2", "power", 45.3, "W", "power", "number", "typical", "peak", "review", "3DIC peak workload power with shorter memory paths."),
            metric("M_IMPL_OPTION_S3_AREA", "S3", "impl_option", "S3", "area", 143.0, "mm2", "physical", "number", "typical", "nominal", "review", "2.5D option exposed package footprint estimate."),
            metric("M_IMPL_OPTION_S3_POWER", "S3", "impl_option", "S3", "power", 47.0, "W", "power", "number", "typical", "peak", "review", "2.5D option peak workload power."),
        ])

        app_scenarios = [
            ApplicationScenario(id="AS_MODULE_LIBRARY", project_id="P001", name="Module Use Case Library", category="Internal", description="Internal library bucket for module use case/Profile power values. Application scenarios select from these rows."),
            ApplicationScenario(id="AS_STANDBY_AOD", project_id="P001", name="Standby Always-On Display", category="Everyday", description="Phone in pocket or on desk with AOD, sensor hub, modem paging, and minimal memory retention."),
            ApplicationScenario(id="AS_UI_BROWSING", project_id="P001", name="Interactive UI + Web Browsing", category="Everyday", description="Foreground browser/social feed scrolling with display, modem, CPU bursts, light GPU composition, and memory traffic."),
            ApplicationScenario(id="AS_VIDEO_PLAYBACK", project_id="P001", name="4K HDR Video Playback", category="Multimedia", description="Local or streaming 4K HDR playback using video decode, display pipeline, memory subsystem, and light CPU control."),
            ApplicationScenario(id="AS_CAMERA_4K60", project_id="P001", name="Camera 4K60 Recording", category="Multimedia", description="Sustained 4K 60FPS recording with ISP, video encode, NPU denoise, display preview, IO, and memory traffic."),
            ApplicationScenario(id="AS_GAMING_SUSTAINED", project_id="P001", name="3D Gaming Sustained", category="Gaming", description="Thermal-sustained 3D gaming with GPU rendering, CPU game threads, display refresh, memory bandwidth, and fabric traffic."),
            ApplicationScenario(id="AS_AI_BURST", project_id="P001", name="AI Photo Enhancement Burst", category="AI", description="Short burst of local AI photo enhancement using NPU tensor compute, CPU dispatch, ISP preprocessing, and memory movement."),
            ApplicationScenario(id="AS_5G_VIDEO_CALL", project_id="P001", name="5G Video Call", category="Connectivity", description="Two-way video call with 5G modem, camera pipeline, video codec, display, CPU control, and IO activity."),
        ]
        
        phys_mappings = [
            PhysicalMapping(id="PM_2D_BASE", impl_option_id="S1", name="2D_BASELINE_MAPPING_V01", mapping_version="V01", description="Baseline monolithic 2D die mapping.", mapping_json='{"SOC_TOP": "monolithic"}'),
            PhysicalMapping(id="PM_3DIC_A", impl_option_id="S2", name="3DIC_A_MAPPING_V02", mapping_version="V02", description="3DIC split-die mapping with SRAM cache stacked on Middle Tier.", mapping_json='{"NPU_TOP": "T0/T1 split", "GPU_TOP": "T0/T1 split", "CPU_CLUSTER": "T0"}'),
        ]
        power_datasets = [
            PowerDataset(
                id="PM_2D_BASE",
                project_id="P001",
                impl_option_id="S1",
                name="2D Baseline Architecture Estimate",
                dataset_type="architecture_estimate",
                development_stage="architecture_estimate",
                source_type="architecture_planning",
                confidence="review",
                dataset_version="V01",
                related_physical_mapping_id="PM_2D_BASE",
                description="Initial rough power dataset for the monolithic 2D baseline.",
                context_json='{"scope": "module_usecase_library", "legacy_mapping_name": "2D_BASELINE_MAPPING_V01"}',
                created_at=created,
                updated_at=created,
            ),
            PowerDataset(
                id="PM_3DIC_A",
                project_id="P001",
                impl_option_id="S2",
                name="3DIC A Architecture Estimate",
                dataset_type="architecture_estimate",
                development_stage="architecture_estimate",
                source_type="architecture_planning",
                confidence="review",
                dataset_version="V02",
                related_physical_mapping_id="PM_3DIC_A",
                description="Initial rough module use case/Profile power dataset for the 3DIC performance option.",
                context_json='{"scope": "module_usecase_library", "legacy_mapping_name": "3DIC_A_MAPPING_V02"}',
                created_at=created,
                updated_at=created,
            ),
        ]
        
        op_point_sets = [
            OperatingPointSet(id="OP_DEFAULT", project_id="P001", name="Default", description="Default module Profile. Available to every module; it belongs to a module only after a saved module power value uses it.", op_json="{}"),
            OperatingPointSet(id="OP_STANDBY_AOD", project_id="P001", name="Standby_AOD", description="Low-voltage always-on state for AOD and sensor/modem paging.", op_json='{"SOC_TOP": {"mode": "retention"}, "AON_PMU_SENSOR_HUB": {"voltage_v": 0.55, "frequency_mhz": 26}, "DISPLAY_TOP": {"refresh_hz": 1}}'),
            OperatingPointSet(id="OP_UI_BALANCED", project_id="P001", name="UI_Balanced", description="Balanced interactive profile for browsing and app UI.", op_json='{"CPU_CLUSTER": {"voltage_v": 0.72, "frequency_mhz": 1800}, "GPU_TOP": {"voltage_v": 0.62, "frequency_mhz": 350}, "DISPLAY_TOP": {"refresh_hz": 120}}'),
            OperatingPointSet(id="OP_VIDEO_PLAYBACK", project_id="P001", name="Video_Playback", description="Media playback profile with video decoder and display active.", op_json='{"MEDIA_TOP": {"voltage_v": 0.68, "frequency_mhz": 600}, "DISPLAY_TOP": {"refresh_hz": 60}, "CPU_CLUSTER": {"frequency_mhz": 900}}'),
            OperatingPointSet(id="OP_CAMERA_4K60", project_id="P001", name="Camera_4K60", description="Camera capture profile calibrated for sustained 4K60 recording.", op_json='{"ISP_TOP": {"voltage_v": 0.72, "frequency_mhz": 900}, "VIDEO_ENCODER": {"frequency_mhz": 700}, "NPU_TOP": {"voltage_v": 0.70, "frequency_mhz": 1000}}'),
            OperatingPointSet(id="OP_GAMING_SUSTAINED", project_id="P001", name="Gaming_Sustained", description="Sustained thermal-limit operating points for gaming.", op_json='{"CPU_CLUSTER": {"voltage_v": 0.80, "frequency_mhz": 2200}, "GPU_TOP": {"voltage_v": 0.72, "frequency_mhz": 650}, "DISPLAY_TOP": {"refresh_hz": 120}}'),
            OperatingPointSet(id="OP_AI_BURST", project_id="P001", name="AI_Burst", description="Peak performance burst operating points for short local AI runs.", op_json='{"CPU_CLUSTER": {"voltage_v": 0.86, "frequency_mhz": 2600}, "NPU_TOP": {"voltage_v": 0.82, "frequency_mhz": 1500}, "MEMORY_SUBSYSTEM": {"bandwidth_gbps": 90}}'),
            OperatingPointSet(id="OP_5G_VIDEO_CALL", project_id="P001", name="5G_Video_Call", description="Connectivity and media profile for uplink/downlink video call.", op_json='{"5G_MODEM_TOP": {"mode": "sub6_active"}, "ISP_TOP": {"frequency_mhz": 550}, "VIDEO_ENCODER": {"frequency_mhz": 450}, "DISPLAY_TOP": {"refresh_hz": 60}}'),
        ]
        def safe_key(value: str | None) -> str:
            return (value or "Default").replace(" ", "_").replace("/", "_").replace("-", "_").upper()

        module_usecase_specs = [
            ("B0", "AOD_System_Total", "OP_STANDBY_AOD", 0.145, "review"),
            ("B_PMU", "AOD_SensorHub", "OP_STANDBY_AOD", 0.038, "approved"),
            ("B_DISPLAY", "AOD_1Hz_Panel", "OP_STANDBY_AOD", 0.045, "approved"),
            ("B_MODEM", "Modem_Paging", "OP_STANDBY_AOD", 0.024, "review"),
            ("B_MEM", "Memory_Retention", "OP_STANDBY_AOD", 0.018, "review"),
            ("B_SEC", "Secure_Heartbeat", "OP_STANDBY_AOD", 0.006, "review"),
            ("B_IO", "LowSpeed_IO_Idle", "OP_STANDBY_AOD", 0.010, "review"),

            ("B0", "UI_Browsing_Total", "OP_UI_BALANCED", 2.65, "review"),
            ("B_CPU", "UI_App_Bursts", "OP_UI_BALANCED", 0.78, "approved"),
            ("B_GPU", "UI_Composition", "OP_UI_BALANCED", 0.34, "approved"),
            ("B_DISPLAY", "Display_120Hz_UI", "OP_UI_BALANCED", 0.48, "approved"),
            ("B_MODEM", "Web_Data_Bursty", "OP_UI_BALANCED", 0.26, "review"),
            ("B_MEM", "Browser_Memory_Traffic", "OP_UI_BALANCED", 0.32, "review"),
            ("B_NOC", "Interactive_Fabric", "OP_UI_BALANCED", 0.18, "review"),
            ("B_IO", "Storage_And_MIPI_Active", "OP_UI_BALANCED", 0.11, "review"),
            ("B_PMU", "Active_Power_Control", "OP_UI_BALANCED", 0.055, "review"),
            ("B_SEC", "TLS_Crypto_Assist", "OP_UI_BALANCED", 0.035, "review"),

            ("B0", "Video_Playback_Total", "OP_VIDEO_PLAYBACK", 1.95, "approved"),
            ("B_MEDIA", "Video_Decode_4K_HDR", "OP_VIDEO_PLAYBACK", 0.58, "approved"),
            ("B_DISPLAY", "HDR_Display_60Hz", "OP_VIDEO_PLAYBACK", 0.56, "approved"),
            ("B_CPU", "Playback_Control", "OP_VIDEO_PLAYBACK", 0.18, "approved"),
            ("B_GPU", "Video_Overlay_Composition", "OP_VIDEO_PLAYBACK", 0.08, "review"),
            ("B_MEM", "Video_Buffer_Traffic", "OP_VIDEO_PLAYBACK", 0.28, "review"),
            ("B_NOC", "Media_Fabric", "OP_VIDEO_PLAYBACK", 0.13, "review"),
            ("B_IO", "Display_PHY_Active", "OP_VIDEO_PLAYBACK", 0.09, "review"),
            ("B_PMU", "Playback_Power_Control", "OP_VIDEO_PLAYBACK", 0.045, "review"),

            ("B0", "Camera_4K60_Total", "OP_CAMERA_4K60", 5.35, "review"),
            ("B_ISP", "ISP_4K60_TriplePipe", "OP_CAMERA_4K60", 1.20, "approved"),
            ("B_MEDIA", "Video_Encode_4K60", "OP_CAMERA_4K60", 0.78, "approved"),
            ("B_NPU", "NPU_Denoise_HDR", "OP_CAMERA_4K60", 0.90, "review"),
            ("B_CPU", "Camera_App_Control", "OP_CAMERA_4K60", 0.45, "approved"),
            ("B_GPU", "Preview_Composition", "OP_CAMERA_4K60", 0.25, "review"),
            ("B_DISPLAY", "Camera_Preview_Display", "OP_CAMERA_4K60", 0.28, "approved"),
            ("B_MEM", "Camera_Frame_Buffer", "OP_CAMERA_4K60", 0.58, "review"),
            ("B_NOC", "Camera_Fabric_Traffic", "OP_CAMERA_4K60", 0.32, "review"),
            ("B_IO", "MIPI_CSI_DPHY_Active", "OP_CAMERA_4K60", 0.46, "review"),
            ("B_PMU", "Camera_Power_Control", "OP_CAMERA_4K60", 0.075, "review"),

            ("B0", "Gaming_Sustained_Total", "OP_GAMING_SUSTAINED", 6.95, "review"),
            ("B_GPU", "GPU_3D_Render_120Hz", "OP_GAMING_SUSTAINED", 3.25, "approved"),
            ("B_CPU", "CPU_Game_Threads", "OP_GAMING_SUSTAINED", 1.35, "approved"),
            ("B_DISPLAY", "Gaming_Display_120Hz", "OP_GAMING_SUSTAINED", 0.58, "approved"),
            ("B_MEM", "Gaming_Memory_Bandwidth", "OP_GAMING_SUSTAINED", 0.72, "review"),
            ("B_NOC", "Gaming_Fabric", "OP_GAMING_SUSTAINED", 0.46, "review"),
            ("B_NPU", "Game_AI_Assist_Light", "OP_GAMING_SUSTAINED", 0.16, "review"),
            ("B_IO", "Touch_Audio_IO", "OP_GAMING_SUSTAINED", 0.15, "review"),
            ("B_PMU", "Thermal_Power_Control", "OP_GAMING_SUSTAINED", 0.085, "review"),
            ("B_SEC", "Game_Security_Services", "OP_GAMING_SUSTAINED", 0.025, "review"),

            ("B0", "AI_Photo_Burst_Total", "OP_AI_BURST", 6.35, "measured"),
            ("B_NPU", "NPU_Photo_Enhance", "OP_AI_BURST", 3.75, "measured"),
            ("B_CPU", "AI_Dispatch_PrePost", "OP_AI_BURST", 0.82, "approved"),
            ("B_GPU", "AI_Preview_Composition", "OP_AI_BURST", 0.25, "review"),
            ("B_ISP", "Photo_Preprocess", "OP_AI_BURST", 0.36, "review"),
            ("B_MEM", "AI_Tensor_Buffer_Traffic", "OP_AI_BURST", 0.66, "review"),
            ("B_NOC", "AI_Fabric_Traffic", "OP_AI_BURST", 0.36, "review"),
            ("B_IO", "Image_Storage_IO", "OP_AI_BURST", 0.08, "review"),
            ("B_PMU", "Burst_Power_Control", "OP_AI_BURST", 0.06, "review"),

            ("B0", "5G_Video_Call_Total", "OP_5G_VIDEO_CALL", 3.70, "review"),
            ("B_MODEM", "5G_Sub6_VideoCall", "OP_5G_VIDEO_CALL", 1.20, "approved"),
            ("B_ISP", "FrontCamera_1080p", "OP_5G_VIDEO_CALL", 0.45, "approved"),
            ("B_MEDIA", "VideoCall_Codec", "OP_5G_VIDEO_CALL", 0.32, "approved"),
            ("B_CPU", "VideoCall_App_Stack", "OP_5G_VIDEO_CALL", 0.56, "approved"),
            ("B_DISPLAY", "VideoCall_Display", "OP_5G_VIDEO_CALL", 0.40, "approved"),
            ("B_MEM", "VideoCall_Memory_Traffic", "OP_5G_VIDEO_CALL", 0.28, "review"),
            ("B_NOC", "VideoCall_Fabric", "OP_5G_VIDEO_CALL", 0.23, "review"),
            ("B_IO", "RF_MIPI_USB_IO", "OP_5G_VIDEO_CALL", 0.18, "review"),
            ("B_PMU", "Connectivity_Power_Control", "OP_5G_VIDEO_CALL", 0.065, "review"),
        ]

        scenario_compositions = {
            "AS_STANDBY_AOD": [("B0", "AOD_System_Total", "OP_STANDBY_AOD", False), ("B_PMU", "AOD_SensorHub", "OP_STANDBY_AOD", True), ("B_DISPLAY", "AOD_1Hz_Panel", "OP_STANDBY_AOD", True), ("B_MODEM", "Modem_Paging", "OP_STANDBY_AOD", True), ("B_MEM", "Memory_Retention", "OP_STANDBY_AOD", True), ("B_SEC", "Secure_Heartbeat", "OP_STANDBY_AOD", True), ("B_IO", "LowSpeed_IO_Idle", "OP_STANDBY_AOD", True)],
            "AS_UI_BROWSING": [("B0", "UI_Browsing_Total", "OP_UI_BALANCED", False), ("B_CPU", "UI_App_Bursts", "OP_UI_BALANCED", True), ("B_GPU", "UI_Composition", "OP_UI_BALANCED", True), ("B_DISPLAY", "Display_120Hz_UI", "OP_UI_BALANCED", True), ("B_MODEM", "Web_Data_Bursty", "OP_UI_BALANCED", True), ("B_MEM", "Browser_Memory_Traffic", "OP_UI_BALANCED", True), ("B_NOC", "Interactive_Fabric", "OP_UI_BALANCED", True), ("B_IO", "Storage_And_MIPI_Active", "OP_UI_BALANCED", True), ("B_PMU", "Active_Power_Control", "OP_UI_BALANCED", True), ("B_SEC", "TLS_Crypto_Assist", "OP_UI_BALANCED", True)],
            "AS_VIDEO_PLAYBACK": [("B0", "Video_Playback_Total", "OP_VIDEO_PLAYBACK", False), ("B_MEDIA", "Video_Decode_4K_HDR", "OP_VIDEO_PLAYBACK", True), ("B_DISPLAY", "HDR_Display_60Hz", "OP_VIDEO_PLAYBACK", True), ("B_CPU", "Playback_Control", "OP_VIDEO_PLAYBACK", True), ("B_GPU", "Video_Overlay_Composition", "OP_VIDEO_PLAYBACK", True), ("B_MEM", "Video_Buffer_Traffic", "OP_VIDEO_PLAYBACK", True), ("B_NOC", "Media_Fabric", "OP_VIDEO_PLAYBACK", True), ("B_IO", "Display_PHY_Active", "OP_VIDEO_PLAYBACK", True), ("B_PMU", "Playback_Power_Control", "OP_VIDEO_PLAYBACK", True)],
            "AS_CAMERA_4K60": [("B0", "Camera_4K60_Total", "OP_CAMERA_4K60", False), ("B_ISP", "ISP_4K60_TriplePipe", "OP_CAMERA_4K60", True), ("B_MEDIA", "Video_Encode_4K60", "OP_CAMERA_4K60", True), ("B_NPU", "NPU_Denoise_HDR", "OP_CAMERA_4K60", True), ("B_CPU", "Camera_App_Control", "OP_CAMERA_4K60", True), ("B_GPU", "Preview_Composition", "OP_CAMERA_4K60", True), ("B_DISPLAY", "Camera_Preview_Display", "OP_CAMERA_4K60", True), ("B_MEM", "Camera_Frame_Buffer", "OP_CAMERA_4K60", True), ("B_NOC", "Camera_Fabric_Traffic", "OP_CAMERA_4K60", True), ("B_IO", "MIPI_CSI_DPHY_Active", "OP_CAMERA_4K60", True), ("B_PMU", "Camera_Power_Control", "OP_CAMERA_4K60", True)],
            "AS_GAMING_SUSTAINED": [("B0", "Gaming_Sustained_Total", "OP_GAMING_SUSTAINED", False), ("B_GPU", "GPU_3D_Render_120Hz", "OP_GAMING_SUSTAINED", True), ("B_CPU", "CPU_Game_Threads", "OP_GAMING_SUSTAINED", True), ("B_DISPLAY", "Gaming_Display_120Hz", "OP_GAMING_SUSTAINED", True), ("B_MEM", "Gaming_Memory_Bandwidth", "OP_GAMING_SUSTAINED", True), ("B_NOC", "Gaming_Fabric", "OP_GAMING_SUSTAINED", True), ("B_NPU", "Game_AI_Assist_Light", "OP_GAMING_SUSTAINED", True), ("B_IO", "Touch_Audio_IO", "OP_GAMING_SUSTAINED", True), ("B_PMU", "Thermal_Power_Control", "OP_GAMING_SUSTAINED", True), ("B_SEC", "Game_Security_Services", "OP_GAMING_SUSTAINED", True)],
            "AS_AI_BURST": [("B0", "AI_Photo_Burst_Total", "OP_AI_BURST", False), ("B_NPU", "NPU_Photo_Enhance", "OP_AI_BURST", True), ("B_CPU", "AI_Dispatch_PrePost", "OP_AI_BURST", True), ("B_GPU", "AI_Preview_Composition", "OP_AI_BURST", True), ("B_ISP", "Photo_Preprocess", "OP_AI_BURST", True), ("B_MEM", "AI_Tensor_Buffer_Traffic", "OP_AI_BURST", True), ("B_NOC", "AI_Fabric_Traffic", "OP_AI_BURST", True), ("B_IO", "Image_Storage_IO", "OP_AI_BURST", True), ("B_PMU", "Burst_Power_Control", "OP_AI_BURST", True)],
            "AS_5G_VIDEO_CALL": [("B0", "5G_Video_Call_Total", "OP_5G_VIDEO_CALL", False), ("B_MODEM", "5G_Sub6_VideoCall", "OP_5G_VIDEO_CALL", True), ("B_ISP", "FrontCamera_1080p", "OP_5G_VIDEO_CALL", True), ("B_MEDIA", "VideoCall_Codec", "OP_5G_VIDEO_CALL", True), ("B_CPU", "VideoCall_App_Stack", "OP_5G_VIDEO_CALL", True), ("B_DISPLAY", "VideoCall_Display", "OP_5G_VIDEO_CALL", True), ("B_MEM", "VideoCall_Memory_Traffic", "OP_5G_VIDEO_CALL", True), ("B_NOC", "VideoCall_Fabric", "OP_5G_VIDEO_CALL", True), ("B_IO", "RF_MIPI_USB_IO", "OP_5G_VIDEO_CALL", True), ("B_PMU", "Connectivity_Power_Control", "OP_5G_VIDEO_CALL", True)],
        }

        module_power_obs = [
            PowerObservation(
                id=f"PUC_S2_PM_3DIC_A_{safe_key(component_id)}_{safe_key(use_case)}_{safe_key(op_id)}",
                project_id="P001",
                impl_option_id="S2",
                physical_mapping_id="PM_3DIC_A",
                application_scenario_id="AS_MODULE_LIBRARY",
                operating_point_set_id=op_id,
                scope_type="component",
                scope_id=component_id,
                scope_name=logical_by_id[component_id].name,
                use_case_name=use_case,
                time_window_name="steady_state",
                statistic_type="average",
                power_type="total",
                power_value_w=power_w,
                development_stage="architecture_estimate",
                source_type="module_usecase_seed",
                confidence=confidence,
                is_additive=True,
                note="Realistic mobile SoC demo module use case/Profile power value.",
            )
            for component_id, use_case, op_id, power_w, confidence in module_usecase_specs
        ]
        scenario_selections = [
            ApplicationScenarioSelection(
                id=f"ASC_PM_3DIC_A_{safe_key(scenario_id)}_{safe_key(component_id)}_{safe_key(use_case)}_{safe_key(op_id)}",
                project_id="P001",
                impl_option_id="S2",
                physical_mapping_id="PM_3DIC_A",
                application_scenario_id=scenario_id,
                component_id=component_id,
                component_name=logical_by_id[component_id].name,
                use_case_name=use_case,
                operating_point_set_id=op_id,
                included=included,
                note="Seed scenario composition selection. SOC_TOP rows are inactive references for roll-up comparison.",
            )
            for scenario_id, rows in scenario_compositions.items()
            for component_id, use_case, op_id, included in rows
        ]
        power_obs: list[PowerObservation] = []
        
        for row in projects + implOptions + process_nodes + module_definitions + logical_components + tiers + partitions + metrics + responsibilities + app_scenarios + phys_mappings + power_datasets + op_point_sets + power_obs + module_power_obs + scenario_selections:
            session.merge(row)
        session.commit()


def metric(
    id: str,
    impl_option_id: str,
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
    source_type: str = "architecture_estimate",
    derivation: str | None = None,
) -> Metric:
    if derivation is None:
        derivation = "derived_from_logical_area" if subject_type == "physical_partition" and metric_name in {"logic_area", "sram_area", "block_area", "shape_type"} else "manual"
    return Metric(
        id=id,
        impl_option_id=impl_option_id,
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
        source_type=source_type,
        derivation=derivation,
        source_note=source_note,
        created_at=db.now_iso(),
    )


def database_has_project_data() -> bool:
    with Session(db.engine) as session:
        return session.exec(select(Project.id)).first() is not None
