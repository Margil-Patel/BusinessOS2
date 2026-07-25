"""
tests/golden/run_golden.py
───────────────────────────
Golden test runner — backward-compatible entry point delegating to the
upgraded multi-stage evaluation engine in `tests.evaluation.runner`.

Usage:
    python tests/golden/run_golden.py
    python tests/golden/run_golden.py --verbose
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).parents[2]))

from tests.evaluation.runner import run_evaluation

GOLDEN_DATASET = Path(__file__).parent / "golden_set.json"
REPORT_OUTPUT = Path(__file__).parents[2] / "evaluation_report.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Golden NL2SQL Evaluation Runner")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print verbose error details")
    parser.add_argument("--min-accuracy", type=float, default=0.85, help="Minimum accuracy gate (0.0 to 1.0)")
    parser.add_argument("--baseline", type=Path, default=None, help="Path to baseline report JSON")
    args = parser.parse_args()

    success = asyncio.run(
        run_evaluation(
            dataset_path=GOLDEN_DATASET,
            output_path=REPORT_OUTPUT,
            baseline_path=args.baseline,
            min_accuracy=args.min_accuracy,
            verbose=args.verbose,
        )
    )
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
