#!/usr/bin/env python3
"""Fail when the statistical oracle runtime differs from its pinned contract."""

from __future__ import annotations

from importlib import metadata
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]


def normalize_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def pinned_packages() -> dict[str, str]:
    requirements = ROOT / "requirements-stats.txt"
    pins: dict[str, str] = {}
    for line_number, raw_line in enumerate(requirements.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.partition("#")[0].strip()
        if not line:
            continue
        match = re.fullmatch(r"([A-Za-z0-9_.-]+)==([A-Za-z0-9.!+-]+)", line)
        if not match:
            raise ValueError(f"{requirements.name}:{line_number} must use an exact package pin (name==version).")
        name = normalize_name(match.group(1))
        if name in pins:
            raise ValueError(f"{requirements.name}:{line_number} repeats package {name}.")
        pins[name] = match.group(2)
    if not pins:
        raise ValueError(f"{requirements.name} contains no pinned packages.")
    return pins


def runtime_mismatches() -> tuple[str, list[str]]:
    expected_python = (ROOT / ".python-version").read_text(encoding="utf-8").strip()
    actual_python = ".".join(str(part) for part in sys.version_info[:3])
    mismatches = []
    if actual_python != expected_python:
        mismatches.append(f"Python {actual_python}; expected {expected_python}")

    for name, expected in sorted(pinned_packages().items()):
        try:
            actual = metadata.version(name)
        except metadata.PackageNotFoundError:
            actual = "not installed"
        if actual != expected:
            mismatches.append(f"{name} {actual}; expected {expected}")
    return actual_python, mismatches


def validate_runtime() -> str:
    actual_python, mismatches = runtime_mismatches()
    if mismatches:
        raise RuntimeError("Statistical-oracle runtime mismatch: " + "; ".join(mismatches))
    return actual_python


def main() -> int:
    try:
        actual_python = validate_runtime()
    except RuntimeError as error:
        print(error, file=sys.stderr)
        print("Install the pinned environment with: python -m pip install -r requirements-stats.txt", file=sys.stderr)
        return 1

    print(f"Statistical-oracle runtime supported: Python {actual_python}; {len(pinned_packages())} pinned packages.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
