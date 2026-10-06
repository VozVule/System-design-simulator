import json
from pathlib import Path

from sysd_backend.domain.component_types import ComponentType, ROUTER_COMPONENT_TYPES
from sysd_backend.domain.routing_policies import RoutingPolicy


ROOT = Path(__file__).resolve().parents[1]


def as_object(value: object) -> dict[str, object]:
    assert isinstance(value, dict)
    result: dict[str, object] = {}
    for key, item in value.items():
        assert isinstance(key, str)
        result[key] = item
    return result


def as_array(value: object) -> list[object]:
    assert isinstance(value, list)
    return list(value)


def contract() -> dict[str, object]:
    return as_object(json.loads((ROOT / "specs/backend/backend-api.openapi.json").read_text()))


def full_payload() -> dict[str, object]:
    components = as_object(contract()["components"])
    bodies = as_object(components["requestBodies"])
    write = as_object(bodies["ArchitectureWrite"])
    content = as_object(write["content"])
    media = as_object(content["application/json"])
    examples = as_object(media["examples"])
    return as_object(as_object(examples["all_components"])["value"])


def empty_payload(name: str = "Untitled") -> dict[str, object]:
    return {"name": name, "document": {"format_version": 1, "nodes": [], "edges": []}}


def graph_payload(nodes: list[tuple[str, ComponentType]], edges: list[tuple[str, str, int]]) -> dict[str, object]:
    components: list[dict[str, object]] = []
    for node_id, kind in nodes:
        node: dict[str, object] = {"id": node_id, "type": kind, "label": node_id, "position": {"x": 0, "y": 0}, "capacity_rps": 10}
        if kind == ComponentType.CALLER_GROUP:
            node.update(capacity_rps=None, caller_count=1, test_rps=0)
        if kind in ROUTER_COMPONENT_TYPES:
            node["routing_policy"] = RoutingPolicy.WEIGHTED
        components.append(node)
    connections = [{"id": f"edge_{index}", "source": source, "target": target, "order": order, "weight": 0} for index, (source, target, order) in enumerate(edges)]
    return {"format_version": 1, "nodes": components, "edges": connections}
