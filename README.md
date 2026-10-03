# System Design Simulator backend

Release 1 milestone 1 provides a local architecture library API backed by SQLite. Canvas editing stays in the frontend; POST is the first Save and PUT saves a complete replacement of an existing architecture.

Use Python 3.12 and the repository's `.venv` for all backend work. The environment has already been created in this workspace. To recreate it from the repository root:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python -m pip install --no-build-isolation --no-deps -e .
```

Start the application from the repository root:

```bash
.venv/bin/python -m uvicorn sysd_backend.main:app --host 127.0.0.1 --port 8000
```

Open [interactive API documentation](http://127.0.0.1:8000/docs) or [generated OpenAPI](http://127.0.0.1:8000/openapi.json).

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/v1/architectures` | Create and save; returns 201 and Location. |
| GET | `/api/v1/architectures` | List saved metadata. |
| GET | `/api/v1/architectures/{architecture_id}` | Open the latest saved document. |
| PUT | `/api/v1/architectures/{architecture_id}` | Replace and save the complete name/document. |
| DELETE | `/api/v1/architectures/{architecture_id}` | Delete; returns 204. |

The schema and payload examples are in [the backend specification](specs/backend/backend-api-spec.md) and [approved OpenAPI contract](specs/backend/backend-api.openapi.json). Empty/disconnected diagrams can be saved. Typed shape, structural integrity, and the no-cycle rule are enforced at Save; simulation readiness and the simulation engine are later work.

SQLite initializes automatically on application startup at `data/architectures.sqlite3`. The library starts empty, persists across restarts, and stores complete JSON documents plus metadata. The database and `.venv` are ignored by Git. Configure another durable database location with `SYSD_DATABASE_PATH`. Configure allowed frontend origins with the comma-separated `SYSD_CORS_ORIGINS`; defaults are `http://localhost:5173` and `http://127.0.0.1:5173`.

For example:

```bash
SYSD_DATABASE_PATH=/absolute/path/library.sqlite3 .venv/bin/python -m uvicorn sysd_backend.main:app --host 127.0.0.1 --port 8000
```

Run all required checks with:

```bash
.venv/bin/python scripts/check.py
```

That command runs strict mypy over backend code, tests, and scripts, then the complete pytest suite. Domain unit tests cover graph/configuration rules. HTTP tests use real temporary SQLite files and verify CRUD, durable Save, rollback on rejected writes, locked storage, validation/errors, CORS, and the OpenAPI contract. Both the approved and generated OpenAPI documents receive full schema validation. Tests do not modify the production library.

For a focused test run, use `.venv/bin/python -m pytest tests/test_http.py`. Install additional dependencies using `.venv/bin/python -m pip`, update the dependency declaration and lockfile, and keep the required checks passing.
