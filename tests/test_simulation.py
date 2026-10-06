from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace

import pytest
from pydantic import ValidationError

from sysd_backend.errors import SimulationInvalid
from sysd_backend.models import ArchitectureDocument, CallerGroup, MAX_INTEGER
from sysd_backend.simulation import (
    Cohort, RoutingState, merge_arrival, proportional_allocation, round_robin_allocation,
    simulate, validate_count_range, validate_simulation,
)
from sysd_backend.simulation_models import (
    CallerFrame, ProcessingFrame, SimulationFrame, SimulationRequest, SimulationResult, SimulationTotals,
)

from tests.helpers import as_array, as_object, graph_payload


def request_for(
    nodes: list[tuple[str, str]],
    edges: list[tuple[str, str, int]],
    *,
    ticks: int = 60,
    sources: dict[str, int] | None = None,
    capacities: dict[str, int] | None = None,
    policies: dict[str, str] | None = None,
    weights: list[float] | None = None,
) -> SimulationRequest:
    raw = graph_payload(nodes, edges)
    raw_nodes = [as_object(value) for value in as_array(raw["nodes"])]
    for node in raw_nodes:
        node_id = node["id"]
        assert isinstance(node_id, str)
        if node["type"] == "caller_group":
            node["test_rps"] = (sources or {}).get(node_id, 100)
        else:
            node["capacity_rps"] = (capacities or {}).get(node_id, 100)
        if node["type"] in ("gateway", "load_balancer"):
            node["routing_policy"] = (policies or {}).get(node_id, "round_robin")
    raw_edges = [as_object(value) for value in as_array(raw["edges"])]
    for index, edge in enumerate(raw_edges):
        edge["weight"] = weights[index] if weights else 1.0
    raw.update(nodes=raw_nodes, edges=raw_edges)
    return SimulationRequest(document=ArchitectureDocument.model_validate(raw), total_ticks=ticks)


def reference_request(ticks: int = 60) -> SimulationRequest:
    return request_for(
        [("caller", "caller_group"), ("lb", "load_balancer"), ("server", "server"), ("database", "database")],
        [("caller", "lb", 0), ("lb", "server", 0), ("server", "database", 0)],
        ticks=ticks, capacities={"server": 60, "database": 60},
    )


def processing(frame: SimulationFrame, node_id: str) -> ProcessingFrame:
    value = frame.nodes[node_id]
    assert isinstance(value, ProcessingFrame)
    return value


def caller(frame: SimulationFrame, node_id: str) -> CallerFrame:
    value = frame.nodes[node_id]
    assert isinstance(value, CallerFrame)
    return value


def assert_accounting(result: SimulationResult) -> None:
    document = result.snapshot.document
    assert len(result.frames) == result.snapshot.total_ticks + 1
    assert result.summary == result.frames[-1].totals
    for tick, frame in enumerate(result.frames):
        assert frame.tick == tick
        assert set(frame.nodes) == {node.id for node in document.nodes}
        assert set(frame.edges) == {edge.id for edge in document.edges}
        assert frame.totals.generated == frame.totals.completed + frame.totals.dropped + frame.totals.in_flight
        assert frame.totals.in_flight == sum(edge.forwarded + edge.returned for edge in frame.edges.values())
        generated = completed = dropped = 0
        for node in document.nodes:
            incoming = [edge for edge in document.edges if edge.target == node.id]
            outgoing = [edge for edge in document.edges if edge.source == node.id]
            if node.type == "caller_group":
                value = caller(frame, node.id)
                generated += value.generated
                completed += value.completed
                assert value.generated == sum(frame.edges[edge.id].forwarded for edge in outgoing)
                if tick:
                    assert value.completed == sum(result.frames[tick - 1].edges[edge.id].returned for edge in outgoing)
            else:
                metrics = processing(frame, node.id)
                assert metrics.received == metrics.handled + metrics.dropped
                assert metrics.handled <= node.capacity_rps
                dropped += metrics.dropped
                assert metrics.responses_returned == sum(frame.edges[edge.id].returned for edge in incoming)
                if outgoing:
                    assert metrics.handled == sum(frame.edges[edge.id].forwarded for edge in outgoing)
                    assert metrics.responses_returned == metrics.responses_received
                else:
                    assert metrics.responses_returned == metrics.handled
                    assert metrics.responses_received == 0
                if tick:
                    prior = result.frames[tick - 1]
                    assert metrics.received == sum(prior.edges[edge.id].forwarded for edge in incoming)
                    assert metrics.responses_received == sum(prior.edges[edge.id].returned for edge in outgoing)
        assert frame.counts.model_dump() == {"generated": generated, "completed": completed, "dropped": dropped}


