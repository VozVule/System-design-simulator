import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    database_path: Path
    allowed_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")
    sqlite_timeout: float = 1.0

    @classmethod
    def from_environment(cls) -> "Settings":
        path = Path(os.environ.get("SYSD_DATABASE_PATH", str(PROJECT_ROOT / "data/architectures.sqlite3")))
        configured_origins = os.environ.get("SYSD_CORS_ORIGINS")
        settings = cls(database_path=path)
        if configured_origins is None:
            return settings
        return cls(database_path=path, allowed_origins=tuple(origin.strip() for origin in configured_origins.split(",") if origin.strip()))
