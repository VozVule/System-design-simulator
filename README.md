# System Design Simulator

Build an architecture, run its current canvas, and replay request and response traffic one step at a time. The Python backend calculates a complete recording. The Svelte frontend displays that recording on the captured architecture.

Run includes unsaved changes and defaults to 60 steps. Capacity limits new requests; excess requests drop without a response. Accepted requests return through their original path and complete when the reply reaches the caller. Replay provides selection, a timeline, and component details. Return to Edit to change the architecture and run it again.

Save, Library, Open, and Delete use a local SQLite architecture library. Save stores the architecture without simulation results or playback settings. See the [frontend README](frontend/README.md) for editor usage, API origin configuration, and frontend verification.

Use Python 3.12 and the repository's `.venv` for all backend work. The environment has already been created in this workspace. To recreate it from the repository root:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python -m pip install --no-build-isolation --no-deps -e .
```

Start both the Python backend and Svelte frontend from the repository root (install frontend dependencies once with `npm --prefix frontend ci`):

```bash
./scripts/start.sh
```

Open the frontend at [http://127.0.0.1:5173](http://127.0.0.1:5173). The Bash launcher uses ports 8000 and 5173 and returns an error before starting either service if a port is occupied. Keep it running in the foreground; Ctrl+C stops both services. If either service exits, the other is stopped and the launcher returns an error.

Open [interactive API documentation](http://127.0.0.1:8000/docs) or [generated OpenAPI](http://127.0.0.1:8000/openapi.json).

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/v1/architectures` | Create and save; returns 201 and Location. |
| GET | `/api/v1/architectures` | List saved metadata. |
| GET | `/api/v1/architectures/{architecture_id}` | Open the latest saved document. |
| PUT | `/api/v1/architectures/{architecture_id}` | Replace and save the complete name/document. |
| DELETE | `/api/v1/architectures/{architecture_id}` | Delete; returns 204. |
| POST | `/api/v1/simulations` | Calculate the submitted document for `total_ticks`; returns frames 0–T and the run summary. |

The library schema and payload examples are in [the backend specification](specs/backend/backend-api-spec.md) and [approved OpenAPI contract](specs/backend/backend-api.openapi.json). Empty and disconnected diagrams can be saved. Save enforces typed fields, structural integrity, and the no-cycle rule. Run also requires a Caller Group, required destinations, valid routing weights, and every component to be reachable from a caller.

The accepted [backend simulation specification](specs/backend/simulation-spec.md) and [frontend replay specification](specs/frontend/simulation-replay-spec.md) define the Run API and replay behavior. Each direction advances one hop per step. A run ends at the selected step count without extra drain steps. Its totals satisfy `generated = completed + dropped + in_flight`.

SQLite initializes automatically on application startup at `data/architectures.sqlite3`. The library starts empty, persists across restarts, and stores complete JSON documents plus metadata. The database and `.venv` are ignored by Git. Configure another durable database location with `SYSD_DATABASE_PATH`. Configure allowed frontend origins with the comma-separated `SYSD_CORS_ORIGINS`; defaults are `http://localhost:5173` and `http://127.0.0.1:5173`.

For example:

```bash
SYSD_DATABASE_PATH=/absolute/path/library.sqlite3 ./scripts/start.sh
```

Run all required checks with:

```bash
.venv/bin/python scripts/check.py
```

That command runs strict mypy over backend code, tests, and scripts, then the complete pytest suite. Domain unit tests cover graph/configuration rules and request/response simulation. HTTP tests use temporary SQLite files and verify the library, Run validation, result accounting, CORS, and the OpenAPI contract. Both approved and generated OpenAPI documents receive schema validation. Tests do not modify the production library.

Run frontend checks with:

```bash
npm --prefix frontend run check
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run test:browser
```

Stop a running launcher before browser tests. The browser suite starts the same launcher with a temporary SQLite library on ports 8000 and 5173.

For a focused test run, use `.venv/bin/python -m pytest tests/test_http.py`. Install additional dependencies using `.venv/bin/python -m pip`, update the dependency declaration and lockfile, and keep the required checks passing.
