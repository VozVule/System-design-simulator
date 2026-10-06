"""Deterministic aggregate request/response calculation, independent of HTTP/storage."""

from collections import deque
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal, TypeAlias

from sysd_backend.errors import SimulationInvalid
from sysd_backend.models import ArchitectureDocument, Connection, DetailCode, MAX_INTEGER, ValidationIssue
from sysd_backend.simulation_models import (
    CallerFrame, EdgeFrame, NodeFrame, ProcessingFrame, SimulationFrame, SimulationRequest,
    SimulationResult, SimulationSnapshot, SimulationTotals, TickCounts,
)
from sysd_backend.validation import validate_graph


@dataclass(frozen=True, order=True)
class Cohort:
    caller_id: str
    prefix: tuple[str, ...]
    phase: Literal["request", "response"]


Arrivals: TypeAlias = dict[str, dict[Cohort, int]]


@dataclass
class RoutingState:
    destinations: tuple[Connection, ...]
    weights: tuple[int, ...]
    cursor: int = 0


def outgoing_connections(document: ArchitectureDocument) -> dict[str, tuple[Connection, ...]]:
    outgoing: dict[str, list[Connection]] = {node.id: [] for node in document.nodes}
    for edge in document.edges:
        outgoing[edge.source].append(edge)
    return {node_id: tuple(sorted(edges, key=lambda edge: edge.order)) for node_id, edges in outgoing.items()}


def validate_count_range(request: SimulationRequest) -> list[ValidationIssue]:
    planned_generated = request.total_ticks * sum(
        node.test_rps for node in request.document.nodes if node.type == "caller_group"
    )
    if planned_generated > MAX_INTEGER:
        return [ValidationIssue(
            path="/total_ticks", code="count_overflow",
            message="Planned generated requests exceed the exact count range. Reduce steps or Caller Group RPS.",
        )]
    return []


def validate_simulation(request: SimulationRequest) -> list[ValidationIssue]:
    """Return body-relative issues; incomplete documents remain valid for Save."""
    document = request.document
    structural = validate_graph(document)
    if structural:
        return [ValidationIssue(path="/document" + issue.path, code=issue.code, message=issue.message) for issue in structural]
    issues: list[ValidationIssue] = []

    def report(path: str, code: DetailCode, message: str) -> None:
        issues.append(ValidationIssue(path=path, code=code, message=message))

    callers = [node.id for node in document.nodes if node.type == "caller_group"]
    if not callers:
        report("/document/nodes", "missing_source", "Add at least one Caller Group.")
    outgoing = outgoing_connections(document)
    for index, node in enumerate(document.nodes):
        path = f"/document/nodes/{index}"
        destinations = outgoing[node.id]
        if node.type in ("caller_group", "load_balancer", "gateway") and not destinations:
            report(path, "missing_destination", "Connect this component to a request destination.")
        elif node.type in ("load_balancer", "gateway") and node.routing_policy == "weighted" and not any(edge.weight > 0 for edge in destinations):
            report(path + "/routing_policy", "all_zero_weights", "Give at least one destination a positive routing weight.")
    reachable = set(callers)
    pending = deque(callers)
    while pending:
        for edge in outgoing[pending.popleft()]:
            if edge.target not in reachable:
                reachable.add(edge.target)
                pending.append(edge.target)
    for index, node in enumerate(document.nodes):
        if node.id not in reachable:
            report(f"/document/nodes/{index}", "unreachable_component", "Connect this component to a path from a Caller Group.")
    issues.extend(validate_count_range(request))
    return issues


