"""
tests/golden/test_golden_suite.py
──────────────────────────────────
Pytest integration wrapper for the evaluation benchmark suite.
Allows running evaluation quality gates via `pytest tests/golden/`.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from tests.evaluation.runner import run_evaluation

GOLDEN_DATASET = Path(__file__).parent / "golden_set.json"
REPORT_OUTPUT = Path(__file__).parents[2] / "evaluation_report.json"


@pytest.mark.golden
@pytest.mark.asyncio
async def test_evaluation_quality_and_regression_gate():
    """Executes evaluation pipeline and verifies engine meets 85% quality gate."""
    passed = await run_evaluation(
        dataset_path=GOLDEN_DATASET,
        output_path=REPORT_OUTPUT,
        min_accuracy=0.85,
        verbose=False,
    )
    assert passed, "Evaluation engine failed to meet the 85% accuracy gate or detected a regression."