def test_full_reference_round_trip_and_recording() -> None:
    request = reference_request()
    result = simulate(request)
    assert result.snapshot.document == request.document
    assert result.snapshot.document is not request.document
    assert result.snapshot.total_ticks == 60
    assert result.summary == SimulationTotals(generated=6000, completed=3240, dropped=2320, in_flight=440)
    assert len(result.frames) == 61
    frame3 = result.frames[3]
    assert processing(frame3, "server") == ProcessingFrame(received=100, handled=60, dropped=40, responses_received=0, responses_returned=0)
    assert frame3.totals == SimulationTotals(generated=300, completed=0, dropped=40, in_flight=260)
    frame7 = result.frames[7]
    assert caller(frame7, "caller").completed == 60
    assert caller(result.frames[6], "caller").completed == 0
    assert processing(result.frames[4], "database").responses_returned == 60
    assert processing(result.frames[5], "server").responses_received == 60
    assert processing(result.frames[6], "lb").responses_received == 60
    assert frame7.totals == SimulationTotals(generated=700, completed=60, dropped=200, in_flight=440)
    assert sum(processing(frame, "database").handled for frame in result.frames) == 3420
    assert sum(edge.forwarded for edge in result.frames[-1].edges.values()) == 260
    assert sum(edge.returned for edge in result.frames[-1].edges.values()) == 180
    assert simulate(request) == result
    assert_accounting(result)


@pytest.mark.parametrize(("ticks", "generated", "completed", "dropped", "in_flight"), [
    (1, 100, 0, 0, 100), (2, 200, 0, 40, 160), (3, 300, 60, 80, 160),
])
def test_terminal_server_does_not_drain(ticks: int, generated: int, completed: int, dropped: int, in_flight: int) -> None:
    result = simulate(request_for([("caller", "caller_group"), ("server", "server")], [("caller", "server", 0)], ticks=ticks, capacities={"server": 60}))
    assert result.summary == SimulationTotals(generated=generated, completed=completed, dropped=dropped, in_flight=in_flight)
    assert len(result.frames) == ticks + 1
    assert_accounting(result)


def test_cohort_admission_is_shared_and_returns_to_each_caller() -> None:
    request = request_for(
        [("caller-b", "caller_group"), ("server", "server"), ("caller-a", "caller_group")],
        [("caller-b", "server", 0), ("caller-a", "server", 0)], ticks=3,
        sources={"caller-a": 70, "caller-b": 50},
    )
    result = simulate(request)
    assert processing(result.frames[2], "server").received == 120
    assert processing(result.frames[2], "server").handled == 100
    assert processing(result.frames[2], "server").dropped == 20
    assert caller(result.frames[3], "caller-a").completed == 59
    assert caller(result.frames[3], "caller-b").completed == 41
    assert_accounting(result)


