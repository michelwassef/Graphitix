#!/usr/bin/env python3
"""Regenerate the independent crossed repeated-measures reference fixture."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np
from scipy.linalg import helmert

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from check_stats_oracle_runtime import validate_runtime
from stats_oracle import box_row_random_sphericity


def walsh_signal(subject_index: int, signal_index: int) -> float:
    return -1.0 if (subject_index & signal_index).bit_count() % 2 else 1.0


def create_measurements() -> np.ndarray:
    subject_count, group_count, condition_count = 16, 3, 3
    group_basis = helmert(group_count, full=False).T
    condition_basis = helmert(condition_count, full=False).T
    group_constant = np.full(condition_count, 1 / np.sqrt(condition_count))
    condition_constant = np.full(group_count, 1 / np.sqrt(group_count))
    group_effect = np.kron(group_basis, group_constant[:, None])
    condition_effect = np.kron(condition_constant[:, None], condition_basis)
    interaction = np.kron(group_basis, condition_basis)
    specifications = [
        (group_effect, [np.sqrt(8 / 3), 0], [1, 3], [1, 2]),
        (condition_effect, [np.sqrt(4 / 3), 0], [1, 2], [3, 4]),
        (interaction, [np.sqrt(6), 0, 0, 0], [1, 2, 3, 4], [5, 6, 7, 8]),
    ]
    rows = np.zeros((subject_count, group_count * condition_count), dtype=float)
    for subject_index in range(subject_count):
        for basis, means, scales, signals in specifications:
            scores = np.asarray([
                means[index] + scales[index] * walsh_signal(subject_index, signals[index])
                for index in range(len(means))
            ])
            rows[subject_index] += basis @ scores
        rows[subject_index] += 10 + 0.3 * walsh_signal(subject_index, 9)
    return rows.reshape(subject_count, group_count, condition_count)


def main() -> None:
    python_version = validate_runtime()
    measurements = create_measurements()
    reference = box_row_random_sphericity({"rows": measurements.tolist()})
    if reference.get("available") is not True:
        raise RuntimeError(reference.get("message") or "Unable to compute the crossed repeated-measures reference.")
    fixture = {
        "schemaVersion": "box-row-random-sphericity-fixture-v1",
        "design": "fully-crossed-within-subjects",
        "subjectCount": 16,
        "groupsCount": 3,
        "conditionsCount": 3,
        "rows": measurements.tolist(),
        "exactAlgebra": {
            "group": {"df1": 2, "df2": 30, "ssEffect": "128/3", "ssError": "160", "F": "4", "epsilonGG": "25/41", "epsilonHF": "359/565"},
            "condition": {"df1": 2, "df2": 30, "ssEffect": "64/3", "ssError": "80", "F": "4", "epsilonGG": "25/34", "epsilonHF": "183/230"},
            "interaction": {"df1": 4, "df2": 60, "ssEffect": "96", "ssError": "480", "F": "3", "epsilonGG": "75/118", "epsilonHF": "1141/1470"},
        },
        "generation": {
            "method": "scipy.linalg.helmert orthonormal contrasts plus orthogonal Walsh signals",
            "source": "section 14, ST-47 implementation verification in audits/statistics-audit-2026-10-25.md",
            "command": "python scripts/generate_box_row_random_sphericity_fixture.py",
            "python": python_version,
            "reference": reference["referenceVersions"],
        },
        "reference": reference,
    }
    target = ROOT / "test-support" / "fixtures" / "box-row-random-sphericity-v1.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(fixture, indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
