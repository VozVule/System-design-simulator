import json
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator, FormatChecker

from sysd_backend.api import create_app
from sysd_backend.settings import Settings

from tests.helpers import ROOT, as_array, as_object, contract, empty_payload, full_payload
from tests.test_simulation import reference_request


def resolve(document: dict[str, object], schema: dict[str, object]) -> dict[str, object]:
    while "$ref" in schema:
        pointer = schema["$ref"]
        assert isinstance(pointer, str) and pointer.startswith("#/")
        current = document
        for key in pointer[2:].split("/"):
            current = as_object(current[key])
        schema = current
    return schema


def schema_validator(document: dict[str, object], schema: dict[str, object]) -> Draft202012Validator:
    return Draft202012Validator({**schema, "components": document["components"]}, format_checker=FormatChecker())


def test_generated_operations_and_responses_match_approved_contract(tmp_path: Path) -> None:
    approved = contract()
    with TestClient(create_app(Settings(database_path=tmp_path / "library.sqlite3"))) as client:
        assert client.get("/docs").status_code == 200
        response = client.get("/openapi.json")
        assert response.status_code == 200
        served = as_object(response.json())
        expected_paths = as_object(approved["paths"])
        actual_paths = as_object(served["paths"])
        assert set(expected_paths) == set(actual_paths)
        for path, path_item in expected_paths.items():
            for method, value in as_object(path_item).items():
                if method == "parameters":
                    continue
                expected = as_object(value)
                actual = as_object(as_object(actual_paths[path])[method])
                assert actual["operationId"] == expected["operationId"]
                assert set(as_object(actual["responses"])) == set(as_object(expected["responses"]))
        created = client.post("/api/v1/architectures", json=full_payload())
        schema_validator(approved, {"$ref": "#/components/schemas/Architecture"}).validate(created.json())
        schema_validator(approved, {"$ref": "#/components/schemas/ArchitectureList"}).validate(client.get("/api/v1/architectures").json())
        failed = client.put(created.headers["location"], json={})
        schema_validator(approved, {"$ref": "#/components/schemas/ErrorResponse"}).validate(failed.json())
        actual_post = as_object(as_object(actual_paths["/api/v1/architectures"])["post"])
        created_schema = as_object(as_object(actual_post["responses"])["201"])
        assert "Location" in as_object(created_schema["headers"])
        deleted = as_object(as_object(as_object(actual_paths["/api/v1/architectures/{architecture_id}"])["delete"])["responses"])
        assert "content" not in as_object(deleted["204"])


def test_generated_request_schema_has_same_public_shape_and_constraints(tmp_path: Path) -> None:
    approved = contract()
    with TestClient(create_app(Settings(database_path=tmp_path / "library.sqlite3"))) as client:
        served = as_object(client.get("/openapi.json").json())
    paths = as_object(served["paths"])
    post = as_object(as_object(paths["/api/v1/architectures"])["post"])
    body = as_object(post["requestBody"])
    media = as_object(as_object(body["content"])["application/json"])
    actual = schema_validator(served, as_object(media["schema"]))
    expected = schema_validator(approved, {"$ref": "#/components/schemas/ArchitectureWrite"})
    for valid in (empty_payload(), full_payload()):
        expected.validate(valid)
        actual.validate(valid)
    for invalid in ({}, {"name": "Missing document"}, {**empty_payload(), "results": []}, empty_payload(" ")):
        assert not expected.is_valid(invalid) and not actual.is_valid(invalid)
    # Every documented component variant forbids extra fields and shares the same required fields.
    approved_nodes = as_object(as_object(approved["components"])["schemas"])
    schema = resolve(served, as_object(media["schema"]))
    document_schema = resolve(served, as_object(as_object(schema["properties"])["document"]))
    node_schema = as_object(as_object(document_schema["properties"])["nodes"])
    union = as_object(node_schema["items"])
    for variant in as_array(union["oneOf"]):
        resolved = resolve(served, as_object(variant))
        title = resolved["title"]
        assert isinstance(title, str)
        approved_variant = as_object(approved_nodes[title])
        assert resolved["additionalProperties"] is False
        assert set(as_array(resolved["required"])) == set(as_array(approved_variant["required"]))


def test_both_openapi_documents_pass_full_validation(tmp_path: Path) -> None:
    with TestClient(create_app(Settings(database_path=tmp_path / "library.sqlite3"))) as client:
        served = tmp_path / "generated-openapi.json"
        served.write_text(json.dumps(client.get("/openapi.json").json()))
    for path in (ROOT / "specs/backend/backend-api.openapi.json", served):
        result = subprocess.run([sys.executable, "-m", "openapi_spec_validator", str(path)], capture_output=True, text=True)
        assert result.returncode == 0, result.stdout + result.stderr


def test_simulation_dtos_and_http_values_match_both_contracts(tmp_path: Path) -> None:
    approved = contract()
    with TestClient(create_app(Settings(database_path=tmp_path / "library.sqlite3"))) as client:
        served = as_object(client.get("/openapi.json").json())
        request = reference_request().model_dump(mode="json")
        response = client.post("/api/v1/simulations", json=request)
        assert response.status_code == 200
        failed = client.post("/api/v1/simulations", json={"document": {"format_version": 1, "nodes": [], "edges": []}, "total_ticks": 60})
        assert failed.status_code == 422
    names = (
        "SimulationRequest", "SimulationSnapshot", "CallerFrame", "ProcessingFrame", "EdgeFrame",
        "TickCounts", "SimulationTotals", "SimulationFrame", "SimulationResult",
    )
    approved_schemas = as_object(as_object(approved["components"])["schemas"])
    served_schemas = as_object(as_object(served["components"])["schemas"])
    for name in names:
        expected = as_object(approved_schemas[name])
        actual = as_object(served_schemas[name])
        assert actual["additionalProperties"] is False
        assert set(as_array(actual["required"])) == set(as_array(expected["required"]))
        assert set(as_object(actual["properties"])) == set(as_object(expected["properties"]))
        # Only descriptive prose may differ; structural DTO constraints match.
        for field, value in as_object(expected["properties"]).items():
            expected_property = {key: item for key, item in as_object(value).items() if key != "description"}
            actual_property = {key: item for key, item in as_object(as_object(actual["properties"])[field]).items() if key != "description"}
            assert actual_property == expected_property
    for document in (approved, served):
        input_validator = schema_validator(document, {"$ref": "#/components/schemas/SimulationRequest"})
        input_validator.validate(request)
        for invalid in ({}, {"document": request["document"]}, {**request, "name": "Extra"}, {**request, "total_ticks": 0}):
            assert not input_validator.is_valid(invalid)
        schema_validator(document, {"$ref": "#/components/schemas/SimulationResult"}).validate(response.json())
        schema_validator(document, {"$ref": "#/components/schemas/ErrorResponse"}).validate(failed.json())
        detail_schema = resolve(document, {"$ref": "#/components/schemas/ErrorDetail"})
        detail_codes = as_array(as_object(as_object(detail_schema["properties"])["code"])["enum"])
        assert {"missing_source", "missing_destination", "all_zero_weights", "unreachable_component", "count_overflow"}.issubset(detail_codes)