def test_round_robin_cursor_is_shared_across_cohorts_and_ignores_drops() -> None:
    request = request_for(
        [("a", "caller_group"), ("b", "caller_group"), ("lb", "load_balancer"), ("left", "server"), ("right", "server")],
        [("a", "lb", 0), ("b", "lb", 0), ("lb", "left", 9), ("lb", "right", 2)], ticks=5,
        sources={"a": 3, "b": 2}, capacities={"lb": 3}, weights=[0, 0, 0, 0],
    )
    result = simulate(request)
    assert [(frame.edges["edge_3"].forwarded, frame.edges["edge_2"].forwarded) for frame in result.frames[2:]] == [(2, 1), (1, 2), (2, 1), (1, 2)]
    assert [processing(frame, "lb").dropped for frame in result.frames[2:]] == [2] * 4
    assert simulate(request).frames == result.frames
    state = RoutingState(tuple(request.document.edges[2:]), (0, 0), cursor=1)
    assert round_robin_allocation(0, state) == [0, 0] and state.cursor == 1
    assert round_robin_allocation(3, state) == [1, 2] and state.cursor == 0
    assert_accounting(result)


@pytest.mark.parametrize("weights", [
    [0.0, 0.25, 0.75], [0.0, 1e308, 1e308], [0.0, 5e-324, 5e-324],
])
def test_weighted_routing_conserves_fractional_large_and_subnormal_weights(weights: list[float]) -> None:
    request = request_for(
        [("caller", "caller_group"), ("gateway", "gateway"), ("zero", "server"), ("left", "server"), ("right", "server")],
        [("caller", "gateway", 0), ("gateway", "zero", 0), ("gateway", "left", 1), ("gateway", "right", 2)],
        ticks=5, sources={"caller": 3}, policies={"gateway": "weighted"}, weights=[1, *weights],
    )
    result = simulate(request)
    expected = (1, 2) if weights[1] != weights[2] else (2, 1)
    for frame in result.frames[2:]:
        assert frame.edges["edge_1"].forwarded == 0
        assert (frame.edges["edge_2"].forwarded, frame.edges["edge_3"].forwarded) == expected
    assert_accounting(result)


def test_weighted_overflow_is_not_redistributed_and_creates_no_error_reply() -> None:
    result = simulate(request_for(
        [("caller", "caller_group"), ("gateway", "gateway"), ("left", "server"), ("right", "server")],
        [("caller", "gateway", 0), ("gateway", "left", 0), ("gateway", "right", 1)], ticks=5,
        policies={"gateway": "weighted"}, weights=[1, 70, 30], capacities={"left": 50},
    ))
    assert processing(result.frames[3], "left") == ProcessingFrame(received=70, handled=50, dropped=20, responses_received=0, responses_returned=50)
    assert processing(result.frames[3], "right").responses_returned == 30
    assert caller(result.frames[4], "caller").completed == 0
    assert caller(result.frames[5], "caller").completed == 80
    assert result.frames[4].edges["edge_0"].returned == 80
    assert_accounting(result)


def test_weighted_global_quota_across_one_request_cohorts() -> None:
    result = simulate(request_for(
        [("a", "caller_group"), ("b", "caller_group"), ("c", "caller_group"), ("lb", "load_balancer"), ("left", "server"), ("right", "server")],
        [("a", "lb", 0), ("b", "lb", 0), ("c", "lb", 0), ("lb", "left", 0), ("lb", "right", 1)],
        ticks=5, sources={"a": 1, "b": 1, "c": 1}, policies={"lb": "weighted"}, capacities={"left": 1},
    ))
    assert result.frames[2].edges["edge_3"].forwarded == 2
    assert result.frames[2].edges["edge_4"].forwarded == 1
    assert caller(result.frames[5], "a").completed == 1
    assert caller(result.frames[5], "b").completed == 0
    assert caller(result.frames[5], "c").completed == 1
    assert_accounting(result)


