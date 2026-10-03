"""Run the required backend checks using the project's virtual environment."""

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    if Path(sys.prefix).resolve() != (ROOT / ".venv").resolve():
        raise SystemExit("Run this command using .venv/bin/python scripts/check.py")
    for module in ("mypy", "pytest"):
        subprocess.run([sys.executable, "-m", module], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
