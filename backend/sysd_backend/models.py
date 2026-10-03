from datetime import datetime, timedelta
from typing import Annotated, Literal, Self, TypeAlias
from uuid import UUID

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError


MAX_INTEGER = 9_007_199_254_740_991


def require_nonblank(value: str) -> str:
    if not value.strip():
        raise ValueError("Value must not be blank.")
    return value


PositiveInteger = Annotated[int, Field(strict=True, ge=1, le=MAX_INTEGER, json_schema_extra={"x-strict-integer": True})]
NonnegativeInteger = Annotated[int, Field(strict=True, ge=0, le=MAX_INTEGER, json_schema_extra={"x-strict-integer": True})]
ElementId = Annotated[str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")]
NonblankString = Annotated[str, Field(min_length=1, max_length=120, pattern=r"\S"), AfterValidator(require_nonblank)]
FiniteNumber = Annotated[float, Field(strict=True, allow_inf_nan=False, json_schema_extra={"x-finite": True})]
RelativeWeight = Annotated[FiniteNumber, Field(ge=0)]
RoutingPolicy: TypeAlias = Literal["round_robin", "weighted"]


def normalize_name(value: str) -> str:
    return require_nonblank(value.strip())


def require_version(value: object) -> Literal[1]:
    if type(value) is not int:
        raise PydanticCustomError("invalid_type", "Format version must be a JSON integer.")
    if value != 1:
        raise PydanticCustomError("unsupported_document_version", "Only document format version 1 is supported.")
    return 1


def require_utc(value: datetime) -> datetime:
    if value.utcoffset() != timedelta(0):
        raise ValueError("Timestamp must be timezone-aware UTC.")
    return value


Name = Annotated[NonblankString, AfterValidator(normalize_name)]
FormatVersion = Annotated[Literal[1], BeforeValidator(require_version), Field(json_schema_extra={"x-strict-integer": True})]
UtcTimestamp = Annotated[datetime, AfterValidator(require_utc), Field(json_schema_extra={"pattern": "Z$", "readOnly": True})]


class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class Position(StrictModel):
    x: FiniteNumber
    y: FiniteNumber


class BaseComponent(StrictModel):
    id: ElementId
    type: str
    label: NonblankString
    position: Position
    capacity_rps: PositiveInteger | None


class CallerGroup(BaseComponent):
    type: Literal["caller_group"]
    capacity_rps: None
    caller_count: PositiveInteger
    test_rps: NonnegativeInteger


class LoadBalancer(BaseComponent):
    type: Literal["load_balancer"]
    capacity_rps: PositiveInteger
    routing_policy: RoutingPolicy


class Gateway(BaseComponent):
    type: Literal["gateway"]
    capacity_rps: PositiveInteger
    routing_policy: RoutingPolicy


class Server(BaseComponent):
    type: Literal["server"]
    capacity_rps: PositiveInteger


class Database(BaseComponent):
    type: Literal["database"]
    capacity_rps: PositiveInteger


Component = Annotated[CallerGroup | LoadBalancer | Gateway | Server | Database, Field(discriminator="type")]


class Connection(StrictModel):
    id: ElementId
    source: ElementId
    target: ElementId
    order: NonnegativeInteger
    weight: RelativeWeight


class ArchitectureDocument(StrictModel):
    format_version: FormatVersion
    nodes: list[Component]
    edges: list[Connection]


class ArchitectureWrite(StrictModel):
    name: Name
    document: ArchitectureDocument
    model_config = ConfigDict(strict=True, extra="forbid", json_schema_extra={
        "examples": [{"name": "Untitled", "document": {"format_version": 1, "nodes": [], "edges": []}}],
    })


class ArchitectureMetadata(StrictModel):
    id: Annotated[UUID, Field(json_schema_extra={"readOnly": True})]
    name: Name
    created_at: UtcTimestamp
    updated_at: UtcTimestamp

    @model_validator(mode="after")
    def valid_metadata(self) -> Self:
        if self.id.version != 4 or self.updated_at < self.created_at:
            raise ValueError("Invalid architecture metadata.")
        return self


class Architecture(ArchitectureMetadata):
    document: ArchitectureDocument


class ArchitectureSummary(ArchitectureMetadata):
    format_version: FormatVersion


class ArchitectureList(StrictModel):
    items: list[ArchitectureSummary]


DetailCode: TypeAlias = Literal[
    "required", "unknown_field", "invalid_type", "invalid_value", "unsupported_document_version",
    "duplicate_id", "missing_endpoint", "duplicate_connection", "duplicate_order", "self_connection",
    "cycle", "forbidden_incoming", "too_many_outgoing", "forbidden_outgoing",
]
ErrorCode: TypeAlias = Literal[
    "invalid_json", "unsupported_media_type", "validation_error", "unsupported_document_version",
    "architecture_not_found", "storage_unavailable", "internal_error",
]


class ValidationIssue(StrictModel):
    path: str
    code: DetailCode
    message: Annotated[str, Field(min_length=1)]


class ErrorDetail(ValidationIssue):
    location: Literal["body", "path"]
    path: Annotated[str, Field(pattern=r"^(|/.*)$")]


class ApiError(StrictModel):
    code: ErrorCode
    message: Annotated[str, Field(min_length=1)]
    details: list[ErrorDetail]


class ErrorResponse(StrictModel):
    error: ApiError