def test_actual_return_paths_survive_branch_fanin_capacity_and_changed_cursor() -> None:
    request = request_for(
        [("caller-a", "caller_group"), ("caller-b", "caller_group"), ("split", "load_balancer"), ("left", "gateway"), ("right", "gateway"), ("merge", "gateway"), ("server", "server"), ("db", "database")],
        [("caller-a", "split", 0), ("caller-b", "split", 0), ("split", "left", 3), ("split", "right", 8), ("left", "merge", 0), ("right", "merge", 0), ("merge", "server", 0), ("server", "db", 0)],
        ticks=20, sources={"caller-a": 3, "caller-b": 2}, capacities={"merge": 3},
    )
    result = simulate(request)
    assert_accounting(result)
    assert caller(result.frames[11], "caller-a").completed == 3
    assert caller(result.frames[11], "caller-b").completed == 0
    # Admission is per stable path cohort, so these fixed remainders admit
    # all three caller-a requests even when its split changes on the next tick.
    assert caller(result.frames[12], "caller-a").completed == 3
    assert caller(result.frames[12], "caller-b").completed == 0
    assert result.frames[8].edges["edge_4"].returned == result.frames[9].edges["edge_2"].returned
    assert result.frames[8].edges["edge_5"].returned == result.frames[9].edges["edge_3"].returned
    reordered = request.model_copy(deep=True)
    reordered.document.nodes.reverse()
    reordered.document.edges.reverse()
    again = simulate(reordered)
    assert again.frames == result.frames and again.summary == result.summary
    assert [node.id for node in again.snapshot.document.nodes] == [node.id for node in reordered.document.nodes]


def test_identical_remaining_response_prefixes_merge_but_distinct_paths_do_not() -> None:
    arrivals: dict[str, dict[Cohort, int]] = {}
    request = Cohort("caller", ("first", "left"), "request")
    merge_arrival(arrivals, "merge", request, 2)
    merge_arrival(arrivals, "merge", replace(request, prefix=("first", "right")), 3)
    merge_arrival(arrivals, "merge", request, 4)
    assert len(arrivals["merge"]) == 2 and arrivals["merge"][request] == 6
    reply = Cohort("caller", ("first",), "response")
    merge_arrival(arrivals, "router", reply, 2)
    merge_arrival(arrivals, "router", reply, 3)
    merge_arrival(arrivals, "router", reply, 0)
    assert arrivals["router"] == {reply: 5}


def test_nonterminal_capacity_is_free_for_returned_replies() -> None:
    result = simulate(reference_request(8))
    server = processing(result.frames[7], "server")
    assert server.handled == 60 and server.responses_received == 60 and server.responses_returned == 60
    assert result.frames[7].edges["edge_2"].forwarded == 60 and result.frames[7].edges["edge_1"].returned == 60


def test_zero_rps_and_zero_weight_reachable_nodes_are_valid() -> None:
    request = request_for(
        [("a", "caller_group"), ("b", "caller_group"), ("lb", "load_balancer"), ("left", "server"), ("right", "database"), ("terminal", "server")],
        [("a", "lb", 0), ("lb", "left", 0), ("lb", "right", 1), ("b", "terminal", 0)],
        sources={"a": 0, "b": 0}, policies={"lb": "weighted"}, weights=[1, 1, 0, 1],
    )
    assert validate_simulation(request) == []
    result = simulate(request)
    assert result.summary == SimulationTotals(generated=0, completed=0, dropped=0, in_flight=0)
    assert_accounting(result)


@pytest.mark.parametrize(("nodes", "edges", "codes"), [
    ([], [], {"missing_source"}),
    ([("server", "server")], [], {"missing_source", "unreachable_component"}),
    ([("caller", "caller_group")], [], {"missing_destination"}),
    ([("caller", "caller_group"), ("gateway", "gateway")], [("caller", "gateway", 0)], {"missing_destination"}),
    ([("caller", "caller_group"), ("server", "server"), ("db", "database")], [("caller", "server", 0)], {"unreachable_component"}),
])
def test_not_ready_graphs(nodes: list[tuple[str, str]], edges: list[tuple[str, str, int]], codes: set[str]) -> None:
    request = request_for(nodes, edges)
    assert {issue.code for issue in validate_simulation(request)} == codes
    with pytest.raises(SimulationInvalid):
        simulate(request)


