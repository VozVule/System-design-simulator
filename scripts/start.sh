#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

for command in npm lsof; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "Error: $command is required to start the application." >&2
        exit 1
    fi
done
if [[ ! -x .venv/bin/python ]]; then
    echo "Error: install backend dependencies in the project-local .venv first." >&2
    exit 1
fi
if [[ ! -f frontend/node_modules/vite/bin/vite.js ]]; then
    echo "Error: frontend dependencies are missing; run npm --prefix frontend ci." >&2
    exit 1
fi

occupied=0
for port in 8000 5173; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null; then
        echo "Error: port $port is already in use; stop the existing service first." >&2
        occupied=1
    fi
done
if (( occupied )); then
    exit 1
fi

backend_pid=""
frontend_pid=""
cleanup() {
    trap '' INT TERM
    for pid in "$backend_pid" "$frontend_pid"; do
        [[ -n "$pid" ]] || continue
        kill -TERM -- "-$pid" 2>/dev/null || true
    done
    # Give both process groups up to five seconds to shut down gracefully.
    for (( attempt=0; attempt<50; attempt++ )); do
        alive=0
        for pid in "$backend_pid" "$frontend_pid"; do
            [[ -n "$pid" ]] || continue
            if kill -0 -- "-$pid" 2>/dev/null; then
                alive=1
            fi
        done
        if (( ! alive )); then
            break
        fi
        sleep 0.1
    done
    for pid in "$backend_pid" "$frontend_pid"; do
        [[ -n "$pid" ]] || continue
        kill -KILL -- "-$pid" 2>/dev/null || true
        wait "$pid" 2>/dev/null || true
    done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Job control gives each service its own process group, including npm's children.
set -m
echo "Starting backend at http://127.0.0.1:8000 and frontend at http://127.0.0.1:5173."
echo "Press Ctrl+C to stop both services."
.venv/bin/python -m uvicorn sysd_backend.main:app --host 127.0.0.1 --port 8000 &
backend_pid=$!
(
    cd frontend
    exec npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
) &
frontend_pid=$!

while true; do
    if ! kill -0 "$backend_pid" 2>/dev/null; then
        echo "Error: backend exited; stopping both services." >&2
        exit 1
    fi
    if ! kill -0 "$frontend_pid" 2>/dev/null; then
        echo "Error: frontend exited; stopping both services." >&2
        exit 1
    fi
    sleep 0.2
done
