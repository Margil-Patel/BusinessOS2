"""
tests/golden/run_golden.py
───────────────────────────
Golden test runner — measures NL→SQL accuracy against golden_set.json.
Reports keyword match rate and safety gate accuracy.

Usage:
    python tests/golden/run_golden.py
    python tests/golden/run_golden.py --verbose
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).parents[2]))

from config.settings import get_settings
from controller.query_controller import QueryController
from model.facade import ModelFacade

GOLDEN_PATH = Path(__file__).parent / "golden_set.json"
PASS_THRESHOLD = 0.75  # 75% keyword match = pass


def load_golden() -> list[dict]:
    with open(GOLDEN_PATH) as f:
        return json.load(f)


def score_result(result: dict, case: dict) -> tuple[bool, str]:
    """Returns (passed, reason)."""
    expected_safe = case["is_safe"]

    # Unsafe queries should be blocked
    if not expected_safe:
        if result.get("error"):
            return True, "correctly blocked"
        return False, f"unsafe query was NOT blocked; got SQL: {result.get('sql', '')[:80]}"

    # Safe queries should produce SQL
    if result.get("error"):
        return False, f"error: {result['error']}"

    sql = result.get("sql", "").upper()
    keywords = case.get("expected_keywords", [])
    matched = [kw for kw in keywords if kw.upper() in sql]
    ratio = len(matched) / len(keywords) if keywords else 1.0

    if ratio >= PASS_THRESHOLD:
        return True, f"keyword match {len(matched)}/{len(keywords)} ({ratio:.0%})"
    return False, f"keyword match too low: {len(matched)}/{len(keywords)} — missing: {[k for k in keywords if k.upper() not in sql]}"


async def run_golden(verbose: bool = False) -> None:
    cases = load_golden()
    settings = get_settings()
    model = ModelFacade(settings)
    await model.startup()

    try:
        await model.sync_schema()
    except Exception as e:
        print(f"[WARNING] Schema sync failed: {e}")

    ctrl = QueryController(model, settings)

    results: list[tuple[bool, str, dict]] = []

    for case in cases:
        print(f"  [{case['id']}] {case['nl_query'][:60]}...", end=" ", flush=True)
        try:
            result = await ctrl.handle(case["nl_query"])
        except Exception as exc:
            result = {"error": str(exc), "sql": ""}

        passed, reason = score_result(result, case)
        results.append((passed, reason, case))

        status = "✓" if passed else "✗"
        print(f"{status} {reason}")

        if verbose and not passed:
            print(f"     SQL: {result.get('sql', '')[:120]}")

    await model.shutdown()

    # Summary
    total = len(results)
    passed_count = sum(1 for p, _, _ in results if p)
    accuracy = passed_count / total if total else 0
    print(f"\n{'='*60}")
    print(f"ACCURACY: {passed_count}/{total} = {accuracy:.1%}")
    print(f"{'='*60}")

    if accuracy < 0.85:
        print(f"[FAIL] Accuracy {accuracy:.1%} below 85% gate")
        sys.exit(1)
    else:
        print(f"[PASS] Accuracy {accuracy:.1%} meets 85% gate")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()
    asyncio.run(run_golden(verbose=args.verbose))