def test_no_destination_does_not_also_report_zero_weights() -> None:
    request = request_for([("caller", "caller_group"), ("lb", "load_balancer")], [("caller", "lb", 0)], policies={"lb": "weighted"})
    assert [issue.code for issue in validate_simulation(request)] == ["missing_destination"]
    weighted = request_for([("caller", "caller_group"), ("lb", "load_balancer"), ("server", "server")], [("caller", "lb", 0), ("lb", "server", 0)], policies={"lb": "weighted"}, weights=[1, 0])
    assert [(issue.code, issue.path) for issue in validate_simulation(weighted)] == [("all_zero_weights", "/document/nodes/1/routing_policy")]


def test_structural_errors_precede_readiness() -> None:
    request = request_for([("lb", "load_balancer")], [("lb", "missing", 0)])
    issues = validate_simulation(request)
    assert [(issue.code, issue.path) for issue in issues] == [("missing_endpoint", "/document/edges/0/target")]


def test_safe_count_range_exact_arithmetic_before_allocation() -> None:
    request = request_for([("caller", "caller_group"), ("server", "server")], [("caller", "server", 0)], ticks=1, sources={"caller": MAX_INTEGER}, capacities={"server": MAX_INTEGER})
    assert validate_count_range(request) == []
    result = simulate(request)
    assert result.summary.generated == MAX_INTEGER and result.summary.in_flight == MAX_INTEGER
    request.total_ticks = 2
    assert [issue.code for issue in validate_count_range(request)] == ["count_overflow"]
    with pytest.raises(SimulationInvalid):
        simulate(request)
    request.total_ticks = MAX_INTEGER
    assert [issue.code for issue in validate_count_range(request)] == ["count_overflow"]
    node = request.document.nodes[0]
    assert isinstance(node, CallerGroup)
    node.test_rps = 0
    assert validate_count_range(request) == []  # Validate independently: no impractical allocation.


def test_request_volume_does_not_require_per_request_work() -> None:
    count = MAX_INTEGER // 5
    result = simulate(request_for(
        [("caller", "caller_group"), ("lb", "load_balancer"), ("left", "server"), ("right", "server")],
        [("caller", "lb", 0), ("lb", "left", 0), ("lb", "right", 1)], ticks=5,
        sources={"caller": count}, capacities={"lb": MAX_INTEGER, "left": MAX_INTEGER, "right": MAX_INTEGER},
    ))
    assert result.summary.generated == count * 5
    assert caller(result.frames[5], "caller").completed == count
    assert_accounting(result)


def test_many_cohort_allocations_conserve_every_quota() -> None:
    for weights in ([1, 1], [0, 1, 3], [70, 50], [0, 0, 3, 2, 1], [10**300, 10**200, 1]):
        for quota in range(20):
            allocated = proportional_allocation(quota, weights)
            assert sum(allocated) == quota
            assert all(not value for weight, value in zip(weights, allocated, strict=True) if not weight)
    remaining = [2, 1, 0]
    totals: Counter[int] = Counter()
    for count in [1, 1, 1]:
        allocated = proportional_allocation(count, remaining)
        assert all(value <= quota for value, quota in zip(allocated, remaining, strict=True))
        remaining = [quota - value for value, quota in zip(allocated, remaining, strict=True)]
        totals.update(dict(enumerate(allocated)))
    assert remaining == [0, 0, 0] and totals == {0: 2, 1: 1, 2: 0}


