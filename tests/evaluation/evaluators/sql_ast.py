"""
tests/evaluation/evaluators/sql_ast.py
────────────────────────────────────────
Evaluator for structural SQL comparison using sqlglot AST parsing.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import sqlglot
from sqlglot import exp


@dataclass
class SQLASTScore:
    is_valid_syntax: bool
    exact_ast_match: bool
    tables_matched: bool
    clause_score: float
    composite_ast_score: float
    error: Optional[str] = None


class SQLASTEvaluator:
    """Parses SQL queries with sqlglot and evaluates structural equivalence."""

    def evaluate(self, generated_sql: Optional[str], canonical_sql: Optional[str], dialect: str = "postgres") -> SQLASTScore:
        if not generated_sql:
            return SQLASTScore(
                is_valid_syntax=False,
                exact_ast_match=False,
                tables_matched=False,
                clause_score=0.0,
                composite_ast_score=0.0,
                error="No SQL generated",
            )

        if not canonical_sql:
            # If no canonical SQL expected (e.g. unsafe query), score 1.0
            return SQLASTScore(
                is_valid_syntax=True,
                exact_ast_match=True,
                tables_matched=True,
                clause_score=1.0,
                composite_ast_score=1.0,
            )

        try:
            gen_ast = sqlglot.parse_one(generated_sql, read=dialect)
        except Exception as err:
            return SQLASTScore(
                is_valid_syntax=False,
                exact_ast_match=False,
                tables_matched=False,
                clause_score=0.0,
                composite_ast_score=0.0,
                error=f"Syntax error in generated SQL: {err}",
            )

        try:
            can_ast = sqlglot.parse_one(canonical_sql, read=dialect)
        except Exception:
            can_ast = None

        if can_ast is None:
            return SQLASTScore(
                is_valid_syntax=True,
                exact_ast_match=False,
                tables_matched=False,
                clause_score=0.5,
                composite_ast_score=0.5,
            )

        # 1. Exact AST match after sqlglot normalization
        norm_gen = gen_ast.sql()
        norm_can = can_ast.sql()
        exact_ast_match = norm_gen == norm_can

        # 2. Table reference match
        gen_tables = {t.name.lower() for t in gen_ast.find_all(exp.Table)}
        can_tables = {t.name.lower() for t in can_ast.find_all(exp.Table)}
        tables_matched = gen_tables == can_tables if can_tables else True

        # 3. Clause similarity
        score_components = []
        
        # SELECT targets count
        gen_selects = len(list(gen_ast.find_all(exp.Select)))
        can_selects = len(list(can_ast.find_all(exp.Select)))
        score_components.append(1.0 if gen_selects == can_selects else 0.5)

        # WHERE clause existence
        gen_has_where = gen_ast.find(exp.Where) is not None
        can_has_where = can_ast.find(exp.Where) is not None
        score_components.append(1.0 if gen_has_where == can_has_where else 0.0)

        # GROUP BY clause existence
        gen_has_group = gen_ast.find(exp.Group) is not None
        can_has_group = can_ast.find(exp.Group) is not None
        score_components.append(1.0 if gen_has_group == can_has_group else 0.0)

        clause_score = sum(score_components) / len(score_components) if score_components else 1.0

        # Composite AST Score
        if exact_ast_match:
            composite = 1.0
        else:
            table_weight = 0.5 if tables_matched else 0.0
            clause_weight = 0.4 * clause_score
            syntax_weight = 0.1
            composite = table_weight + clause_weight + syntax_weight

        return SQLASTScore(
            is_valid_syntax=True,
            exact_ast_match=exact_ast_match,
            tables_matched=tables_matched,
            clause_score=round(clause_score, 4),
            composite_ast_score=round(composite, 4),
        )
