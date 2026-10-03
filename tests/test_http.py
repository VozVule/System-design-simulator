import sqlite3
from collections.abc import Iterator
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from sysd_backend.api import create_app
from sysd_backend.models import Architecture, ErrorCode, ErrorResponse
from sysd_backend.settings import Settings

from tests.helpers import as_array, as_object, empty_payload, full_payload, graph_payload


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(database_path=tmp_path / "nested/library.sqlite3", sqlite_timeout=0.01)


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as value:
        yield value


def assert_error(response: Response, status: int, code: ErrorCode) -> ErrorResponse:
    assert response.status_code == status, response.text
    value = ErrorResponse.model_validate_json(response.content)
    assert value.error.code == code
    return value


def test_save_replace_open_delete_and_restart(tmp_path: Path) -> None:
    settings = Settings(database_path=tmp_path / "library.sqlite3")
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/architectures").json() == {"items": []}
        response = client.post("/api/v1/architectures", json=empty_payload("  My architecture  "))
        assert response.status_code == 201
        saved = as_object(response.json())
        assert saved["name"] == "My architecture"
        assert saved["created_at"] == saved["updated_at"]
        location = response.headers["location"]
        assert client.get(location).json() == saved
        replacement = empty_payload("Renamed")
        response = client.put(location, json=replacement)
        assert response.status_code == 200
        updated = as_object(response.json())
        assert updated["id"] == saved["id"]
        assert updated["created_at"] == saved["created_at"]
        assert updated["updated_at"] != saved["updated_at"]
        assert client.put(location, json=replacement).json() == updated
    with TestClient(create_app(settings)) as restarted:
        assert restarted.get(location).json() == updated
        deleted = restarted.delete(location)
        assert deleted.status_code == 204
        assert deleted.content == b""
        assert restarted.get(location).status_code == 404
        assert restarted.delete(location).status_code == 404
    with TestClient(create_app(settings)) as restarted_again:
        assert restarted_again.get("/api/v1/architectures").json() == {"items": []}


def test_roundtrip_all_components_then_add_edit_remove_and_rename(client: TestClient) -> None:
    payload = full_payload()
    created = client.post("/api/v1/architectures", json=payload)
    assert created.status_code == 201
    initial = Architecture.model_validate_json(created.content)
    assert initial.id.version == 4
    location = created.headers["location"]
    assert location == f"/api/v1/architectures/{initial.id}"
    assert client.get(location).json() == created.json()
    assert initial.document.model_dump(mode="json") == payload["document"]
    document = as_object(payload["document"])
    nodes = [as_object(node) for node in as_array(document["nodes"])]
    # Remove the database and its incident edge, edit the server, and add an unconnected database.
    nodes = [node for node in nodes if node["id"] != "database"]
    server = next(node for node in nodes if node["id"] == "server")
    server.update(capacity_rps=42, label="Changed", position={"x": -42, "y": 3.25})
    nodes.append({"id": "new_db", "type": "database", "label": "New database", "position": {"x": 10, "y": 20}, "capacity_rps": 300})
    document["nodes"] = nodes
    document["edges"] = [edge for edge in as_array(document["edges"]) if as_object(edge)["target"] != "database"]
    payload.update(name="Updated", document=document)
    updated = client.put(location, json=payload)
    assert updated.status_code == 200
    result = Architecture.model_validate_json(updated.content)
    assert result.id == initial.id and result.created_at == initial.created_at
    assert result.updated_at > initial.updated_at
    assert result.document.model_dump(mode="json") == document
    assert client.get(location).json() == updated.json()
    assert client.put(location, json=payload).json() == updated.json()
    summaries = as_array(as_object(client.get("/api/v1/architectures").json())["items"])
    assert len(summaries) == 1 and "document" not in as_object(summaries[0])


@pytest.mark.parametrize("invalid", [True, 1.0, "1", 0, -1])
def test_rejected_put_preserves_document_and_timestamps(client: TestClient, invalid: object) -> None:
    payload = full_payload()
    created = client.post("/api/v1/architectures", json=payload)
    location = created.headers["location"]
    document = as_object(payload["document"])
    nodes = [as_object(node) for node in as_array(document["nodes"])]
    nodes[1]["capacity_rps"] = invalid
    document["nodes"] = nodes
    payload["document"] = document
    error = assert_error(client.put(location, json=payload), 422, "validation_error")
    assert any(detail.path == "/document/nodes/1/capacity_rps" for detail in error.error.details)
    assert client.get(location).json() == created.json()