def test_parallel_engine_runs_have_independent_state() -> None:
    request = request_for(
        [("caller", "caller_group"), ("lb", "load_balancer"), ("left", "server"), ("right", "server")],
        [("caller", "lb", 0), ("lb", "left", 0), ("lb", "right", 1)], sources={"caller": 3},
    )
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(simulate, [request] * 8))
    assert all(result == results[0] for result in results)
    assert request.document == results[0].snapshot.document


def test_generated_response_validation_rejects_partial_and_inconsistent_results() -> None:
    result = simulate(reference_request(7))
    raw = result.model_dump(mode="json")
    raw["frames"] = raw["frames"][:-1]
    with pytest.raises(ValidationError):
        SimulationResult.model_validate(raw)
    incorrect = result.model_copy(deep=True)
    incorrect.frames[2].nodes["caller"] = ProcessingFrame(received=0, handled=0, dropped=0, responses_received=0, responses_returned=0)
    with pytest.raises(ValidationError):
        SimulationResult(snapshot=incorrect.snapshot, frames=incorrect.frames, summary=incorrect.summary)
    wrong_counts = result.model_copy(deep=True)
    wrong_counts.frames[1].totals.generated += 1
    with pytest.raises(ValidationError):
        SimulationResult(snapshot=wrong_counts.snapshot, frames=wrong_counts.frames, summary=wrong_counts.summary)


@pytest.mark.parametrize("total_ticks", [True, 60.0, "60", None, 0, -1, MAX_INTEGER + 1])
def test_total_ticks_is_a_required_positive_json_integer(total_ticks: object) -> None:
    with pytest.raises(ValidationError):
        SimulationRequest.model_validate({"document": reference_request().document.model_dump(), "total_ticks": total_ticks})


def test_twenty_component_chain_records_complete_flow() -> None:
    nodes = [("caller", "caller_group"), *[(f"server{index}", "server") for index in range(18)], ("db", "database")]
    edges = [(nodes[index][0], nodes[index + 1][0], 0) for index in range(19)]
    result = simulate(request_for(nodes, edges, ticks=60))
    assert caller(result.frames[38], "caller").completed == 0
    assert caller(result.frames[39], "caller").completed == 100
    assert result.summary.completed == 2200 and result.summary.in_flight == 3800
    assert_accounting(result)


def twenty_component_fanin_request() -> SimulationRequest:
    nodes = [
        ("caller-a", "caller_group"), ("caller-b", "caller_group"), ("split", "load_balancer"),
        *[(f"branch{index}", "gateway") for index in range(6)], ("merge", "gateway"),
        *[(f"server{index}", "server") for index in range(9)], ("db", "database"),
    ]
    edges = [
        ("caller-a", "split", 0), ("caller-b", "split", 0),
        *[("split", f"branch{index}", index * 2) for index in range(6)],
        *[(f"branch{index}", "merge", 0) for index in range(6)],
        ("merge", "server0", 0), *[(f"server{index}", f"server{index + 1}", 0) for index in range(8)],
        ("server8", "db", 0),
    ]
    return request_for(
        nodes, edges, sources={"caller-a": 70, "caller-b": 50},
        capacities={"split": 120, "merge": 100}, policies={"split": "weighted"},
        weights=[1, 1, *[float(index + 1) for index in range(6)], *([1.0] * 16)],
    )


def test_twenty_component_branch_fanin_preserves_attribution_and_global_accounting() -> None:
    request = twenty_component_fanin_request()
    assert len(request.document.nodes) == 20 and len(request.document.edges) == 24
    result = simulate(request)
    assert processing(result.frames[4], "merge").received == 120
    assert processing(result.frames[4], "merge").handled == 100
    assert processing(result.frames[4], "merge").dropped == 20
    assert result.frames[2].edges["edge_2"].forwarded == 6
    assert result.frames[2].edges["edge_7"].forwarded == 34
    assert caller(result.frames[27], "caller-a").completed + caller(result.frames[27], "caller-b").completed == 100
    assert result.summary.completed == 3400
    assert_accounting(result)
