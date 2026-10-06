import sqlite3
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sysd_backend import api
from sysd_backend.api import create_app
from sysd_backend.models import MAX_INTEGER
from sysd_backend.settings import Settings
from sysd_backend.simulation_models import SimulationRequest, SimulationResult

from tests.helpers import as_array, as_object, graph_payload
from tests.test_http import assert_error
from tests.test_simulation import reference_request, request_for


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    with TestClient(create_app(Settings(database_path=tmp_path / "library.sqlite3")), raise_server_exceptions=False) as value:
        yield value


def test_run_unsaved_document_and_preserve_library_and_input(client: TestClient) -> None:
    saved = client.post("/api/v1/architectures", json={"name": "Saved", "document": reference_request().document.model_dump(mode="json")})
    assert saved.status_code == 201
    location = saved.headers["location"]
    unsaved = reference_request()
    unsaved.document.nodes[2].label = "Unsaved server"
    response = client.post("/api/v1/simulations", json=unsaved.model_dump(mode="json"))
    assert response.status_code == 200 and "location" not in response.headers
    result = SimulationResult.model_validate_json(response.content)
    assert result.snapshot.document == unsaved.document
    assert result.snapshot.total_ticks == 60 and len(result.frames) == 61
    assert result.summary.model_dump() == {"generated": 6000, "completed": 3240, "dropped": 2320, "in_flight": 440}
    assert client.get(location).json() == saved.json()
    assert len(as_array(as_object(client.get("/api/v1/architectures").json())["items"])) == 1


def test_run_has_no_sqlite_access_during_exclusive_library_lock(tmp_path: Path) -> None:
    settings = Settings(database_path=tmp_path / "library.sqlite3", sqlite_timeout=0.01)
    with TestClient(create_app(settings)) as client:
        saved = client.post("/api/v1/architectures", json={"name": "Saved", "document": reference_request().document.model_dump(mode="json")})
        with sqlite3.connect(settings.database_path, isolation_level=None) as connection:
            connection.execute("BEGIN EXCLUSIVE")
            try:
                response = client.post("/api/v1/simulations", json=reference_request().model_dump(mode="json"))
                assert response.status_code == 200
            finally:
                connection.rollback()
        assert client.get(saved.headers["location"]).json() == saved.json()


def test_failed_run_does_not_change_saved_incomplete_graph(client: TestClient) -> None:
    document = graph_payload([("caller", "caller_group"), ("server", "server")], [])
    saved = client.post("/api/v1/architectures", json={"name": "Incomplete", "document": document})
    assert saved.status_code == 201
    failed = assert_error(client.post("/api/v1/simulations", json={"document": document, "total_ticks": 60}), 422, "validation_error")
    assert {(detail.code, detail.path) for detail in failed.error.details} == {
        ("missing_destination", "/document/nodes/0"), ("unreachable_component", "/document/nodes/1"),
    }
    assert client.get(saved.headers["location"]).json() == saved.json()


@pytest.mark.parametrize("total_ticks", [True, 60.0, "60", None, 0, -1, MAX_INTEGER + 1])
def test_strict_total_ticks(client: TestClient, total_ticks: object) -> None:
    request = reference_request().model_dump(mode="json")
    request["total_ticks"] = total_ticks
    failed = assert_error(client.post("/api/v1/simulations", json=request), 422, "validation_error")
    assert failed.error.details[0].path == "/total_ticks"
    assert failed.error.details[0].code == ("invalid_type" if total_ticks in (True, 60.0, "60", None) else "invalid_value")


def test_required_tick_count_has_no_api_default(client: TestClient) -> None:
    failed = assert_error(client.post("/api/v1/simulations", json={"document": reference_request().document.model_dump(mode="json")}), 422, "validation_error")
    assert [(detail.path, detail.code) for detail in failed.error.details] == [("/total_ticks", "required")]
    failed = assert_error(client.post("/api/v1/simulations", json={"architecture_id": "saved", "total_ticks": 60}), 422, "validation_error")
    assert {(detail.path, detail.code) for detail in failed.error.details} == {("/document", "required"), ("/architecture_id", "unknown_field")}


@pytest.mark.parametrize(("scope", "field", "path"), [
    ("root", "name", "/name"), ("document", "results", "/document/results"),
    ("node", "gateway", "/document/nodes/0/gateway"), ("edge", "extra", "/document/edges/0/extra"),
])
def test_unknown_simulation_fields(client: TestClient, scope: str, field: str, path: str) -> None:
    request = reference_request().model_dump(mode="json")
    document = as_object(request["document"])
    if scope == "root":
        request[field] = "Extra"
    elif scope == "document":
        document[field] = []
    elif scope == "node":
        nodes = [as_object(node) for node in as_array(document["nodes"])]
        nodes[0][field] = 1
        document["nodes"] = nodes
    else:
        edges = [as_object(edge) for edge in as_array(document["edges"])]
        edges[0][field] = 1
        document["edges"] = edges
    request["document"] = document
    failed = assert_error(client.post("/api/v1/simulations", json=request), 422, "validation_error")
    assert any(detail.path == path and detail.code == "unknown_field" for detail in failed.error.details)


@pytest.mark.parametrize("version", [0, 2, -1])
def test_unsupported_simulation_document_version(client: TestClient, version: int) -> None:
    request = reference_request().model_dump(mode="json")
    document = as_object(request["document"])
    document["format_version"] = version
    request["document"] = document
    failed = assert_error(client.post("/api/v1/simulations", json=request), 422, "unsupported_document_version")
    assert failed.error.details[0].path == "/document/format_version"


