from __future__ import annotations

from pydantic import BaseModel


class PartitionInput(BaseModel):
    id: str
    tier_id: str
    partition_name: str
    partition_type: str
    resource_category: str = "block"
    physical_instance_count: int
    content_share: float | None = None
    partition_ratio: float | None = None
    description: str = ""


class ComponentDetailUpdate(BaseModel):
    impl_option_id: str = "S2"
    team: str | None = None
    logical_instance_count: int
    partitions: list[PartitionInput]
    signal_count_total: int | None = None
    logic_area: float | None = None
    sram_area: float | None = None
    block_area: float | None = None


class LogicalComponentInput(BaseModel):
    id: str | None = None
    project_id: str
    parent_id: str | None = None
    module_definition_id: str | None = None
    name: str
    instance_type: str = "block"
    resource_type: str = "logic"
    function_domain: str = "General"
    logical_instance_count: int = 1
    owner_team: str = "Architecture Team"
    visibility_level: str = "team"
    description: str = ""
    impl_option_id: str = "S2"
    team: str | None = None


class LogicalComponentDeleteInput(BaseModel):
    impl_option_id: str = "S2"
    team: str | None = None
    cascade: bool = True


class PowerObservationCreate(BaseModel):
    project_id: str
    impl_option_id: str
    physical_mapping_id: str
    application_scenario_id: str = "AS_default"
    operating_point_set_id: str
    
    scope_type: str = "component"
    scope_id: str | None = None
    scope_name: str
    
    use_case_name: str | None = None
    power_value_w: float = 0.0
    
    time_window_name: str | None = "steady_state"
    statistic_type: str = "average"
    power_type: str = "total"
    development_stage: str | None = "architecture_estimate"
    confidence: str | None = "draft"
    is_additive: bool = True
    note: str | None = None


class PowerDatasetInput(BaseModel):
    id: str | None = None
    project_id: str
    impl_option_id: str
    name: str
    dataset_type: str = "architecture_estimate"
    development_stage: str = "architecture_estimate"
    source_type: str = "architecture_estimate"
    confidence: str = "draft"
    dataset_version: str = "V01"
    related_physical_mapping_id: str | None = None
    description: str = ""
    context_json: str = "{}"


class ModulePowerUseCaseInput(BaseModel):
    project_id: str
    impl_option_id: str
    physical_mapping_id: str
    component_id: str
    component_name: str
    use_case_name: str = "Default"
    operating_point_set_id: str | None = None
    operating_point_set_name: str | None = None
    power_value_w: float
    confidence: str | None = "draft"
    note: str | None = None


class ApplicationScenarioInput(BaseModel):
    project_id: str
    name: str
    category: str = "Custom"
    description: str | None = ""


class ApplicationScenarioSelectionInput(BaseModel):
    component_id: str
    component_name: str
    use_case_name: str = "Default"
    operating_point_set_id: str
    included: bool = True
    note: str | None = None


class ApplicationScenarioCompositionUpdate(BaseModel):
    project_id: str
    impl_option_id: str
    physical_mapping_id: str
    application_scenario_id: str
    selections: list[ApplicationScenarioSelectionInput]


class DatabaseCreateInput(BaseModel):
    name: str
    seed_demo: bool = False


class DatabaseSelectInput(BaseModel):
    id: str


class ImplementationTierInput(BaseModel):
    id: str
    name: str
    process: str
    role: str
    thickness_um: float


class ImplementationInterfaceInput(BaseModel):
    id: str
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


class ImplementationPackageEscapeInput(BaseModel):
    bottom_tier_id: str
    requires_tsv: bool = False
    pitch_um: float = 0
    keepout_um: float = 0
    description: str = ""


class ImplOptionDetailUpdate(BaseModel):
    implementation_type: str
    status: str = "draft"
    tiers: list[ImplementationTierInput]
    interfaces: list[ImplementationInterfaceInput]
    package_escape: ImplementationPackageEscapeInput
