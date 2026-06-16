from __future__ import annotations

from sqlmodel import Field, SQLModel


class SchemaVersion(SQLModel, table=True):
    __tablename__ = "schema_version"
    id: str = Field(primary_key=True)
    version: str
    updated_at: str


class MigrationHistory(SQLModel, table=True):
    __tablename__ = "migration_history"
    id: str = Field(primary_key=True)
    version: str
    name: str
    applied_at: str
    checksum: str = ""
    status: str = "applied"
    note: str = ""


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


class ImplOption(SQLModel, table=True):
    __tablename__ = "imploption"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    name: str
    impl_type: str
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
    logic_area_scale: float = 1
    sram_area_scale: float = 1
    block_area_scale: float = 1
    voltage_nominal: float
    cost_factor: float
    maturity_level: str
    description: str = ""


class Tier(SQLModel, table=True):
    id: str = Field(primary_key=True)
    impl_option_id: str = Field(foreign_key="imploption.id")
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
    impl_option_id: str = Field(foreign_key="imploption.id")
    logical_component_id: str = Field(foreign_key="logicalcomponent.id")
    tier_id: str = Field(foreign_key="tier.id")
    partition_name: str
    partition_type: str
    resource_category: str = "block"
    physical_instance_count: int = 1
    partition_ratio: float = 1
    content_share: float = 1
    description: str = ""


class Metric(SQLModel, table=True):
    id: str = Field(primary_key=True)
    impl_option_id: str = Field(foreign_key="imploption.id")
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
    source_type: str = "architecture_estimate"
    derivation: str = "manual"
    source_note: str = ""
    created_at: str


class ResponsibilityAssignment(SQLModel, table=True):
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    impl_option_id: str = Field(foreign_key="imploption.id")
    user_id: str
    team_name: str
    logical_component_id: str = Field(foreign_key="logicalcomponent.id")
    scope_type: str = "subtree"
    can_read: bool = True
    can_write: bool = True


class ImplOptionDetail(SQLModel, table=True):
    __tablename__ = "imploptiondetail"
    impl_option_id: str = Field(primary_key=True, foreign_key="imploption.id")
    implementation_type: str
    status: str = "draft"
    version: int = 1
    updated_at: str


class ImplementationTier(SQLModel, table=True):
    id: str = Field(primary_key=True)
    impl_option_id: str = Field(foreign_key="imploption.id")
    tier_id: str
    tier_index: int
    name: str
    process: str
    role: str
    thickness_um: float = 0


class ImplementationInterface(SQLModel, table=True):
    id: str = Field(primary_key=True)
    impl_option_id: str = Field(foreign_key="imploption.id")
    from_tier_id: str
    to_tier_id: str
    orientation: str
    interconnect: str
    hb_pitch_um: float = 0
    upper_tsv_pitch_um: float = 0
    upper_tsv_keepout_um: float = 0
    lower_tsv_pitch_um: float = 0
    lower_tsv_keepout_um: float = 0
    description: str = ""


class ImplementationPackageEscape(SQLModel, table=True):
    impl_option_id: str = Field(primary_key=True, foreign_key="imploption.id")
    bottom_tier_id: str
    requires_tsv: bool = False
    pitch_um: float = 0
    keepout_um: float = 0
    description: str = ""


class ApplicationScenario(SQLModel, table=True):
    __tablename__ = "applicationscenario"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    name: str
    category: str
    description: str = ""


class PhysicalMapping(SQLModel, table=True):
    __tablename__ = "physicalmapping"
    id: str = Field(primary_key=True)
    impl_option_id: str = Field(foreign_key="imploption.id")
    name: str
    mapping_version: str
    description: str = ""
    mapping_json: str = ""


class PowerDataset(SQLModel, table=True):
    __tablename__ = "powerdataset"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    impl_option_id: str = Field(foreign_key="imploption.id")
    name: str
    dataset_type: str = "architecture_estimate"
    development_stage: str = "architecture_estimate"
    source_type: str = "architecture_estimate"
    confidence: str = "draft"
    dataset_version: str = "V01"
    related_physical_mapping_id: str | None = Field(default=None, foreign_key="physicalmapping.id")
    description: str = ""
    context_json: str = ""
    created_at: str = ""
    updated_at: str = ""


class OperatingPointSet(SQLModel, table=True):
    __tablename__ = "operatingpointset"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    name: str
    description: str = ""
    op_json: str = ""


class PowerObservation(SQLModel, table=True):
    __tablename__ = "powerobservation"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    impl_option_id: str = Field(foreign_key="imploption.id")
    physical_mapping_id: str = Field(foreign_key="powerdataset.id")
    application_scenario_id: str = Field(foreign_key="applicationscenario.id")
    operating_point_set_id: str = Field(foreign_key="operatingpointset.id")
    
    scope_type: str
    scope_id: str | None = Field(default=None, foreign_key="logicalcomponent.id")
    scope_name: str
    
    use_case_name: str | None = None
    time_window_name: str | None = None
    statistic_type: str = "average"
    power_type: str = "total"
    power_value_w: float = 0.0
    
    development_stage: str | None = None
    source_type: str | None = None
    confidence: str | None = None
    is_additive: bool = True
    
    context_json: str | None = None
    note: str | None = None


class ApplicationScenarioSelection(SQLModel, table=True):
    __tablename__ = "applicationscenarioselection"
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    impl_option_id: str = Field(foreign_key="imploption.id")
    physical_mapping_id: str = Field(foreign_key="powerdataset.id")
    application_scenario_id: str = Field(foreign_key="applicationscenario.id")
    component_id: str = Field(foreign_key="logicalcomponent.id")
    component_name: str
    use_case_name: str = "Default"
    operating_point_set_id: str = Field(foreign_key="operatingpointset.id")
    included: bool = True
    note: str = ""
