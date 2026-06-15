from __future__ import annotations

from typing import Any
import uuid

from fastapi import FastAPI, HTTPException
from sqlmodel import Session, select

from backend import db
from backend.models import (
    ApplicationScenario,
    ApplicationScenarioSelection,
    ImplOption,
    LogicalComponent,
    OperatingPointSet,
    PhysicalMapping,
    PowerDataset,
    PowerObservation,
    Project,
)
from backend.schemas import (
    ApplicationScenarioCompositionUpdate,
    ApplicationScenarioInput,
    ModulePowerUseCaseInput,
    PowerDatasetInput,
    PowerObservationCreate,
)


def safe_power_id_part(value: str | None) -> str:
    return (value or "Default").replace(" ", "_").replace("/", "_").replace("-", "_").replace(".", "_").upper()


def coalesce_power_dataset_id(physical_mapping_id: str | None = None, power_dataset_id: str | None = None) -> str:
    dataset_id = (power_dataset_id or physical_mapping_id or "").strip()
    if not dataset_id:
        raise HTTPException(status_code=400, detail="power_dataset_id is required.")
    return dataset_id


def register_power_routes(app: FastAPI) -> None:
    @app.get("/api/application-scenarios")
    def get_application_scenarios() -> list[ApplicationScenario]:
        with Session(db.engine) as session:
            return list(session.exec(select(ApplicationScenario).where(ApplicationScenario.id != "AS_MODULE_LIBRARY")).all())


    @app.post("/api/application-scenarios")
    def create_application_scenario(payload: ApplicationScenarioInput) -> ApplicationScenario:
        with Session(db.engine) as session:
            if not session.get(Project, payload.project_id):
                raise HTTPException(status_code=400, detail=f"Unknown project_id: {payload.project_id}")
            name = payload.name.strip()
            if not name:
                raise HTTPException(status_code=400, detail="Application scenario name is required.")
            base_id = f"AS_{safe_power_id_part(name)}"
            scenario_id = base_id
            index = 2
            while session.get(ApplicationScenario, scenario_id):
                scenario_id = f"{base_id}_{index}"
                index += 1
            row = ApplicationScenario(
                id=scenario_id,
                project_id=payload.project_id,
                name=name,
                category=(payload.category or "Custom").strip() or "Custom",
                description=payload.description or "",
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return row


    @app.put("/api/application-scenarios/{scenario_id}")
    def update_application_scenario(scenario_id: str, payload: ApplicationScenarioInput) -> ApplicationScenario:
        if scenario_id == "AS_MODULE_LIBRARY":
            raise HTTPException(status_code=400, detail="Internal module library scenario cannot be edited.")
        with Session(db.engine) as session:
            row = session.get(ApplicationScenario, scenario_id)
            if not row:
                raise HTTPException(status_code=404, detail=f"Application scenario not found: {scenario_id}")
            if not session.get(Project, payload.project_id):
                raise HTTPException(status_code=400, detail=f"Unknown project_id: {payload.project_id}")
            name = payload.name.strip()
            if not name:
                raise HTTPException(status_code=400, detail="Application scenario name is required.")
            row.project_id = payload.project_id
            row.name = name
            row.category = (payload.category or "Custom").strip() or "Custom"
            row.description = payload.description or ""
            session.add(row)
            session.commit()
            session.refresh(row)
            return row


    @app.delete("/api/application-scenarios/{scenario_id}")
    def delete_application_scenario(scenario_id: str) -> dict[str, Any]:
        if scenario_id == "AS_MODULE_LIBRARY":
            raise HTTPException(status_code=400, detail="Internal module library scenario cannot be deleted.")
        with Session(db.engine) as session:
            row = session.get(ApplicationScenario, scenario_id)
            if not row:
                raise HTTPException(status_code=404, detail=f"Application scenario not found: {scenario_id}")
            selections = list(
                session.exec(
                    select(ApplicationScenarioSelection).where(
                        ApplicationScenarioSelection.application_scenario_id == scenario_id,
                    )
                ).all()
            )
            observations = list(
                session.exec(
                    select(PowerObservation).where(
                        PowerObservation.application_scenario_id == scenario_id,
                    )
                ).all()
            )
            for selection in selections:
                session.delete(selection)
            for observation in observations:
                session.delete(observation)
            session.delete(row)
            session.commit()
            return {
                "success": True,
                "deleted_id": scenario_id,
                "deleted_selection_count": len(selections),
                "deleted_observation_count": len(observations),
            }


    def power_dataset_response(row: PowerDataset) -> dict[str, Any]:
        return {
            "id": row.id,
            "project_id": row.project_id,
            "impl_option_id": row.impl_option_id,
            "name": row.name,
            "dataset_type": row.dataset_type,
            "development_stage": row.development_stage,
            "source_type": row.source_type,
            "confidence": row.confidence,
            "dataset_version": row.dataset_version,
            "power_dataset_id": row.id,
            "physical_mapping_id": row.id,
            "related_physical_mapping_id": row.related_physical_mapping_id,
            "description": row.description,
            "context_json": row.context_json,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
            "mapping_version": row.dataset_version,
            "mapping_json": row.context_json,
        }


    def list_power_dataset_rows(session: Session, impl_option_id: str | None = None) -> list[PowerDataset]:
        stmt = select(PowerDataset)
        if impl_option_id:
            stmt = stmt.where(PowerDataset.impl_option_id == impl_option_id)
        rows = list(session.exec(stmt).all())
        return sorted(rows, key=lambda row: (row.impl_option_id, row.development_stage, row.name, row.id))


    def validate_power_dataset_payload(session: Session, payload: PowerDatasetInput) -> tuple[str, ImplOption]:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Power dataset name is required.")
        project = session.get(Project, payload.project_id)
        if not project:
            raise HTTPException(status_code=400, detail=f"Unknown project_id: {payload.project_id}")
        impl_option = session.get(ImplOption, payload.impl_option_id)
        if not impl_option:
            raise HTTPException(status_code=400, detail=f"Unknown impl_option_id: {payload.impl_option_id}")
        if impl_option.project_id != payload.project_id:
            raise HTTPException(status_code=400, detail=f"impl_option_id {payload.impl_option_id} does not belong to project_id {payload.project_id}")
        if payload.related_physical_mapping_id:
            mapping = session.get(PhysicalMapping, payload.related_physical_mapping_id)
            if not mapping:
                raise HTTPException(status_code=400, detail=f"Unknown related_physical_mapping_id: {payload.related_physical_mapping_id}")
            if mapping.impl_option_id != payload.impl_option_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"related_physical_mapping_id {payload.related_physical_mapping_id} does not belong to impl_option_id {payload.impl_option_id}",
                )
        return name, impl_option


    def next_power_dataset_id(session: Session, impl_option_id: str, name: str, requested_id: str | None = None) -> str:
        base_id = (requested_id or "").strip() or f"PD_{safe_power_id_part(impl_option_id)}_{safe_power_id_part(name)}"
        dataset_id = base_id
        index = 2
        while session.get(PowerDataset, dataset_id):
            dataset_id = f"{base_id}_{index}"
            index += 1
        return dataset_id


    @app.get("/api/power-datasets")
    def get_power_datasets(impl_option_id: str | None = None) -> list[dict[str, Any]]:
        with Session(db.engine) as session:
            return [power_dataset_response(row) for row in list_power_dataset_rows(session, impl_option_id)]


    @app.post("/api/power-datasets")
    def create_power_dataset(payload: PowerDatasetInput) -> dict[str, Any]:
        with Session(db.engine) as session:
            name, _impl_option = validate_power_dataset_payload(session, payload)
            now = db.now_iso()
            row = PowerDataset(
                id=next_power_dataset_id(session, payload.impl_option_id, name, payload.id),
                project_id=payload.project_id,
                impl_option_id=payload.impl_option_id,
                name=name,
                dataset_type=(payload.dataset_type or "architecture_estimate").strip() or "architecture_estimate",
                development_stage=(payload.development_stage or "architecture_estimate").strip() or "architecture_estimate",
                source_type=(payload.source_type or "architecture_estimate").strip() or "architecture_estimate",
                confidence=(payload.confidence or "draft").strip() or "draft",
                dataset_version=(payload.dataset_version or "V01").strip() or "V01",
                related_physical_mapping_id=payload.related_physical_mapping_id,
                description=payload.description or "",
                context_json=payload.context_json or "{}",
                created_at=now,
                updated_at=now,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return power_dataset_response(row)


    @app.put("/api/power-datasets/{dataset_id}")
    def update_power_dataset(dataset_id: str, payload: PowerDatasetInput) -> dict[str, Any]:
        with Session(db.engine) as session:
            row = session.get(PowerDataset, dataset_id)
            if not row:
                raise HTTPException(status_code=404, detail=f"Power dataset not found: {dataset_id}")
            name, _impl_option = validate_power_dataset_payload(session, payload)
            row.project_id = payload.project_id
            row.impl_option_id = payload.impl_option_id
            row.name = name
            row.dataset_type = (payload.dataset_type or "architecture_estimate").strip() or "architecture_estimate"
            row.development_stage = (payload.development_stage or "architecture_estimate").strip() or "architecture_estimate"
            row.source_type = (payload.source_type or "architecture_estimate").strip() or "architecture_estimate"
            row.confidence = (payload.confidence or "draft").strip() or "draft"
            row.dataset_version = (payload.dataset_version or "V01").strip() or "V01"
            row.related_physical_mapping_id = payload.related_physical_mapping_id
            row.description = payload.description or ""
            row.context_json = payload.context_json or "{}"
            row.updated_at = db.now_iso()
            session.add(row)
            session.commit()
            session.refresh(row)
            return power_dataset_response(row)


    @app.get("/api/physical-mappings")
    def get_physical_mappings(impl_option_id: str | None = None) -> list[dict[str, Any]]:
        return get_power_datasets(impl_option_id)


    @app.get("/api/operating-point-sets")
    def get_operating_point_sets() -> list[OperatingPointSet]:
        with Session(db.engine) as session:
            return list(session.exec(select(OperatingPointSet)).all())


    def profile_id_from_name(name: str | None) -> str:
        cleaned = (name or "Default").strip() or "Default"
        if cleaned.lower() == "default":
            return "OP_DEFAULT"
        return f"OP_{safe_power_id_part(cleaned)}"


    def module_power_observation_id(impl_option_id: str, physical_mapping_id: str, component_id: str, use_case_name: str, operating_point_set_id: str) -> str:
        return (
            f"PUC_{safe_power_id_part(impl_option_id)}_{safe_power_id_part(physical_mapping_id)}_"
            f"{safe_power_id_part(component_id)}_{safe_power_id_part(use_case_name)}_{safe_power_id_part(operating_point_set_id)}"
        )


    def app_selection_id(physical_mapping_id: str, application_scenario_id: str, component_id: str, use_case_name: str, operating_point_set_id: str) -> str:
        return (
            f"ASC_{safe_power_id_part(physical_mapping_id)}_{safe_power_id_part(application_scenario_id)}_{safe_power_id_part(component_id)}_"
            f"{safe_power_id_part(use_case_name)}_{safe_power_id_part(operating_point_set_id)}"
        )


    def validate_power_context(
        session: Session,
        project_id: str,
        impl_option_id: str,
        power_dataset_id: str,
        application_scenario_id: str | None = None,
        operating_point_set_id: str | None = None,
        component_id: str | None = None,
    ) -> None:
        if not session.get(Project, project_id):
            raise HTTPException(status_code=400, detail=f"Unknown project_id: {project_id}")
        if not session.get(ImplOption, impl_option_id):
            raise HTTPException(status_code=400, detail=f"Unknown impl_option_id: {impl_option_id}")
        power_dataset = session.get(PowerDataset, power_dataset_id)
        if not power_dataset:
            raise HTTPException(status_code=400, detail=f"Unknown power_dataset_id: {power_dataset_id}")
        if power_dataset.impl_option_id != impl_option_id:
            raise HTTPException(status_code=400, detail=f"power_dataset_id {power_dataset_id} does not belong to impl_option_id {impl_option_id}")
        if power_dataset.project_id != project_id:
            raise HTTPException(status_code=400, detail=f"power_dataset_id {power_dataset_id} does not belong to project_id {project_id}")
        if application_scenario_id and not session.get(ApplicationScenario, application_scenario_id):
            raise HTTPException(status_code=400, detail=f"Unknown application_scenario_id: {application_scenario_id}")
        if operating_point_set_id and not session.get(OperatingPointSet, operating_point_set_id):
            raise HTTPException(status_code=400, detail=f"Unknown operating_point_set_id: {operating_point_set_id}")
        if component_id and not session.get(LogicalComponent, component_id):
            raise HTTPException(status_code=400, detail=f"Unknown component_id: {component_id}")


    def module_power_rows(session: Session, impl_option_id: str, physical_mapping_id: str) -> list[PowerObservation]:
        return list(
            session.exec(
                select(PowerObservation).where(
                    PowerObservation.impl_option_id == impl_option_id,
                    PowerObservation.physical_mapping_id == physical_mapping_id,
                    PowerObservation.application_scenario_id == "AS_MODULE_LIBRARY",
                    PowerObservation.scope_type == "component",
                )
            ).all()
        )


    @app.get("/api/module-power-usecases")
    def get_module_power_usecases(impl_option_id: str, physical_mapping_id: str | None = None, power_dataset_id: str | None = None) -> list[dict[str, Any]]:
        dataset_id = coalesce_power_dataset_id(physical_mapping_id, power_dataset_id)
        with Session(db.engine) as session:
            rows = module_power_rows(session, impl_option_id, dataset_id)
            op_names = {row.id: row.name for row in session.exec(select(OperatingPointSet)).all()}
            return [
                {
                    "id": row.id,
                    "project_id": row.project_id,
                    "impl_option_id": row.impl_option_id,
                    "power_dataset_id": row.physical_mapping_id,
                    "physical_mapping_id": row.physical_mapping_id,
                    "component_id": row.scope_id,
                    "component_name": row.scope_name,
                    "use_case_name": row.use_case_name or "Default",
                    "operating_point_set_id": row.operating_point_set_id,
                    "operating_point_set_name": op_names.get(row.operating_point_set_id, row.operating_point_set_id),
                    "power_value_w": row.power_value_w,
                    "confidence": row.confidence,
                    "note": row.note,
                }
                for row in rows
            ]


    @app.post("/api/module-power-usecases")
    def upsert_module_power_usecase(payload: ModulePowerUseCaseInput) -> dict[str, Any]:
        dataset_id = coalesce_power_dataset_id(payload.physical_mapping_id, payload.power_dataset_id)
        with Session(db.engine) as session:
            validate_power_context(
                session,
                payload.project_id,
                payload.impl_option_id,
                dataset_id,
                component_id=payload.component_id,
            )
            if payload.power_value_w < 0:
                raise HTTPException(status_code=400, detail="power_value_w must be >= 0")
            use_case_name = payload.use_case_name.strip() or "Default"
            op_name = (payload.operating_point_set_name or "").strip()
            op_id = (payload.operating_point_set_id or "").strip() or profile_id_from_name(op_name)
            if not op_id:
                op_id = "OP_DEFAULT"
            if op_id == "OP_DEFAULT":
                op_name = "Default"
            elif not op_name:
                op_name = op_id.removeprefix("OP_").replace("_", " ").title()
            if not session.get(OperatingPointSet, op_id):
                session.add(
                    OperatingPointSet(
                        id=op_id,
                        project_id=payload.project_id,
                        name=op_name,
                        description=f"Module Profile created from the application power editor for {payload.component_name}.",
                        op_json="{}",
                    )
                )
            row = PowerObservation(
                id=module_power_observation_id(payload.impl_option_id, dataset_id, payload.component_id, use_case_name, op_id),
                project_id=payload.project_id,
                impl_option_id=payload.impl_option_id,
                physical_mapping_id=dataset_id,
                application_scenario_id="AS_MODULE_LIBRARY",
                operating_point_set_id=op_id,
                scope_type="component",
                scope_id=payload.component_id,
                scope_name=payload.component_name,
                use_case_name=use_case_name,
                time_window_name="steady_state",
                statistic_type="average",
                power_type="total",
                power_value_w=payload.power_value_w,
                development_stage="architecture_estimate",
                source_type="web_ui",
                confidence=payload.confidence or "draft",
                is_additive=True,
                note=payload.note,
            )
            session.merge(row)
            session.commit()
            return get_module_power_usecases(payload.impl_option_id, power_dataset_id=dataset_id)[0] if False else {
                "id": row.id,
                "project_id": row.project_id,
                "impl_option_id": row.impl_option_id,
                "power_dataset_id": row.physical_mapping_id,
                "physical_mapping_id": row.physical_mapping_id,
                "component_id": row.scope_id,
                "component_name": row.scope_name,
                "use_case_name": row.use_case_name or "Default",
                "operating_point_set_id": row.operating_point_set_id,
                "operating_point_set_name": op_name,
                "power_value_w": row.power_value_w,
                "confidence": row.confidence,
                "note": row.note,
            }


    @app.delete("/api/module-power-usecases/{usecase_id}")
    def delete_module_power_usecase(usecase_id: str) -> dict[str, Any]:
        with Session(db.engine) as session:
            row = session.get(PowerObservation, usecase_id)
            if not row or row.application_scenario_id != "AS_MODULE_LIBRARY" or row.scope_type != "component":
                raise HTTPException(status_code=404, detail=f"Module power use case not found: {usecase_id}")
            matching_selections = list(
                session.exec(
                    select(ApplicationScenarioSelection).where(
                        ApplicationScenarioSelection.impl_option_id == row.impl_option_id,
                        ApplicationScenarioSelection.physical_mapping_id == row.physical_mapping_id,
                        ApplicationScenarioSelection.component_id == row.scope_id,
                        ApplicationScenarioSelection.use_case_name == (row.use_case_name or "Default"),
                        ApplicationScenarioSelection.operating_point_set_id == row.operating_point_set_id,
                    )
                ).all()
            )
            for selection in matching_selections:
                session.delete(selection)
            session.delete(row)
            session.commit()
            return {
                "success": True,
                "deleted_id": usecase_id,
                "deleted_selection_count": len(matching_selections),
            }


    def selection_response(row: ApplicationScenarioSelection) -> dict[str, Any]:
        return {
            "id": row.id,
            "project_id": row.project_id,
            "impl_option_id": row.impl_option_id,
            "power_dataset_id": row.physical_mapping_id,
            "physical_mapping_id": row.physical_mapping_id,
            "application_scenario_id": row.application_scenario_id,
            "component_id": row.component_id,
            "component_name": row.component_name,
            "use_case_name": row.use_case_name,
            "operating_point_set_id": row.operating_point_set_id,
            "included": row.included,
            "note": row.note,
        }


    @app.get("/api/application-scenario-composition")
    def get_application_scenario_composition(
        impl_option_id: str,
        physical_mapping_id: str | None = None,
        power_dataset_id: str | None = None,
        application_scenario_id: str = "",
    ) -> list[dict[str, Any]]:
        dataset_id = coalesce_power_dataset_id(physical_mapping_id, power_dataset_id)
        with Session(db.engine) as session:
            rows = list(
                session.exec(
                    select(ApplicationScenarioSelection).where(
                        ApplicationScenarioSelection.impl_option_id == impl_option_id,
                        ApplicationScenarioSelection.physical_mapping_id == dataset_id,
                        ApplicationScenarioSelection.application_scenario_id == application_scenario_id,
                    )
                ).all()
            )
            return [selection_response(row) for row in rows]


    POWER_ROLLUP_ABS_TOLERANCE_W = 0.001
    POWER_ROLLUP_REL_TOLERANCE = 0.01


    def power_rollup_tolerance(parent_power: float | None, child_sum: float) -> float:
        baseline = max(abs(parent_power or 0.0), abs(child_sum), 0.0)
        return max(POWER_ROLLUP_ABS_TOLERANCE_W, baseline * POWER_ROLLUP_REL_TOLERANCE)


    def component_hierarchy_maps(session: Session) -> tuple[dict[str, LogicalComponent], dict[str, str | None], dict[str, list[str]], dict[str, set[str]], dict[str, set[str]]]:
        components = list(session.exec(select(LogicalComponent)).all())
        by_id = {row.id: row for row in components}
        parent_by_id = {row.id: row.parent_id for row in components}
        children_by_parent: dict[str, list[str]] = {}
        for row in components:
            if row.parent_id:
                children_by_parent.setdefault(row.parent_id, []).append(row.id)

        ancestors_by_id: dict[str, set[str]] = {}
        for component_id, parent_id in parent_by_id.items():
            ancestors: set[str] = set()
            current = parent_id
            while current:
                ancestors.add(current)
                current = parent_by_id.get(current)
            ancestors_by_id[component_id] = ancestors

        descendants_by_id: dict[str, set[str]] = {}

        def descendants(component_id: str) -> set[str]:
            if component_id in descendants_by_id:
                return descendants_by_id[component_id]
            result: set[str] = set()
            for child_id in children_by_parent.get(component_id, []):
                result.add(child_id)
                result.update(descendants(child_id))
            descendants_by_id[component_id] = result
            return result

        for component_id in by_id:
            descendants(component_id)

        return by_id, parent_by_id, children_by_parent, ancestors_by_id, descendants_by_id


    def selection_power(selection: ApplicationScenarioSelection, library: dict[tuple[str | None, str, str], PowerObservation]) -> float | None:
        observation = library.get((selection.component_id, selection.use_case_name or "Default", selection.operating_point_set_id))
        return observation.power_value_w if observation else None


    def validate_active_power_hierarchy(
        selections: list[ApplicationScenarioSelection],
        ancestors_by_id: dict[str, set[str]],
    ) -> None:
        active_ids = {row.component_id for row in selections if row.included}
        for row in selections:
            if not row.included:
                continue
            active_ancestors = sorted(ancestors_by_id.get(row.component_id, set()) & active_ids)
            if active_ancestors:
                raise HTTPException(
                    status_code=400,
                    detail=f"Power composition double-count risk: {row.component_name} and ancestor {active_ancestors[0]} are both included.",
                )


    def build_power_hierarchy_rollups(
        session: Session,
        selections: list[ApplicationScenarioSelection],
        library: dict[tuple[str | None, str, str], PowerObservation],
    ) -> list[dict[str, Any]]:
        components_by_id, _parent_by_id, children_by_parent, _ancestors_by_id, descendants_by_id = component_hierarchy_maps(session)
        selection_by_component = {row.component_id: row for row in selections}
        rollups: list[dict[str, Any]] = []
        for parent_id, child_ids in children_by_parent.items():
            parent_selection = selection_by_component.get(parent_id)
            child_selections = [selection_by_component[child_id] for child_id in child_ids if child_id in selection_by_component]
            if not parent_selection and not child_selections:
                continue
            parent_power = selection_power(parent_selection, library) if parent_selection else None
            child_sum = 0.0
            missing_child_count = 0
            assigned_child_count = 0
            for child_selection in child_selections:
                assigned_child_count += 1
                child_power = selection_power(child_selection, library)
                if child_power is None:
                    missing_child_count += 1
                else:
                    child_sum += child_power

            unsplit_power = None
            status = "incomplete"
            if parent_power is None:
                status = "incomplete"
            else:
                unsplit_power = round(parent_power - child_sum, 4)
                tolerance = power_rollup_tolerance(parent_power, child_sum)
                if missing_child_count > 0:
                    status = "incomplete"
                elif child_sum - parent_power > tolerance:
                    status = "over_specified"
                elif abs(parent_power - child_sum) <= tolerance:
                    status = "closed"
                else:
                    status = "unsplit"

            parent = components_by_id.get(parent_id)
            rollups.append(
                {
                    "parent_component_id": parent_id,
                    "parent_component_name": parent.name if parent else parent_id,
                    "parent_included": bool(parent_selection.included) if parent_selection else False,
                    "parent_power_value_w": parent_power,
                    "assigned_child_count": assigned_child_count,
                    "missing_child_count": missing_child_count,
                    "child_sum_power_w": round(child_sum, 4),
                    "unsplit_power_w": unsplit_power,
                    "residual_power_w": unsplit_power,
                    "status": status,
                    "covered_descendant_ids": sorted(descendants_by_id.get(parent_id, set())),
                }
            )
        return rollups


    def validate_power_rollups(rollups: list[dict[str, Any]]) -> None:
        for rollup in rollups:
            if rollup["parent_included"] and rollup["status"] == "over_specified":
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Power roll-up over-specified for {rollup['parent_component_name']}: "
                        f"children sum {rollup['child_sum_power_w']:.4f} W exceeds parent inclusive "
                        f"{rollup['parent_power_value_w']:.4f} W."
                    ),
                )


    @app.put("/api/application-scenario-composition")
    def update_application_scenario_composition(payload: ApplicationScenarioCompositionUpdate) -> dict[str, Any]:
        dataset_id = coalesce_power_dataset_id(payload.physical_mapping_id, payload.power_dataset_id)
        with Session(db.engine) as session:
            validate_power_context(
                session,
                payload.project_id,
                payload.impl_option_id,
                dataset_id,
                application_scenario_id=payload.application_scenario_id,
            )
            existing = list(
                session.exec(
                    select(ApplicationScenarioSelection).where(
                        ApplicationScenarioSelection.impl_option_id == payload.impl_option_id,
                        ApplicationScenarioSelection.physical_mapping_id == dataset_id,
                        ApplicationScenarioSelection.application_scenario_id == payload.application_scenario_id,
                    )
                ).all()
            )
            for row in existing:
                session.delete(row)
            pending_selections: list[ApplicationScenarioSelection] = []
            library = {
                (row.scope_id, row.use_case_name or "Default", row.operating_point_set_id): row
                for row in module_power_rows(session, payload.impl_option_id, dataset_id)
            }
            _components_by_id, _parent_by_id, _children_by_parent, ancestors_by_id, _descendants_by_id = component_hierarchy_maps(session)
            for item in payload.selections:
                validate_power_context(
                    session,
                    payload.project_id,
                    payload.impl_option_id,
                    dataset_id,
                    application_scenario_id=payload.application_scenario_id,
                    operating_point_set_id=item.operating_point_set_id,
                    component_id=item.component_id,
                )
                use_case_name = item.use_case_name.strip() or "Default"
                library_row = library.get((item.component_id, use_case_name, item.operating_point_set_id))
                if item.included and not library_row:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{item.component_name} / {use_case_name} / {item.operating_point_set_id} has no saved module power value.",
                    )
                pending_selections.append(
                    ApplicationScenarioSelection(
                        id=app_selection_id(dataset_id, payload.application_scenario_id, item.component_id, use_case_name, item.operating_point_set_id),
                        project_id=payload.project_id,
                        impl_option_id=payload.impl_option_id,
                        physical_mapping_id=dataset_id,
                        application_scenario_id=payload.application_scenario_id,
                        component_id=item.component_id,
                        component_name=item.component_name,
                        use_case_name=use_case_name,
                        operating_point_set_id=item.operating_point_set_id,
                        included=item.included,
                        note=item.note or "",
                    )
                )
            validate_active_power_hierarchy(pending_selections, ancestors_by_id)
            rollups = build_power_hierarchy_rollups(session, pending_selections, library)
            validate_power_rollups(rollups)
            for row in pending_selections:
                session.add(row)
            session.commit()
            return {
                "selections": get_application_scenario_composition(payload.impl_option_id, power_dataset_id=dataset_id, application_scenario_id=payload.application_scenario_id),
                "summary": application_power_summary(session, payload.impl_option_id, dataset_id, payload.application_scenario_id),
            }


    def application_power_summary(session: Session, impl_option_id: str, physical_mapping_id: str, application_scenario_id: str) -> dict[str, Any]:
        selections = list(
            session.exec(
                select(ApplicationScenarioSelection).where(
                    ApplicationScenarioSelection.impl_option_id == impl_option_id,
                    ApplicationScenarioSelection.physical_mapping_id == physical_mapping_id,
                    ApplicationScenarioSelection.application_scenario_id == application_scenario_id,
                )
            ).all()
        )
        library = {
            (row.scope_id, row.use_case_name or "Default", row.operating_point_set_id): row
            for row in module_power_rows(session, impl_option_id, physical_mapping_id)
        }
        hierarchy_rollups = build_power_hierarchy_rollups(session, selections, library)
        rows: list[dict[str, Any]] = []
        total = 0.0
        missing = 0
        for selection in selections:
            observation = library.get((selection.component_id, selection.use_case_name, selection.operating_point_set_id))
            power = observation.power_value_w if observation else None
            if selection.included and power is not None:
                total += power
            if selection.included and power is None:
                missing += 1
            rows.append(
                {
                    "id": selection.id,
                    "component_id": selection.component_id,
                    "component_name": selection.component_name,
                    "use_case_name": selection.use_case_name,
                    "operating_point_set_id": selection.operating_point_set_id,
                    "included": selection.included,
                    "power_value_w": power,
                    "confidence": observation.confidence if observation else None,
                    "note": selection.note,
                }
            )
        return {
            "filters": {
                "impl_option_id": impl_option_id,
                "power_dataset_id": physical_mapping_id,
                "physical_mapping_id": physical_mapping_id,
                "application_scenario_id": application_scenario_id,
            },
            "total_additive_power_w": round(total, 4),
            "non_additive_reference_power_w": None,
            "residual_power_w": None,
            "selected_count": sum(1 for row in selections if row.included),
            "missing_count": missing,
            "selections": rows,
            "hierarchy_rollups": hierarchy_rollups,
            "by_component": {row["component_name"]: row["power_value_w"] for row in rows if row["included"] and row["power_value_w"] is not None},
        }


    @app.get("/api/application-power-summary")
    def get_application_power_summary(
        impl_option_id: str,
        physical_mapping_id: str | None = None,
        power_dataset_id: str | None = None,
        application_scenario_id: str = "",
    ) -> dict[str, Any]:
        dataset_id = coalesce_power_dataset_id(physical_mapping_id, power_dataset_id)
        with Session(db.engine) as session:
            return application_power_summary(session, impl_option_id, dataset_id, application_scenario_id)


    @app.get("/api/power-observations")
    def get_power_observations(
        project_id: str | None = None,
        impl_option_id: str | None = None,
        physical_mapping_id: str | None = None,
        power_dataset_id: str | None = None,
        application_scenario_id: str | None = None,
        operating_point_set_id: str | None = None,
        scope_type: str | None = None,
        statistic_type: str | None = None,
        power_type: str | None = None,
        development_stage: str | None = None,
        confidence: str | None = None,
        is_additive: bool | None = None,
    ) -> list[dict[str, Any]]:
        dataset_id = coalesce_power_dataset_id(physical_mapping_id, power_dataset_id) if physical_mapping_id or power_dataset_id else None
        with Session(db.engine) as session:
            stmt = select(PowerObservation)
            if project_id:
                stmt = stmt.where(PowerObservation.project_id == project_id)
            if impl_option_id:
                stmt = stmt.where(PowerObservation.impl_option_id == impl_option_id)
            if dataset_id:
                stmt = stmt.where(PowerObservation.physical_mapping_id == dataset_id)
            if application_scenario_id:
                stmt = stmt.where(PowerObservation.application_scenario_id == application_scenario_id)
            if operating_point_set_id:
                stmt = stmt.where(PowerObservation.operating_point_set_id == operating_point_set_id)
            if scope_type:
                stmt = stmt.where(PowerObservation.scope_type == scope_type)
            if statistic_type:
                stmt = stmt.where(PowerObservation.statistic_type == statistic_type)
            if power_type:
                stmt = stmt.where(PowerObservation.power_type == power_type)
            if development_stage:
                stmt = stmt.where(PowerObservation.development_stage == development_stage)
            if confidence:
                stmt = stmt.where(PowerObservation.confidence == confidence)
            if is_additive is not None:
                stmt = stmt.where(PowerObservation.is_additive == is_additive)
            return [power_observation_response(row) for row in session.exec(stmt).all()]


    @app.get("/api/power-summary")
    def get_power_summary(
        impl_option_id: str,
        physical_mapping_id: str | None = None,
        power_dataset_id: str | None = None,
        application_scenario_id: str = "",
        operating_point_set_id: str = "",
        statistic_type: str = "average",
        power_type: str = "total",
        time_window_name: str | None = None,
        development_stage: str | None = None,
    ) -> dict[str, Any]:
        dataset_id = coalesce_power_dataset_id(physical_mapping_id, power_dataset_id)
        with Session(db.engine) as session:
            stmt = select(PowerObservation).where(
                PowerObservation.impl_option_id == impl_option_id,
                PowerObservation.physical_mapping_id == dataset_id,
                PowerObservation.application_scenario_id == application_scenario_id,
                PowerObservation.operating_point_set_id == operating_point_set_id,
                PowerObservation.statistic_type == statistic_type,
                PowerObservation.power_type == power_type,
            )
            if time_window_name:
                stmt = stmt.where(PowerObservation.time_window_name == time_window_name)
            if development_stage:
                stmt = stmt.where(PowerObservation.development_stage == development_stage)
            
            observations = list(session.exec(stmt).all())
        
            additive_obs = [o for o in observations if o.is_additive]
            total_additive_power_w = sum(o.power_value_w for o in additive_obs)
        
            non_additive_obs = [o for o in observations if not o.is_additive]
            soc_ref = next((o for o in non_additive_obs if o.scope_type == "soc"), None)
            non_additive_reference_power_w = soc_ref.power_value_w if soc_ref else None
        
            residual_power_w = None
            if non_additive_reference_power_w is not None:
                residual_power_w = round(non_additive_reference_power_w - total_additive_power_w, 4)
            
            by_scope_type = {}
            for o in additive_obs:
                by_scope_type[o.scope_type] = round(by_scope_type.get(o.scope_type, 0.0) + o.power_value_w, 4)
            
            by_component = {}
            for o in additive_obs:
                if o.scope_type == "component":
                    by_component[o.scope_name] = round(by_component.get(o.scope_name, 0.0) + o.power_value_w, 4)
                
            by_stage = {}
            for o in observations:
                stage = o.development_stage or "unknown"
                by_stage[stage] = by_stage.get(stage, 0) + 1
            
            return {
                "filters": {
                    "impl_option_id": impl_option_id,
                    "power_dataset_id": dataset_id,
                    "physical_mapping_id": dataset_id,
                    "application_scenario_id": application_scenario_id,
                    "operating_point_set_id": operating_point_set_id,
                    "statistic_type": statistic_type,
                    "power_type": power_type,
                    "time_window_name": time_window_name,
                    "development_stage": development_stage,
                },
                "total_additive_power_w": round(total_additive_power_w, 4),
                "non_additive_reference_power_w": non_additive_reference_power_w,
                "residual_power_w": residual_power_w,
                "by_scope_type": by_scope_type,
                "by_component": by_component,
                "by_stage": by_stage,
                "non_additive_references": [
                    {
                        "scope_type": o.scope_type,
                        "scope_name": o.scope_name,
                        "power_value_w": o.power_value_w,
                        "development_stage": o.development_stage,
                    }
                    for o in non_additive_obs
                ],
                "observations": [power_observation_response(o) for o in observations],
            }


    def power_observation_response(row: PowerObservation) -> dict[str, Any]:
        return {
            "id": row.id,
            "project_id": row.project_id,
            "impl_option_id": row.impl_option_id,
            "power_dataset_id": row.physical_mapping_id,
            "physical_mapping_id": row.physical_mapping_id,
            "application_scenario_id": row.application_scenario_id,
            "operating_point_set_id": row.operating_point_set_id,
            "scope_type": row.scope_type,
            "scope_id": row.scope_id,
            "scope_name": row.scope_name,
            "use_case_name": row.use_case_name,
            "time_window_name": row.time_window_name,
            "statistic_type": row.statistic_type,
            "power_type": row.power_type,
            "power_value_w": row.power_value_w,
            "development_stage": row.development_stage,
            "source_type": row.source_type,
            "confidence": row.confidence,
            "is_additive": row.is_additive,
            "context_json": row.context_json,
            "note": row.note,
        }


    @app.post("/api/power-observations")
    def create_power_observation(payload: PowerObservationCreate) -> dict[str, Any]:
        dataset_id = coalesce_power_dataset_id(payload.physical_mapping_id, payload.power_dataset_id)
        with Session(db.engine) as session:
            validate_power_context(
                session,
                payload.project_id,
                payload.impl_option_id,
                dataset_id,
                application_scenario_id=payload.application_scenario_id,
                operating_point_set_id=payload.operating_point_set_id,
                component_id=payload.scope_id if payload.scope_type == "component" else None,
            )
            if payload.power_value_w < 0:
                raise HTTPException(status_code=400, detail="power_value_w must be >= 0")
        
            obs_id = f"PO_{uuid.uuid4().hex[:8].upper()}"
            obs = PowerObservation(
                id=obs_id,
                project_id=payload.project_id,
                impl_option_id=payload.impl_option_id,
                physical_mapping_id=dataset_id,
                application_scenario_id=payload.application_scenario_id,
                operating_point_set_id=payload.operating_point_set_id,
                scope_type=payload.scope_type,
                scope_id=payload.scope_id,
                scope_name=payload.scope_name,
                use_case_name=payload.use_case_name,
                time_window_name=payload.time_window_name,
                statistic_type=payload.statistic_type,
                power_type=payload.power_type,
                power_value_w=payload.power_value_w,
                development_stage=payload.development_stage,
                source_type="web_ui",
                confidence=payload.confidence or "draft",
                is_additive=payload.is_additive,
                note=payload.note
            )
            session.add(obs)
            session.commit()
            session.refresh(obs)
            return power_observation_response(obs)


    @app.put("/api/power-observations/{observation_id}")
    def update_power_observation(observation_id: str, payload: PowerObservationCreate) -> dict[str, Any]:
        dataset_id = coalesce_power_dataset_id(payload.physical_mapping_id, payload.power_dataset_id)
        with Session(db.engine) as session:
            obs = session.get(PowerObservation, observation_id)
            if not obs:
                raise HTTPException(status_code=404, detail=f"Unknown power observation: {observation_id}")
            validate_power_context(
                session,
                payload.project_id,
                payload.impl_option_id,
                dataset_id,
                application_scenario_id=payload.application_scenario_id,
                operating_point_set_id=payload.operating_point_set_id,
                component_id=payload.scope_id if payload.scope_type == "component" else None,
            )
            if payload.power_value_w < 0:
                raise HTTPException(status_code=400, detail="power_value_w must be >= 0")
        
            # Update fields
            obs.scope_type = payload.scope_type
            obs.project_id = payload.project_id
            obs.impl_option_id = payload.impl_option_id
            obs.physical_mapping_id = dataset_id
            obs.application_scenario_id = payload.application_scenario_id
            obs.operating_point_set_id = payload.operating_point_set_id
            obs.scope_id = payload.scope_id
            obs.scope_name = payload.scope_name
            obs.use_case_name = payload.use_case_name
            obs.time_window_name = payload.time_window_name
            obs.statistic_type = payload.statistic_type
            obs.power_type = payload.power_type
            obs.power_value_w = payload.power_value_w
            obs.development_stage = payload.development_stage
            obs.confidence = payload.confidence
            obs.is_additive = payload.is_additive
            obs.note = payload.note
        
            session.add(obs)
            session.commit()
            session.refresh(obs)
            return power_observation_response(obs)


    @app.delete("/api/power-observations/{observation_id}")
    def delete_power_observation(observation_id: str) -> dict[str, Any]:
        with Session(db.engine) as session:
            obs = session.get(PowerObservation, observation_id)
            if not obs:
                raise HTTPException(status_code=404, detail=f"Unknown power observation: {observation_id}")
            session.delete(obs)
            session.commit()
            return {"success": True, "deleted_id": observation_id}
