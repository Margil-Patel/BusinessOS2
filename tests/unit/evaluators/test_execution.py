"""
tests/unit/evaluators/test_execution.py
─────────────────────────────────────────
Unit tests verifying ExecutionEvaluator deterministic comparison rules.
"""
import pytest
from tests.evaluation.evaluators.execution import ExecutionEvaluator
from tests.evaluation.loader import ExecutionComparison


@pytest.fixture
def evaluator():
    return ExecutionEvaluator()


def test_execution_none_strategy(evaluator):
    res = evaluator.evaluate_results([], [], strategy=ExecutionComparison.NONE)
    assert res.passed is True
    assert res.score == 1.0


def test_execution_exact_set_match(evaluator):
    gen = [{"name": "Wheat", "land": 50.0}]
    exp = [{"name": "Wheat", "land": 50.0}]
    res = evaluator.evaluate_results(gen, exp, strategy=ExecutionComparison.SET_MATCH)
    assert res.passed is True
    assert res.score == 1.0


def test_execution_superset_metadata_columns_pass(evaluator):
    """Case A: Super-set metadata columns (id, name, stock) vs (name, stock) should PASS via subset projection."""
    gen = [{"id": "MED01", "medicine_name": "Aspirin", "stock_quantity": 100}]
    exp = [{"medicine_name": "Aspirin", "stock_quantity": 100}]
    res = evaluator.evaluate_results(gen, exp, strategy=ExecutionComparison.SET_MATCH)
    assert res.passed is True
    assert res.score == 1.0


def test_execution_missing_expected_columns_fail(evaluator):
    """Generated rows missing expected columns (only stock_quantity) should FAIL."""
    gen = [{"stock_quantity": 100}]
    exp = [{"medicine_name": "Aspirin", "stock_quantity": 100}]
    res = evaluator.evaluate_results(gen, exp, strategy=ExecutionComparison.SET_MATCH)
    assert res.passed is False
    assert res.score == 0.0


def test_execution_scalar_match(evaluator):
    gen = [{"total_sum": 125.5}]
    exp = [{"sum": 125.5}]
    res = evaluator.evaluate_results(gen, exp, strategy=ExecutionComparison.SCALAR_MATCH)
    assert res.passed is True
    assert res.score == 1.0