def proportional_allocation(quota: int, weights: Sequence[int]) -> list[int]:
    """Exact floors, then one remainder per positive entry in stable order."""
    total = sum(weights)
    if not total or not quota:
        return [0] * len(weights)
    allocations = [quota * weight // total for weight in weights]
    remainder = quota - sum(allocations)
    for index, weight in enumerate(weights):
        if remainder == 0:
            break
        if weight > 0:
            allocations[index] += 1
            remainder -= 1
    return allocations


def exact_weights(destinations: Sequence[Connection]) -> tuple[int, ...]:
    # Validated float ratios have power-of-two denominators. Their largest
    # denominator is a common multiple, including subnormal and large values.
    ratios = [edge.weight.as_integer_ratio() for edge in destinations]
    denominator = max((ratio[1] for ratio in ratios), default=1)
    return tuple(numerator * (denominator // divisor) for numerator, divisor in ratios)


def round_robin_allocation(count: int, state: RoutingState) -> list[int]:
    destinations = len(state.destinations)
    allocations = [count // destinations] * destinations
    for offset in range(count % destinations):
        allocations[(state.cursor + offset) % destinations] += 1
    state.cursor = (state.cursor + count) % destinations
    return allocations


def empty_frame(document: ArchitectureDocument, tick: int) -> SimulationFrame:
    nodes: dict[str, NodeFrame] = {}
    for node in document.nodes:
        nodes[node.id] = CallerFrame(generated=0, completed=0) if node.type == "caller_group" else ProcessingFrame(
            received=0, handled=0, dropped=0, responses_received=0, responses_returned=0,
        )
    return SimulationFrame(
        tick=tick, nodes=nodes,
        edges={edge.id: EdgeFrame(forwarded=0, returned=0) for edge in document.edges},
        counts=TickCounts(generated=0, completed=0, dropped=0),
        totals=SimulationTotals(generated=0, completed=0, dropped=0, in_flight=0),
    )


def merge_arrival(arrivals: Arrivals, receiving_id: str, cohort: Cohort, count: int) -> None:
    if count:
        destination = arrivals.setdefault(receiving_id, {})
        destination[cohort] = destination.get(cohort, 0) + count


def forward(edge: Connection, cohort: Cohort, count: int, arrivals: Arrivals, frame: SimulationFrame) -> None:
    if count:
        frame.edges[edge.id].forwarded += count
        merge_arrival(arrivals, edge.target, Cohort(cohort.caller_id, cohort.prefix + (edge.id,), "request"), count)


def respond(cohort: Cohort, count: int, edges: dict[str, Connection], arrivals: Arrivals, frame: SimulationFrame) -> None:
    if count:
        edge = edges[cohort.prefix[-1]]
        frame.edges[edge.id].returned += count
        merge_arrival(arrivals, edge.source, Cohort(cohort.caller_id, cohort.prefix[:-1], "response"), count)


def simulate(request: SimulationRequest) -> SimulationResult:
    issues = validate_simulation(request)
    if issues:
        raise SimulationInvalid(issues)
    snapshot = SimulationSnapshot(document=request.document.model_copy(deep=True), total_ticks=request.total_ticks)
    document = snapshot.document
    outgoing = outgoing_connections(document)
    edges = {edge.id: edge for edge in document.edges}
    routing = {
        node.id: RoutingState(outgoing[node.id], exact_weights(outgoing[node.id]))
        for node in document.nodes if node.type in ("load_balancer", "gateway")
    }
    current: Arrivals = {}
    frames = [empty_frame(document, 0)]
    for tick in range(1, snapshot.total_ticks + 1):
        following: Arrivals = {}
        frame = empty_frame(document, tick)
        for node in document.nodes:
            metrics = frame.nodes[node.id]
            arrivals = current.get(node.id, {})
            requests = sorted((cohort, count) for cohort, count in arrivals.items() if cohort.phase == "request")
            replies = [(cohort, count) for cohort, count in arrivals.items() if cohort.phase == "response"]
            if node.type == "caller_group":
                assert isinstance(metrics, CallerFrame)
                metrics.generated = node.test_rps
                metrics.completed = sum(count for _, count in replies)
                forward(outgoing[node.id][0], Cohort(node.id, (), "request"), node.test_rps, following, frame)
                frame.counts.generated += metrics.generated
                frame.counts.completed += metrics.completed
                continue
            assert isinstance(metrics, ProcessingFrame)
            metrics.received = sum(count for _, count in requests)
            metrics.handled = min(metrics.received, node.capacity_rps)
            metrics.dropped = metrics.received - metrics.handled
            frame.counts.dropped += metrics.dropped
            accepted = proportional_allocation(metrics.handled, [count for _, count in requests])
            destinations = outgoing[node.id]
            state = routing.get(node.id)
            remaining_quotas = proportional_allocation(metrics.handled, state.weights) if state is not None and node.type in ("load_balancer", "gateway") and node.routing_policy == "weighted" else []
            for (cohort, _), count in zip(requests, accepted, strict=True):
                if not count:
                    continue
                if not destinations:
                    respond(cohort, count, edges, following, frame)
                    metrics.responses_returned += count
                elif state is None:
                    forward(destinations[0], cohort, count, following, frame)
                else:
                    if node.type in ("load_balancer", "gateway") and node.routing_policy == "weighted":
                        allocations = proportional_allocation(count, remaining_quotas)
                        remaining_quotas = [quota - allocation for quota, allocation in zip(remaining_quotas, allocations, strict=True)]
                    else:
                        allocations = round_robin_allocation(count, state)
                    for edge, allocation in zip(destinations, allocations, strict=True):
                        forward(edge, cohort, allocation, following, frame)
            metrics.responses_received = sum(count for _, count in replies)
            metrics.responses_returned += metrics.responses_received
            for cohort, count in replies:
                respond(cohort, count, edges, following, frame)
        previous = frames[-1].totals
        frame.totals = SimulationTotals(
            generated=previous.generated + frame.counts.generated,
            completed=previous.completed + frame.counts.completed,
            dropped=previous.dropped + frame.counts.dropped,
            in_flight=sum(sum(cohorts.values()) for cohorts in following.values()),
        )
        frames.append(frame)
        current = following
    return SimulationResult(snapshot=snapshot, frames=frames, summary=frames[-1].totals.model_copy())
