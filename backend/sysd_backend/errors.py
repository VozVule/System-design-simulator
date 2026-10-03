from sysd_backend.models import ValidationIssue


class BackendError(Exception):
    """An expected application failure handled at the HTTP boundary."""


class DocumentInvalid(BackendError):
    def __init__(self, issues: list[ValidationIssue]) -> None:
        super().__init__("The architecture document is invalid.")
        self.issues = issues


class ArchitectureNotFound(BackendError):
    pass


class StorageUnavailable(BackendError):
    pass


class InvalidStoredArchitecture(BackendError):
    pass