@pytest.mark.parametrize("version", [0, 2, -1])
def test_unsupported_version_creates_no_entry(client: TestClient, version: int) -> None:
    payload = empty_payload()
    payload["document"] = {"format_version": version, "nodes": [], "edges": []}
    error = assert_error(client.post("/api/v1/architectures", json=payload), 422, "unsupported_document_version")
    assert error.error.details[0].path == "/document/format_version"
    assert client.get("/api/v1/architectures").json() == {"items": []}


@pytest.mark.parametrize("version", [True, 1.0, "1"])
def test_wrongly_typed_version_has_regular_validation_error(client: TestClient, version: object) -> None:
    payload = empty_payload()
    payload["document"] = {"format_version": version, "nodes": [], "edges": []}
    error = assert_error(client.post("/api/v1/architectures", json=payload), 422, "validation_error")
    assert error.error.details[0].code == "invalid_type"


def test_unknown_fields_are_rejected_at_nested_levels(client: TestClient) -> None:
    for location in ("root", "document", "node", "position", "edge"):
        payload = full_payload()
        document = as_object(payload["document"])
        nodes = [as_object(node) for node in as_array(document["nodes"])]
        edges = [as_object(edge) for edge in as_array(document["edges"])]
        if location == "root":
            payload["id"] = str(uuid4())
        elif location == "document":
            document["results"] = []
        elif location == "node":
            nodes[0]["routing_policy"] = "weighted"
        elif location == "position":
            position = as_object(nodes[0]["position"])
            position["extra"] = 1
            nodes[0]["position"] = position
        else:
            edges[0]["extra"] = 1
        document.update(nodes=nodes, edges=edges)
        payload["document"] = document
        error = assert_error(client.post("/api/v1/architectures", json=payload), 422, "validation_error")
        assert any(detail.code == "unknown_field" for detail in error.error.details)
    assert client.get("/api/v1/architectures").json() == {"items": []}


def test_graph_failures_are_field_errors_and_do_not_replace_saved_state(client: TestClient) -> None:
    created = client.post("/api/v1/architectures", json=full_payload())
    location = created.headers["location"]
    invalid_documents = [
        graph_payload([("a", "gateway")], [("a", "missing", 0)]),
        graph_payload([("a", "gateway"), ("b", "gateway")], [("a", "b", 0), ("b", "a", 0)]),
        graph_payload([("a", "server"), ("b", "server"), ("c", "server")], [("a", "b", 0), ("a", "c", 1)]),
    ]
    for document in invalid_documents:
        error = assert_error(client.put(location, json={"name": "Invalid replacement", "document": document}), 422, "validation_error")
        assert error.error.details and all(detail.path.startswith("/document/") for detail in error.error.details)
        assert client.get(location).json() == created.json()


@pytest.mark.parametrize("method", ["get", "put", "delete"])
def test_missing_and_malformed_ids(client: TestClient, method: str) -> None:
    missing = f"/api/v1/architectures/{uuid4()}"
    invalid = "/api/v1/architectures/not-a-uuid"
    kwargs: dict[str, object] = {"json": empty_payload()} if method == "put" else {}
    # Keep the HTTP call typed without dynamic argument expansion.
    for path, status, code in ((missing, 404, "architecture_not_found"), (invalid, 422, "validation_error")):
        response = client.request(method, path, json=kwargs.get("json"))
        assert response.status_code == status
        error = ErrorResponse.model_validate_json(response.content)
        assert error.error.code == code
        if status == 422:
            assert any(detail.location == "path" and detail.path == "/architecture_id" for detail in error.error.details)


def test_invalid_input_is_validated_before_missing_resource_lookup(client: TestClient) -> None:
    assert_error(client.put(f"/api/v1/architectures/{uuid4()}", json={}), 422, "validation_error")


@pytest.mark.parametrize("body", [b"{", b"null null", b"\xff", b'{"name": NaN}', b'{"name": Infinity}'])
def test_malformed_json_is_400(client: TestClient, body: bytes) -> None:
    assert_error(client.post("/api/v1/architectures", content=body, headers={"Content-Type": "application/json"}), 400, "invalid_json")


