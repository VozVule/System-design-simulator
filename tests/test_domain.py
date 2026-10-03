import pytest
from pydantic import ValidationError

from sysd_backend.models import ArchitectureDocument, ArchitectureWrite
from sysd_backend.validation import validate_graph

from tests.helpers import as_array, as_object, empty_payload, full_payload, graph_payload


def test_incomplete_documents_are_saveable() -> None:
    for payload in (empty_payload(), full_payload()):
        document = ArchitectureDocument.model_validate(payload["document"])
        assert validate_graph(document) == []


def test_dangling_connection_has_stable_issue_location() -> None:
    document = as_object(full_payload()["document"])
    document["edges"] = [{"id": "dangling", "source": "callers", "target": "missing", "order": 0, "weight": 1}]
    issues = validate_graph(ArchitectureDocument.model_validate(document))
    assert any(issue.code == "missing_endpoint" and issue.path == "/edges/0/target" for issue in issues)


@pytest.mark.parametrize(("nodes", "edges", "code"), [
    ([("a", "gateway"), ("b", "gateway")], [("a", "b", 0), ("b", "a", 0)], "cycle"),
    ([("a", "gateway")], [("a", "a", 0)], "self_connection"),
    ([("a", "gateway"), ("b", "server")], [("a", "b", 0), ("a", "b", 1)], "duplicate_connection"),
    ([("a", "gateway"), ("b", "server"), ("c", "server")], [("a", "b", 0), ("a", "c", 0)], "duplicate_order"),
    ([("a", "gateway"), ("b", "caller_group")], [("a", "b", 0)], "forbidden_incoming"),
    ([("a", "caller_group"), ("b", "server"), ("c", "server")], [("a", "b", 0), ("a", "c", 1)], "too_many_outgoing"),
    ([("a", "server"), ("b", "server"), ("c", "server")], [("a", "b", 0), ("a", "c", 1)], "too_many_outgoing"),
    ([("a", "database"), ("b", "server")], [("a", "b", 0)], "forbidden_outgoing"),
    ([("a", "gateway"), ("a", "gateway")], [], "duplicate_id"),
])
def test_forbidden_graph_shapes(nodes: list[tuple[str, str]], edges: list[tuple[str, str, int]], code: str) -> None:
    document = ArchitectureDocument.model_validate(graph_payload(nodes, edges))
    assert code in {issue.code for issue in validate_graph(document)}


def test_ids_are_unique_across_nodes_and_connections() -> None:
    payload = graph_payload([("a", "gateway"), ("b", "server")], [("a", "b", 0)])
    edge = as_object(as_array(payload["edges"])[0])
    edge["id"] = "a"
    payload["edges"] = [edge]
    issues = validate_graph(ArchitectureDocument.model_validate(payload))
    assert any(issue.code == "duplicate_id" and issue.path == "/edges/0/id" for issue in issues)


def test_acyclic_fanin_multiple_sources_order_gaps_and_zero_weights_are_allowed() -> None:
    nodes = [("source1", "caller_group"), ("source2", "caller_group"), ("router", "load_balancer"), ("left", "gateway"), ("right", "gateway"), ("server", "server"), ("db", "database")]
    edges = [("source1", "router", 0), ("source2", "router", 0), ("router", "left", 7), ("router", "right", 2), ("left", "server", 0), ("right", "server", 0), ("server", "db", 0)]
    payload = graph_payload(nodes, edges)
    document = ArchitectureDocument.model_validate(payload)
    assert validate_graph(document) == []
    assert [edge.target for edge in sorted(document.edges, key=lambda edge: edge.order) if edge.source == "router"] == ["right", "left"]
    payload["edges"] = list(reversed(as_array(payload["edges"])))
    rearranged = ArchitectureDocument.model_validate(payload)
    assert validate_graph(rearranged) == []
    assert [edge.target for edge in sorted(rearranged.edges, key=lambda edge: edge.order) if edge.source == "router"] == ["right", "left"]


def test_long_acyclic_graph_does_not_require_recursive_validation() -> None:
    payload = graph_payload([(f"node_{index}", "gateway") for index in range(1200)], [(f"node_{index}", f"node_{index + 1}", 0) for index in range(1199)])
    assert validate_graph(ArchitectureDocument.model_validate(payload)) == []


@pytest.mark.parametrize(("index", "field", "invalid"), [
    (0, "caller_count", True), (0, "caller_count", 0), (0, "test_rps", -1),
    (0, "capacity_rps", 10), (1, "capacity_rps", "100"), (1, "capacity_rps", 100.0),
    (1, "capacity_rps", 0), (1, "capacity_rps", 9_007_199_254_740_992),
    (1, "routing_policy", "random"), (1, "label", "  "), (1, "caller_count", 1),
])
def test_component_configuration_is_strict(index: int, field: str, invalid: object) -> None:
    payload = full_payload()
    document = as_object(payload["document"])
    nodes = as_array(document["nodes"])
    node = as_object(nodes[index])
    node[field] = invalid
    nodes[index] = node
    document["nodes"] = nodes
    payload["document"] = document
    with pytest.raises(ValidationError):
        ArchitectureWrite.model_validate(payload)


@pytest.mark.parametrize("invalid", [True, "1", 1.0, 2])
def test_format_version_is_strict(invalid: object) -> None:
    payload = {"format_version": invalid, "nodes": [], "edges": []}
    with pytest.raises(ValidationError):
        ArchitectureDocument.model_validate(payload)


@pytest.mark.parametrize("invalid", [-1, "1", True, float("nan"), float("inf")])
def test_weights_must_be_nonnegative_finite_numbers(invalid: object) -> None:
    payload = graph_payload([("a", "gateway"), ("b", "server")], [("a", "b", 0)])
    edge = as_object(as_array(payload["edges"])[0])
    edge["weight"] = invalid
    payload["edges"] = [edge]
    with pytest.raises(ValidationError):
        ArchitectureDocument.model_validate(payload)
