from collections import deque

from sysd_backend.models import ArchitectureDocument, DetailCode, ValidationIssue


def validate_graph(document: ArchitectureDocument) -> list[ValidationIssue]:
    """Check save-time integrity without requiring a runnable graph."""
    issues: list[ValidationIssue] = []

    def report(path: str, code: DetailCode, message: str) -> None:
        issues.append(ValidationIssue(path=path, code=code, message=message))

    seen_ids: set[str] = set()
    nodes = {node.id: node for node in document.nodes}
    for index, node in enumerate(document.nodes):
        if node.id in seen_ids:
            report(f"/nodes/{index}/id", "duplicate_id", "Component and connection IDs must be unique.")
        seen_ids.add(node.id)
    pairs: set[tuple[str, str]] = set()
    orders: set[tuple[str, int]] = set()
    incoming = dict.fromkeys(nodes, 0)
    outgoing = dict.fromkeys(nodes, 0)
    adjacency: dict[str, list[str]] = {node_id: [] for node_id in nodes}
    for index, edge in enumerate(document.edges):
        path = f"/edges/{index}"
        if edge.id in seen_ids:
            report(f"{path}/id", "duplicate_id", "Component and connection IDs must be unique.")
        seen_ids.add(edge.id)
        pair = (edge.source, edge.target)
        if pair in pairs:
            report(path, "duplicate_connection", "A directed source/target connection already exists.")
        pairs.add(pair)
        order = (edge.source, edge.order)
        if order in orders:
            report(f"{path}/order", "duplicate_order", "Destination orders must be unique for each source.")
        orders.add(order)
        for endpoint in ("source", "target"):
            node_id = edge.source if endpoint == "source" else edge.target
            if node_id not in nodes:
                report(f"{path}/{endpoint}", "missing_endpoint", "The connection endpoint does not exist.")
        if edge.source not in nodes or edge.target not in nodes:
            continue
        incoming[edge.target] += 1
        outgoing[edge.source] += 1
        adjacency[edge.source].append(edge.target)
        if edge.source == edge.target:
            report(path, "self_connection", "A component cannot connect to itself.")
    for index, node in enumerate(document.nodes):
        path = f"/nodes/{index}"
        if node.type == "caller_group" and incoming[node.id]:
            report(path, "forbidden_incoming", "Caller Groups cannot have incoming connections.")
        if node.type in ("caller_group", "server") and outgoing[node.id] > 1:
            report(path, "too_many_outgoing", "This component allows at most one outgoing connection.")
        if node.type == "database" and outgoing[node.id]:
            report(path, "forbidden_outgoing", "Databases cannot have outgoing connections.")
    remaining_incoming = incoming.copy()
    ready = deque(node_id for node_id, count in incoming.items() if count == 0)
    visited = 0
    while ready:
        node_id = ready.popleft()
        visited += 1
        for target in adjacency[node_id]:
            remaining_incoming[target] -= 1
            if remaining_incoming[target] == 0:
                ready.append(target)
    if visited != len(nodes):
        report("/edges", "cycle", "Cycles and loopbacks are forbidden.")
    return issues
