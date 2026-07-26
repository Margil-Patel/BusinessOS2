"""
tests/evaluation/evaluators/retrieval.py
──────────────────────────────────────────
Evaluator for Schema Retrieval (Precision, Recall, F1).
Supports primary trace retrieval and secondary SQL AST table parsing fallback.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

import sqlglot
from sqlglot import exp


@dataclass
class RetrievalScore:
    table_precision: float
    table_recall: float
    table_f1: float
    retrieved_tables: list[str]
    expected_tables: list[str]
    retrieval_source: str = "trace"  # "trace" or "ast_fallback"

    @property
    def composite_f1(self) -> float:
        return self.table_f1


class RetrievalEvaluator:
    """
    Evaluates retrieved schema context against ground-truth tables.
    
    Retrieval Extraction Policy:
    1. Primary Source: Metadata trace recorded during QueryController execution (`trace.tables_used`).
    2. Secondary Fallback: If trace metadata is empty (e.g. model generated SQL directly),
       extract table references from `generated_sql` using sqlglot AST parsing.
    """

    @staticmethod
    def _normalize(name: str) -> str:
        return name.strip().lower()

    def evaluate(
        self,
        retrieved_tables: Sequence[str],
        expected_tables: Sequence[str],
        generated_sql: Optional[str] = None,
    ) -> RetrievalScore:
        source = "trace"
        tables = list(retrieved_tables)

        # Fallback to AST table parsing if trace retrieval list is empty
        if not tables and generated_sql:
            try:
                parsed = sqlglot.parse_one(generated_sql)
                ast_tables = [t.sql() for t in parsed.find_all(exp.Table)]
                if ast_tables:
                    tables = ast_tables
                    source = "ast_fallback"
            except Exception:
                pass

        if not expected_tables:
            # If no tables expected (e.g. unsafe query), score 1.0 if none retrieved, else 0.0
            score = 1.0 if not tables else 0.0
            return RetrievalScore(
                table_precision=score,
                table_recall=score,
                table_f1=score,
                retrieved_tables=tables,
                expected_tables=list(expected_tables),
                retrieval_source=source,
            )

        ret_set = {self._normalize(t) for t in tables}
        exp_set = {self._normalize(t) for t in expected_tables}

        # Match schema-qualified vs unqualified table names
        matched = set()
        for r in ret_set:
            r_bare = r.split(".")[-1]
            for e in exp_set:
                e_bare = e.split(".")[-1]
                if r == e or r_bare == e_bare:
                    matched.add(r)
                    break

        tp = len(matched)
        fp = len(ret_set) - tp
        fn = len(exp_set) - tp

        precision = tp / len(ret_set) if ret_set else 0.0
        recall = tp / len(exp_set) if exp_set else 0.0

        if precision + recall > 0:
            f1 = 2 * (precision * recall) / (precision + recall)
        else:
            f1 = 0.0

        return RetrievalScore(
            table_precision=round(precision, 4),
            table_recall=round(recall, 4),
            table_f1=round(f1, 4),
            retrieved_tables=tables,
            expected_tables=list(expected_tables),
            retrieval_source=source,
        )