def test_media_type_and_missing_body(client: TestClient) -> None:
    assert_error(client.post("/api/v1/architectures", content="{}", headers={"Content-Type": "text/plain"}), 415, "unsupported_media_type")
    assert_error(client.post("/api/v1/architectures", content="{}"), 415, "unsupported_media_type")
    assert_error(client.post("/api/v1/architectures", headers={"Content-Type": "application/json"}), 422, "validation_error")
    response = client.post("/api/v1/architectures", json=empty_payload(), headers={"Content-Type": "application/json; charset=utf-8"})
    assert response.status_code == 201


def test_missing_name_or_document_never_merges_existing_data(client: TestClient) -> None:
    created = client.post("/api/v1/architectures", json=full_payload())
    location = created.headers["location"]
    for payload in ({"name": "Partial"}, {"document": {"format_version": 1, "nodes": [], "edges": []}}):
        error = assert_error(client.put(location, json=payload), 422, "validation_error")
        assert any(detail.code == "required" for detail in error.error.details)
    assert client.get(location).json() == created.json()


def test_editing_states_can_be_saved(client: TestClient) -> None:
    for document in (
        graph_payload([("a", "caller_group")], []),
        graph_payload([("a", "gateway")], []),
        graph_payload([("a", "load_balancer"), ("b", "server")], [("a", "b", 12)]),
    ):
        response = client.post("/api/v1/architectures", json={"name": "Incomplete", "document": document})
        assert response.status_code == 201, response.text


def test_lock_failure_is_503_and_existing_state_survives(client: TestClient, settings: Settings) -> None:
    created = client.post("/api/v1/architectures", json=full_payload())
    location = created.headers["location"]
    with sqlite3.connect(settings.database_path, isolation_level=None) as lock:
        lock.execute("BEGIN EXCLUSIVE")
        try:
            assert_error(client.put(location, json=empty_payload("Blocked")), 503, "storage_unavailable")
            assert_error(client.post("/api/v1/architectures", json=empty_payload()), 503, "storage_unavailable")
            assert_error(client.delete(location), 503, "storage_unavailable")
        finally:
            lock.rollback()
    assert client.get(location).json() == created.json()
    assert len(as_array(as_object(client.get("/api/v1/architectures").json())["items"])) == 1


def test_corrupt_saved_documents_are_500(client: TestClient, settings: Settings) -> None:
    created = client.post("/api/v1/architectures", json=empty_payload())
    with sqlite3.connect(settings.database_path) as connection:
        connection.execute("UPDATE architectures SET document_json = ?", ("{}",))
    assert_error(client.get(created.headers["location"]), 500, "internal_error")
    assert_error(client.get("/api/v1/architectures"), 500, "internal_error")


def test_duplicate_names_sort_and_timestamp_advancement(client: TestClient, settings: Settings) -> None:
    first = client.post("/api/v1/architectures", json=empty_payload("Same"))
    second = client.post("/api/v1/architectures", json=empty_payload("Same"))
    first_value = Architecture.model_validate_json(first.content)
    second_value = Architecture.model_validate_json(second.content)
    assert first_value.id != second_value.id
    listing = as_array(as_object(client.get("/api/v1/architectures").json())["items"])
    assert [as_object(item)["id"] for item in listing] == [str(second_value.id), str(first_value.id)]
    with sqlite3.connect(settings.database_path) as connection:
        connection.execute("UPDATE architectures SET updated_at = ?", ("2100-01-01T00:00:00+00:00",))
    listing = as_array(as_object(client.get("/api/v1/architectures").json())["items"])
    assert [as_object(item)["id"] for item in listing] == sorted([str(first_value.id), str(second_value.id)])
    edited = client.put(first.headers["location"], json=empty_payload("Changed"))
    updated = Architecture.model_validate_json(edited.content)
    assert updated.updated_at.year == 2100 and updated.updated_at.microsecond == 1


def test_configured_cors_and_creation_location(client: TestClient) -> None:
    origin = "http://localhost:5173"
    preflight = client.options("/api/v1/architectures", headers={"Origin": origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "Content-Type"})
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == origin
    assert "PUT" in preflight.headers["access-control-allow-methods"]
    created = client.post("/api/v1/architectures", json=empty_payload(), headers={"Origin": origin})
    assert created.headers["access-control-allow-origin"] == origin
    assert "Location" in created.headers["access-control-expose-headers"]
    UUID(created.headers["location"].split("/")[-1])
    failed = client.post("/api/v1/architectures", content="{", headers={"Origin": origin, "Content-Type": "application/json"})
    assert failed.status_code == 400 and failed.headers["access-control-allow-origin"] == origin
