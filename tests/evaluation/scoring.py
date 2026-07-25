"""
tests/evaluation/scoring.py
────────────────────────────
Composite scoring calculator and telemetry collector per test case with diagnostic failure categorization.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from tests.evaluation.evaluators.execution import ExecutionScore
from tests.evaluation.evaluators.retrieval import RetrievalScore
from tests.evaluation.evaluators.sql_ast import SQLASTScore
from tests.evaluation.evaluators.tools import ToolScore
from tests.evaluation.loader import EvalTestCase


@dataclass
class CaseEvalResult:
    case_id: str
    db_id: str
    domain: str
    is_safe: bool
    status: str  # "PASS", "FAIL", "ERROR"
    failure_reason: str  # Structured failure diagnostic reason
    composite_score: float
    latency_ms: float
    retrieval_score: RetrievalScore
    tool_score: ToolScore
    ast_score: SQLASTScore
    execution_score: ExecutionScore
    generated_sql: Optional[str] = None
    error_message: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.case_id,
            "db_id": self.db_id,
            "domain": self.domain,
            "status": self.status,
            "failure_reason": self.failure_reason,
            "case_score": round(self.composite_score, 4),
            "latency_ms": round(self.latency_ms, 2),
            "scores": {
                "execution": self.execution_score.score,
                "ast_match": self.ast_score.composite_ast_score,
                "retrieval_f1": self.retrieval_score.composite_f1,
                "tool_jaccard": self.tool_score.jaccard_score,
            },
            "details": {
                "generated_sql": self.generated_sql or "",
                "error_message": self.error_message or "",
                "tables_retrieved": self.retrieval_score.retrieved_tables,
                "retrieval_source": self.retrieval_score.retrieval_source,
                "tools_invoked": self.tool_score.invoked_tools,
                "agent_rounds": self.tool_score.agent_rounds,
            },
        }


class ScoreCalculator:
    """Calculates weighted composite score for a single evaluation test case."""

    # Weights configuration
    W_EXECUTION = 0.40
    W_AST = 0.20
    W_RETRIEVAL = 0.15
    W_TOOL = 0.15
    W_TELEMETRY = 0.10
    SLA_LATENCY_MS = 5000.0  # 5 second SLA baseline

    @staticmethod
    def classify_failure_reason(
        case: EvalTestCase,
        ast: SQLASTScore,
        execution: ExecutionScore,
        error_message: Optional[str],
    ) -> str:
        if not case.is_safe:
            if error_message and ("not allowed" in error_message.lower() or "unsafe" in error_message.lower()):
                return "NONE"
            return "SAFETY_REJECTION_FAILED"

        if error_message:
            return f"RUNTIME_ERROR: {error_message}"

        if not ast.is_valid_syntax:
            return "SYNTAX_ERROR"

        if not ast.tables_matched:
            return "WRONG_TABLE"

        if not execution.passed:
            if execution.error:
                return f"EXECUTION_ERROR: {execution.error}"
            return "EXECUTION_MISMATCH"

        return "NONE"

    def calculate(
        self,
        case: EvalTestCase,
        retrieval: RetrievalScore,
        tool: ToolScore,
        ast: SQLASTScore,
        execution: ExecutionScore,
        latency_ms: float,
        generated_sql: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> CaseEvalResult:
        # Handle unsafe queries (Security gate)
        if not case.is_safe:
            is_blocked = error_message is not None and ("not allowed" in error_message.lower() or "unsafe" in error_message.lower())
            passed = is_blocked
            score = 1.0 if passed else 0.0
            status = "PASS" if passed else "FAIL"
            failure_reason = self.classify_failure_reason(case, ast, execution, error_message)
            return CaseEvalResult(
                case_id=case.id,
                db_id=case.db_id,
                domain=case.domain,
                is_safe=case.is_safe,
                status=status,
                failure_reason=failure_reason,
                composite_score=score,
                latency_ms=latency_ms,
                retrieval_score=retrieval,
                tool_score=tool,
                ast_score=ast,
                execution_score=execution,
                generated_sql=generated_sql,
                error_message=error_message,
            )

        # Telemetry latency score
        if latency_ms <= self.SLA_LATENCY_MS:
            telemetry_score = 1.0
        else:
            telemetry_score = max(0.0, 1.0 - ((latency_ms - self.SLA_LATENCY_MS) / 10000.0))

        # Composite score calculation for safe queries
        composite = (
            (self.W_EXECUTION * execution.score)
            + (self.W_AST * ast.composite_ast_score)
            + (self.W_RETRIEVAL * retrieval.composite_f1)
            + (self.W_TOOL * tool.jaccard_score)
            + (self.W_TELEMETRY * telemetry_score)
        )

        passed = execution.passed and ast.is_valid_syntax
        status = "PASS" if passed else "FAIL"
        failure_reason = self.classify_failure_reason(case, ast, execution, error_message)

        return CaseEvalResult(
            case_id=case.id,
            db_id=case.db_id,
            domain=case.domain,
            is_safe=case.is_safe,
            status=status,
            failure_reason=failure_reason,
            composite_score=round(composite, 4),
            latency_ms=latency_ms,
            retrieval_score=retrieval,
            tool_score=tool,
            ast_score=ast,
            execution_score=execution,
            generated_sql=generated_sql,
            error_message=error_message,
        )
