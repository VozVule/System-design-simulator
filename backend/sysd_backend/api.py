import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal, NoReturn
from uuid import UUID

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ConfigDict
from starlette.middleware.base import RequestResponseEndpoint
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from sysd_backend.errors import ArchitectureNotFound, BackendError, DocumentInvalid, StorageUnavailable
from sysd_backend.models import ApiError, Architecture, ArchitectureList, ArchitectureWrite, DetailCode, ErrorCode, ErrorDetail, ErrorResponse
from sysd_backend.service import ArchitectureService
from sysd_backend.settings import Settings
from sysd_backend.storage import SQLiteArchitectureStore


logger = logging.getLogger(__name__)
COMPONENT_TAGS = {"caller_group", "load_balancer", "gateway", "server", "database"}


def error_response(status: int, code: ErrorCode, message: str, details: list[ErrorDetail] | None = None) -> JSONResponse:
    value = ErrorResponse(error=ApiError(code=code, message=message, details=details or []))
    return JSONResponse(status_code=status, content=value.model_dump(mode="json"))


def reject_constant(value: str) -> NoReturn:
    raise ValueError(f"Nonstandard JSON constant: {value}")


class FrameworkIssue(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type: str
    loc: list[str | int]
    msg: str


def detail_code(error_type: str) -> DetailCode:
    if error_type == "missing":
        return "required"
    if error_type == "extra_forbidden":
        return "unknown_field"
    if error_type == "unsupported_document_version":
        return "unsupported_document_version"
    if error_type.endswith("_type"):
        return "invalid_type"
    return "invalid_value"


def responses(*statuses: int) -> dict[int | str, dict[str, object]]:
    return {status: {"model": ErrorResponse, "description": "Structured application error."} for status in statuses}


def create_app(settings: Settings | None = None) -> FastAPI:
    configuration = settings or Settings.from_environment()
    store = SQLiteArchitectureStore(configuration.database_path, configuration.sqlite_timeout)
    service = ArchitectureService(store)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        store.initialize()
        yield

    app = FastAPI(title="System Design Simulator — Architecture Library API", version="1.0.0", lifespan=lifespan)

    @app.middleware("http")
    async def check_json(request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in ("POST", "PUT") and request.url.path.startswith("/api/v1/architectures"):
            body = await request.body()
            if body:
                media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                if media_type != "application/json":
                    return error_response(415, "unsupported_media_type", "The request body must use application/json.")
                try:
                    json.loads(body, parse_constant=reject_constant)
                except (ValueError, UnicodeDecodeError):
                    return error_response(400, "invalid_json", "The request body must contain valid JSON.")
        return await call_next(request)

    app.add_middleware(
        CORSMiddleware, allow_origins=list(configuration.allowed_origins),
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], allow_headers=["Content-Type"],
        expose_headers=["Location"], allow_credentials=False,
    )

    @app.exception_handler(RequestValidationError)
    async def request_invalid(request: Request, error: RequestValidationError) -> JSONResponse:
        details: list[ErrorDetail] = []
        for raw in error.errors():
            issue = FrameworkIssue.model_validate(raw)
            if issue.type == "json_invalid":
                return error_response(400, "invalid_json", "The request body must contain valid JSON.")
            location: Literal["body", "path"] = "path" if issue.loc and issue.loc[0] == "path" else "body"
            segments = issue.loc[1:]
            # A discriminated node union adds its tag after the node array index.
            if len(segments) >= 4 and segments[:2] == ["document", "nodes"] and isinstance(segments[2], int) and segments[3] in COMPONENT_TAGS:
                segments = segments[:3] + segments[4:]
            parts = [str(part).replace("~", "~0").replace("/", "~1") for part in segments]
            details.append(ErrorDetail(location=location, path="" if not parts else "/" + "/".join(parts), code=detail_code(issue.type), message=issue.msg))
        code: ErrorCode = "unsupported_document_version" if any(detail.code == "unsupported_document_version" for detail in details) else "validation_error"
        return error_response(422, code, "The request contains invalid fields.", details)

    @app.exception_handler(BackendError)
    async def backend_failed(request: Request, error: BackendError) -> JSONResponse:
        if isinstance(error, DocumentInvalid):
            details = [ErrorDetail(location="body", path="/document" + issue.path, code=issue.code, message=issue.message) for issue in error.issues]
            return error_response(422, "validation_error", str(error), details)
        if isinstance(error, ArchitectureNotFound):
            return error_response(404, "architecture_not_found", str(error))
        if isinstance(error, StorageUnavailable):
            return error_response(503, "storage_unavailable", str(error))
        logger.error("Invalid stored architecture", exc_info=error)
        return error_response(500, "internal_error", "The operation could not be completed.")

    @app.exception_handler(Exception)
    async def unexpected_failure(request: Request, error: Exception) -> JSONResponse:
        logger.error("Unexpected backend failure", exc_info=error)
        return error_response(500, "internal_error", "The operation could not be completed.")

    creation_responses = responses(400, 415, 422, 503, 500)
    creation_responses[201] = {"headers": {"Location": {
        "required": True, "description": "Relative route of the saved architecture.",
        "schema": {"type": "string", "format": "uri-reference"},
    }}}

    @app.post("/api/v1/architectures", status_code=201, response_model=Architecture, operation_id="createArchitecture", tags=["Architectures"], responses=creation_responses)
    def create_architecture(body: ArchitectureWrite, response: Response) -> Architecture:
        value = service.create(body)
        response.headers["Location"] = f"/api/v1/architectures/{value.id}"
        return value

    @app.get("/api/v1/architectures", response_model=ArchitectureList, operation_id="listArchitectures", tags=["Architectures"], responses=responses(503, 500))
    def list_architectures() -> ArchitectureList:
        return service.list()

    @app.get("/api/v1/architectures/{architecture_id}", response_model=Architecture, operation_id="getArchitecture", tags=["Architectures"], responses=responses(404, 422, 503, 500))
    def get_architecture(architecture_id: UUID) -> Architecture:
        return service.get(architecture_id)

    @app.put("/api/v1/architectures/{architecture_id}", response_model=Architecture, operation_id="replaceArchitecture", tags=["Architectures"], responses=responses(400, 404, 415, 422, 503, 500))
    def replace_architecture(architecture_id: UUID, body: ArchitectureWrite) -> Architecture:
        return service.replace(architecture_id, body)

    @app.delete("/api/v1/architectures/{architecture_id}", status_code=204, response_class=Response, operation_id="deleteArchitecture", tags=["Architectures"], responses=responses(404, 422, 503, 500))
    def delete_architecture(architecture_id: UUID) -> Response:
        service.delete(architecture_id)
        return Response(status_code=204)

    return app
