"""
tests/unit/evaluators/test_retrieval.py
─────────────────────────────────────────
Unit tests verifying RetrievalEvaluator trace matching & AST fallback.
"""
import pytest
from tests.evaluation.evaluators.retrieval import RetrievalEvaluator


@pytest.fixture
def evaluator():
    return RetrievalEvaluator()


def test_retrieval_primary_trace(evaluator):
    ret = ["agri_management.farmers"]
    exp = ["agri_management.farmers"]
    res = evaluator.evaluate(ret, exp)
    assert res.table_f1 == 1.0
    assert res.retrieval_source == "trace"


def test_retrieval_ast_fallback_when_trace_empty(evaluator):
    ret = []
    exp = ["agri_management.farmers"]
    sql = "SELECT * FROM agri_management.farmers WHERE village = 'Rampur'"
    res = evaluator.evaluate(ret, exp, generated_sql=sql)
    assert res.table_f1 == 1.0
    assert res.retrieval_source == "ast_fallback"


def test_retrieval_wrong_table(evaluator):
    ret = ["medical_store.medicines"]
    exp = ["agri_management.farmers"]
    res = evaluator.evaluate(ret, exp)
    assert res.table_f1 == 0.0
