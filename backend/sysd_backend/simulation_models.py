"""Strict, transport-independent input and output for a recorded simulation."""

from typing import Self, TypeAlias

from pydantic import model_validator

from sysd_backend.domain.component_types import ComponentType
from sysd_backend.models import ArchitectureDocument, ElementId, NonnegativeInteger, PositiveInteger, StrictModel


class SimulationRequest(StrictModel):
    document: ArchitectureDocument
    total_ticks: PositiveInteger


class SimulationSnapshot(SimulationRequest):
    pass


class CallerFrame(StrictModel):
    generated: NonnegativeInteger
    completed: NonnegativeInteger


class ProcessingFrame(StrictModel):
    received: NonnegativeInteger
    handled: NonnegativeInteger
    dropped: NonnegativeInteger
    responses_received: NonnegativeInteger
    responses_returned: NonnegativeInteger


NodeFrame: TypeAlias = CallerFrame | ProcessingFrame


class EdgeFrame(StrictModel):
    forwarded: NonnegativeInteger
    returned: NonnegativeInteger


class TickCounts(StrictModel):
    generated: NonnegativeInteger
    completed: NonnegativeInteger
    dropped: NonnegativeInteger


class SimulationTotals(TickCounts):
    in_flight: NonnegativeInteger


class SimulationFrame(StrictModel):
    tick: NonnegativeInteger
    nodes: dict[ElementId, NodeFrame]
    edges: dict[ElementId, EdgeFrame]
    counts: TickCounts
    totals: SimulationTotals


class SimulationResult(StrictModel):
    snapshot: SimulationSnapshot
    frames: list[SimulationFrame]
    summary: SimulationTotals

    @model_validator(mode="after")
    def valid_recording(self) -> Self:
        """Do not publish a partial recording or inconsistent generated result."""
        document = self.snapshot.document
        expected_nodes = {node.id for node in document.nodes}
        expected_edges = {edge.id for edge in document.edges}
        if len(self.frames) != self.snapshot.total_ticks + 1:
            raise ValueError("Recording must contain every tick, including tick zero.")
        cumulative = TickCounts(generated=0, completed=0, dropped=0)
        for tick, frame in enumerate(self.frames):
            if frame.tick != tick or set(frame.nodes) != expected_nodes or set(frame.edges) != expected_edges:
                raise ValueError("Recording tick and component coverage must match the snapshot.")
            for node in document.nodes:
                metrics = frame.nodes[node.id]
                if (node.type == ComponentType.CALLER_GROUP) != isinstance(metrics, CallerFrame):
                    raise ValueError("Node metrics must match the snapshot component type.")
                if isinstance(metrics, ProcessingFrame) and metrics.received != metrics.handled + metrics.dropped:
                    raise ValueError("Received requests must equal handled plus dropped requests.")
            if tick == 0 and (
                any(value.model_dump() != dict.fromkeys(type(value).model_fields, 0) for value in frame.nodes.values())
                or any(value.forwarded or value.returned for value in frame.edges.values())
                or frame.counts != cumulative
            ):
                raise ValueError("Tick zero must be empty.")
            cumulative = TickCounts(
                generated=cumulative.generated + frame.counts.generated,
                completed=cumulative.completed + frame.counts.completed,
                dropped=cumulative.dropped + frame.counts.dropped,
            )
            totals = frame.totals
            if (totals.generated, totals.completed, totals.dropped) != (
                cumulative.generated, cumulative.completed, cumulative.dropped,
            ):
                raise ValueError("Recording totals must equal cumulative tick counts.")
            if totals.generated != totals.completed + totals.dropped + totals.in_flight:
                raise ValueError("Recording must conserve generated request attempts.")
            if totals.in_flight != sum(edge.forwarded + edge.returned for edge in frame.edges.values()):
                raise ValueError("In-flight inventory must equal scheduled edge traffic.")
        if self.summary != self.frames[-1].totals:
            raise ValueError("Run summary must equal the final frame totals.")
        return self
