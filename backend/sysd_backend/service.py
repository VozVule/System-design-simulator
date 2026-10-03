from uuid import UUID

from sysd_backend.errors import DocumentInvalid
from sysd_backend.models import Architecture, ArchitectureList, ArchitectureWrite
from sysd_backend.storage import ArchitectureStore
from sysd_backend.validation import validate_graph


class ArchitectureService:
    def __init__(self, store: ArchitectureStore) -> None:
        self.store = store

    def validate(self, value: ArchitectureWrite) -> None:
        issues = validate_graph(value.document)
        if issues:
            raise DocumentInvalid(issues)

    def create(self, value: ArchitectureWrite) -> Architecture:
        self.validate(value)
        return self.store.create(value)

    def replace(self, architecture_id: UUID, value: ArchitectureWrite) -> Architecture:
        self.validate(value)
        return self.store.replace(architecture_id, value)

    def list(self) -> ArchitectureList:
        return ArchitectureList(items=self.store.list())

    def get(self, architecture_id: UUID) -> Architecture:
        return self.store.get(architecture_id)

    def delete(self, architecture_id: UUID) -> None:
        self.store.delete(architecture_id)
