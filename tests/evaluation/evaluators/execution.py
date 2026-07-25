"""
tests/evaluation/evaluators/execution.py
──────────────────────────────────────────
Evaluator for SQL query execution and ground-truth result set equivalence.
Supports deterministic key-column subset projection and scalar/ordered matching.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from tests.evaluation.loader import ExecutionComparison


@dataclass
class ExecutionScore:
    passed: bool
    comparison_strategy: str
    generated_rows_count: int
    expected_rows_count: int
    matched_rows_count: int
    score: float
    error: Optional[str] = None


class ExecutionEvaluator:
    """
    Executes model SQL and canonical SQL on target database and compares results.
    
    Deterministic Comparison Policy:
    1. NONE: Skips execution comparison (e.g. unsafe blocked queries). Always 1.0.
    2. SCALAR_MATCH: Single aggregate value comparison (ignoring column aliases).
    3. SET_MATCH / ORDERED_MATCH:
       - Key-Column Subset Projection: If expected rows specify a subset of columns K_exp
         (e.g., ['name', 'stock']) and generated rows contain a super-set K_gen (e.g., ['id', 'name', 'stock']),
         project each generated row onto K_exp before comparing.
       - Values are normalized: strings trimmed, floats rounded to 4 decimals, None handled.
    """

    @staticmethod
    def _normalize_val(val: Any) -> Any:
        if isinstance(val, float):
            return round(val, 4)
        if isinstance(val, int):
            return float(val)
        if val is None:
            return None
        return str(val).strip().lower()

    @classmethod
    def _normalize_row(cls, row: dict[str, Any], target_keys: Optional[set[str]] = None) -> tuple:
        """Convert dict row into a sorted tuple of normalized values."""
        normalized = []
        for key, val in sorted(row.items(), key=lambda x: str(x[0]).lower()):
            if target_keys is not None and key.lower() not in target_keys:
                continue
            normalized.append(cls._normalize_val(val))
        return tuple(normalized)

    def evaluate_results(
        self,
        generated_rows: list[dict[str, Any]],
        expected_rows: list[dict[str, Any]],
        strategy: ExecutionComparison = ExecutionComparison.SET_MATCH,
        execution_error: Optional[str] = None,
    ) -> ExecutionScore:
        if execution_error:
            return ExecutionScore(
                passed=False,
                comparison_strategy=strategy.value,
                generated_rows_count=0,
                expected_rows_count=len(expected_rows),
                matched_rows_count=0,
                score=0.0,
                error=execution_error,
            )

        if strategy == ExecutionComparison.NONE:
            return ExecutionScore(
                passed=True,
                comparison_strategy=strategy.value,
                generated_rows_count=len(generated_rows),
                expected_rows_count=len(expected_rows),
                matched_rows_count=0,
                score=1.0,
            )

        # Key-Column Subset Projection check
        target_keys: Optional[set[str]] = None
        if expected_rows and generated_rows:
            exp_keys = {k.lower() for k in expected_rows[0].keys()}
            gen_keys = {k.lower() for k in generated_rows[0].keys()}
            if exp_keys.issubset(gen_keys):
                target_keys = exp_keys

        gen_norm = [self._normalize_row(r, target_keys) for r in generated_rows]
        exp_norm = [self._normalize_row(r, None) for r in expected_rows]

        if strategy == ExecutionComparison.ORDERED_MATCH:
            passed = gen_norm == exp_norm
            matched = sum(1 for g, e in zip(gen_norm, exp_norm) if g == e)
            score = 1.0 if passed else (matched / max(len(exp_norm), 1))
        elif strategy == ExecutionComparison.SCALAR_MATCH:
            # Check single scalar value matching regardless of column alias
            if gen_norm and exp_norm and gen_norm[0] and exp_norm[0]:
                gen_val = gen_norm[0][0]
                exp_val = exp_norm[0][0]
                passed = gen_val == exp_val
            else:
                passed = gen_norm == exp_norm
            score = 1.0 if passed else 0.0
            matched = 1 if passed else 0
        else:
            # SET_MATCH default (unordered set comparison)
            gen_set = set(gen_norm)
            exp_set = set(exp_norm)
            intersection = gen_set.intersection(exp_set)
            passed = gen_set == exp_set
            score = len(intersection) / len(exp_set) if exp_set else (1.0 if not gen_set else 0.0)
            matched = len(intersection)

        return ExecutionScore(
            passed=passed,
            comparison_strategy=strategy.value,
            generated_rows_count=len(generated_rows),
            expected_rows_count=len(expected_rows),
            matched_rows_count=matched,
            score=round(score, 4),
        )
