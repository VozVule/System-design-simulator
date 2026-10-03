import json
import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Protocol
from uuid import UUID, uuid4

from pydantic import ValidationError

from sysd_backend.errors import ArchitectureNotFound, InvalidStoredArchitecture, StorageUnavailable
from sysd_backend.models import Architecture, ArchitectureDocument, ArchitectureSummary, ArchitectureWrite, FormatVersion, StrictModel
from sysd_backend.validation import validate_graph


class ArchitectureStore(Protocol):
    def initialize(self) -> None: ...
    def create(self, value: ArchitectureWrite) -> Architecture: ...
    def list(self) -> list[ArchitectureSummary]: ...
    def get(self, architecture_id: UUID) -> Architecture: ...
    def replace(self, architecture_id: UUID, value: ArchitectureWrite) -> Architecture: ...
    def delete(self, architecture_id: UUID) -> None: ...


class StoredRow(StrictModel):
    id: str
    name: str
    format_version: FormatVersion
    created_at: str
    updated_at: str
    document_json: str


class SQLiteArchitectureStore:
    def __init__(self, database_path: Path, timeout: float = 1.0) -> None:
        self.database_path = database_path
        self.timeout = timeout

    @contextmanager
    def connection(self, *, write: bool = False) -> Iterator[sqlite3.Connection]:
        try:
            with closing(sqlite3.connect(self.database_path, timeout=self.timeout, isolation_level=None)) as connection:
                connection.row_factory = sqlite3.Row
                if write:
                    connection.execute("BEGIN IMMEDIATE")
                try:
                    yield connection
                    if write:
                        connection.commit()
                except BaseException:
                    if write:
                        connection.rollback()
                    raise
        except sqlite3.OperationalError as error:
            raise StorageUnavailable("The architecture library is unavailable.") from error
        except sqlite3.DatabaseError as error:
            raise InvalidStoredArchitecture("The architecture library is invalid.") from error

    def initialize(self) -> None:
        try:
            self.database_path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as error:
            raise StorageUnavailable("The database directory is unavailable.") from error
        with self.connection(write=True) as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS architectures (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    format_version INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    document_json TEXT NOT NULL
                )
            """)

    def decode(self, row: sqlite3.Row) -> Architecture:
        try:
            fields: dict[str, object] = {key: row[key] for key in row.keys()}
            record = StoredRow.model_validate(fields)
            document = ArchitectureDocument.model_validate_json(record.document_json)
            if record.format_version != document.format_version or validate_graph(document):
                raise ValueError("Stored document is invalid.")
            payload: dict[str, object] = {
                "id": record.id, "name": record.name, "created_at": record.created_at,
                "updated_at": record.updated_at, "document": document.model_dump(mode="json"),
            }
            architecture = Architecture.model_validate_json(json.dumps(payload))
            if architecture.name != record.name:
                raise ValueError("Stored name is not normalized.")
            return architecture
        except (ValidationError, ValueError) as error:
            raise InvalidStoredArchitecture("The saved architecture is invalid.") from error

    def read(self, connection: sqlite3.Connection, architecture_id: UUID) -> Architecture:
        row: sqlite3.Row | None = connection.execute(
            "SELECT id, name, format_version, created_at, updated_at, document_json FROM architectures WHERE id = ?",
            (str(architecture_id),),
        ).fetchone()
        if row is None:
            raise ArchitectureNotFound("The saved architecture was not found.")
        return self.decode(row)

    def create(self, value: ArchitectureWrite) -> Architecture:
        now = datetime.now(UTC)
        architecture = Architecture(id=uuid4(), name=value.name, created_at=now, updated_at=now, document=value.document)
        with self.connection(write=True) as connection:
            connection.execute(
                "INSERT INTO architectures (id, name, format_version, created_at, updated_at, document_json) VALUES (?, ?, ?, ?, ?, ?)",
                (str(architecture.id), architecture.name, value.document.format_version,
                 now.isoformat(), now.isoformat(), value.document.model_dump_json()),
            )
        return architecture

    def list(self) -> list[ArchitectureSummary]:
        with self.connection() as connection:
            rows: list[sqlite3.Row] = connection.execute(
                "SELECT id, name, format_version, created_at, updated_at, document_json FROM architectures ORDER BY updated_at DESC, id ASC"
            ).fetchall()
            results: list[ArchitectureSummary] = []
            for row in rows:
                architecture = self.decode(row)
                results.append(ArchitectureSummary(
                    id=architecture.id, name=architecture.name, created_at=architecture.created_at,
                    updated_at=architecture.updated_at, format_version=architecture.document.format_version,
                ))
            return results

    def get(self, architecture_id: UUID) -> Architecture:
        with self.connection() as connection:
            return self.read(connection, architecture_id)

    def replace(self, architecture_id: UUID, value: ArchitectureWrite) -> Architecture:
        with self.connection(write=True) as connection:
            existing = self.read(connection, architecture_id)
            if existing.name == value.name and existing.document == value.document:
                return existing
            updated_at = max(datetime.now(UTC), existing.updated_at + timedelta(microseconds=1))
            architecture = Architecture(
                id=existing.id, name=value.name, created_at=existing.created_at,
                updated_at=updated_at, document=value.document,
            )
            connection.execute(
                "UPDATE architectures SET name = ?, format_version = ?, updated_at = ?, document_json = ? WHERE id = ?",
                (value.name, value.document.format_version, updated_at.isoformat(), value.document.model_dump_json(), str(architecture_id)),
            )
            return architecture

    def delete(self, architecture_id: UUID) -> None:
        with self.connection(write=True) as connection:
            cursor = connection.execute("DELETE FROM architectures WHERE id = ?", (str(architecture_id),))
            if cursor.rowcount == 0:
                raise ArchitectureNotFound("The saved architecture was not found.")
