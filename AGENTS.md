# Project instructions

## Specifications

- Store backend specifications and API contracts in `specs/backend`.
- Store frontend specifications in `specs/frontend`.

## Local application startup

- When you need to start the local application, run `./scripts/start.sh` from the repository root. The Bash launcher at `scripts/start.sh` starts both the Python backend and Svelte frontend.
- The launcher exits with an error if either service port (8000 or 5173) is occupied. Resolve the existing process before retrying; do not start another copy or switch ports to bypass the error.
- Keep the launcher running in the foreground. Ctrl+C stops both services; if either service exits, the launcher stops the other and returns an error.
- Install backend dependencies in `.venv` and frontend dependencies with `npm --prefix frontend ci` before launching.

## Backend Python environment

- Always use the project-local virtual environment at `.venv` in the repository root for backend Python work.
- If it does not exist, create it with `python3 -m venv .venv`. Using the system Python is permitted only to create the environment.
- Install every backend runtime, development, testing, and type-checking dependency inside this environment. Use `.venv/bin/python -m pip` for installs; never install backend dependencies into the system Python or user site-packages.
- Run backend scripts, tests, and type checks using this environment, such as `.venv/bin/python -m pytest` and `.venv/bin/python -m mypy`.
- Start the local application using the launcher above, which starts the backend with `.venv/bin/python`.
- Prefer explicit `.venv/bin/python` commands so environment selection does not depend on shell activation. An activated virtual environment is also acceptable after verifying that its interpreter is the repository's `.venv/bin/python`.
- Keep `.venv` out of version control. Declare dependencies in the backend's dependency configuration so a fresh environment can be recreated.
