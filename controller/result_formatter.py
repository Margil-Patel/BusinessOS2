"""
controller/result_formatter.py
────────────────────────────────
Formats raw DB rows into the structured QueryResponse-compatible dict.
Updated to accept an optional LoopState so agentic-loop metadata
(confidence, iterations_used, loop_errors) flows into the API response.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from controller.intent_parser import Intent
from controller.tool_orchestrator import SchemaContext

if TYPE_CHECKING:
    from controller.loop_state import LoopState


class ResultFormatter:
    """Shapes raw DB rows + loop state into a QueryResponse-compatible dict."""

    def format(
        self,
        sql: str,
        rows: list[dict[str, Any]],
        context: SchemaContext,
        intent: Intent,
        latency_ms: float = 0.0,
        state: "LoopState | None" = None,
        full_rows: list[dict[str, Any]] | None = None,
        full_columns: list[str] | None = None,
    ) -> dict[str, Any]:
        columns = list(rows[0].keys()) if rows else []

        result: dict[str, Any] = {
            "sql": sql,
            "rows": rows,
            "columns": columns,
            "row_count": len(rows),
            "latency_ms": round(latency_ms, 2),
            "trace": {
                "intent": intent.to_dict(),
                "tool_calls": context.tool_trace,
                "rounds_used": context.rounds_used,
                "tables_used": [t["qualified_name"] for t in context.tables_found],
            },
            "error": None,
            "full_rows": full_rows if full_rows is not None else rows,
            "full_columns": full_columns if full_columns is not None else columns,
        }

        # ── Agentic loop metadata (populated when AgenticLoop is used) ─────────
        if state is not None:
            result["confidence"] = state.confidence
            result["iterations_used"] = state.iteration
            result["loop_errors"] = state.errors
        else:
            result["confidence"] = 1.0   # legacy path — assume first-try success
            result["iterations_used"] = 1
            result["loop_errors"] = []

        return result

    def format_from_state(
        self,
        state: "LoopState",
        context: SchemaContext,
        intent: Intent,
        latency_ms: float = 0.0,
        full_rows: list[dict[str, Any]] | None = None,
        full_columns: list[str] | None = None,
    ) -> dict[str, Any]:
        """
        Convenience wrapper for AgenticLoop — builds the full response
        directly from a completed LoopState.
        """
        return self.format(
            sql=state.final_sql or "",
            rows=state.rows,
            context=context,
            intent=intent,
            latency_ms=latency_ms,
            state=state,
            full_rows=full_rows,
            full_columns=full_columns,
        )

    def format_error(
        self,
        error: Exception,
        sql: str | None = None,
        intent: Intent | None = None,
        context: SchemaContext | None = None,
        latency_ms: float = 0.0,
        state: "LoopState | None" = None,
    ) -> dict[str, Any]:
        trace: dict[str, Any] = {"intent": intent.to_dict() if intent else {}}
        if context:
            trace.update(
                {
                    "tool_calls": context.tool_trace,
                    "rounds_used": context.rounds_used,
                    "tables_used": [t["qualified_name"] for t in context.tables_found],
                }
            )

        result: dict[str, Any] = {
            "sql": sql or "",
            "rows": [],
            "columns": [],
            "row_count": 0,
            "latency_ms": round(latency_ms, 2),
            "trace": trace,
            "error": str(error),
            "confidence": 0.0,
            "iterations_used": state.iteration if state else 1,
            "loop_errors": state.errors if state else [],
        }
        return result