@pytest.mark.parametrize("version", [True, 1.0, "1"])
def test_wrongly_typed_simulation_version(client: TestClient, version: object) -> None:
    request = reference_request().model_dump(mode="json")
    document = as_object(request["document"])
    document["format_version"] = version
    request["document"] = document
    failed = assert_error(client.post("/api/v1/simulations", json=request), 422, "validation_error")
    assert failed.error.details[0].code == "invalid_type"


@pytest.mark.parametrize("content", [b"{", b"null null", b"\xff", b'{"total_ticks": NaN}', b'{"total_ticks": Infinity}'])
def test_simulation_invalid_json(client: TestClient, content: bytes) -> None:
    assert_error(client.post("/api/v1/simulations", content=content, headers={"Content-Type": "application/json"}), 400, "invalid_json")


def test_simulation_media_type_and_empty_body(client: TestClient) -> None:
    assert_error(client.post("/api/v1/simulations", content="{}", headers={"Content-Type": "text/plain"}), 415, "unsupported_media_type")
    assert_error(client.post("/api/v1/simulations", content="{}"), 415, "unsupported_media_type")
    assert_error(client.post("/api/v1/simulations", headers={"Content-Type": "application/json"}), 422, "validation_error")
    valid = client.post("/api/v1/simulations", json=reference_request().model_dump(mode="json"), headers={"Content-Type": "application/json; charset=utf-8"})
    assert valid.status_code == 200


def test_simulation_structural_pointers_are_body_relative(client: TestClient) -> None:
    request = reference_request().model_dump(mode="json")
    document = as_object(request["document"])
    edges = [as_object(edge) for edge in as_array(document["edges"])]
    edges[0]["target"] = "missing"
    document["edges"] = edges
    request["document"] = document
    failed = assert_error(client.post("/api/v1/simulations", json=request), 422, "validation_error")
    assert [(detail.path, detail.code) for detail in failed.error.details] == [("/document/edges/0/target", "missing_endpoint")]


def test_simulation_readiness_and_count_overflow_detail_codes(client: TestClient) -> None:
    empty = assert_error(client.post("/api/v1/simulations", json={"document": {"format_version": 1, "nodes": [], "edges": []}, "total_ticks": 60}), 422, "validation_error")
    assert [(detail.path, detail.code) for detail in empty.error.details] == [("/document/nodes", "missing_source")]
    weighted = request_for([("caller", "caller_group"), ("lb", "load_balancer"), ("server", "server")], [("caller", "lb", 0), ("lb", "server", 0)], policies={"lb": "weighted"}, weights=[1, 0])
    failed = assert_error(client.post("/api/v1/simulations", json=weighted.model_dump(mode="json")), 422, "validation_error")
    assert [(detail.path, detail.code) for detail in failed.error.details] == [("/document/nodes/1/routing_policy", "all_zero_weights")]
    overflow = request_for([("caller", "caller_group"), ("server", "server")], [("caller", "server", 0)], sources={"caller": MAX_INTEGER})
    failed = assert_error(client.post("/api/v1/simulations", json=overflow.model_dump(mode="json")), 422, "validation_error")
    assert [(detail.path, detail.code) for detail in failed.error.details] == [("/total_ticks", "count_overflow")]
    assert "Reduce" in failed.error.details[0].message


def test_concurrent_http_runs_reset_router_cursors(client: TestClient) -> None:
    request = request_for(
        [("caller", "caller_group"), ("lb", "load_balancer"), ("left", "server"), ("right", "server")],
        [("caller", "lb", 0), ("lb", "left", 0), ("lb", "right", 1)], ticks=5, sources={"caller": 3},
    ).model_dump(mode="json")

    def run(_: int) -> SimulationResult:
        response = client.post("/api/v1/simulations", json=request)
        assert response.status_code == 200
        return SimulationResult.model_validate_json(response.content)

    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(run, range(8)))
    assert all(result == results[0] for result in results)
    assert results[0].frames[2].edges["edge_1"].forwarded == 2
    assert results[0].frames[3].edges["edge_1"].forwarded == 1


def test_unexpected_calculation_failure_uses_structured_error(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def fail(_: SimulationRequest) -> SimulationResult:
        raise RuntimeError("Calculation failed")

    monkeypatch.setattr(api, "simulate", fail)
    assert_error(client.post("/api/v1/simulations", json=reference_request().model_dump(mode="json")), 500, "internal_error")


def test_invalid_generated_output_uses_structured_error(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def invalid(_: SimulationRequest) -> dict[str, object]:
        return {"snapshot": {}, "frames": [], "summary": {}}

    monkeypatch.setattr(api, "simulate", invalid)
    assert_error(client.post("/api/v1/simulations", json=reference_request().model_dump(mode="json")), 500, "internal_error")


def test_simulation_cors_matches_library(client: TestClient) -> None:
    origin = "http://localhost:5173"
    preflight = client.options("/api/v1/simulations", headers={"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type"})
    assert preflight.status_code == 200 and preflight.headers["access-control-allow-origin"] == origin
    response = client.post("/api/v1/simulations", json=reference_request().model_dump(mode="json"), headers={"Origin": origin})
    assert response.headers["access-control-allow-origin"] == origin
