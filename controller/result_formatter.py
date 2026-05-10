"""
controller/result_formatter.py
────────────────────────────────
Formats raw DB rows into the structured QueryResponse.
"""
from __future__ import annotations

from typing import Any

from controller.intent_parser import Intent
from controller.tool_orchestrator import SchemaContext


class ResultFormatter:
    """Shapes raw DB rows into a QueryResponse-compatible dict."""

    def format(
        self,
        sql: str,
        rows: list[dict[str, Any]],
        context: SchemaContext,
        intent: Intent,
        latency_ms: float = 0.0,
    ) -> dict[str, Any]:
        columns = list(rows[0].keys()) if rows else []

        return {
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
        }

    def format_error(
        self,
        error: Exception,
        sql: str | None = None,
        intent: Intent | None = None,
        context: SchemaContext | None = None,
        latency_ms: float = 0.0,
    ) -> dict[str, Any]:
        trace: dict[str, Any] = {"intent": intent.to_dict() if intent else {}}
        if context:
            trace.update({
                "tool_calls": context.tool_trace,
                "rounds_used": context.rounds_used,
                "tables_used": [t["qualified_name"] for t in context.tables_found],
            })

        return {
            "sql": sql or "",
            "rows": [],
            "columns": [],
            "row_count": 0,
            "latency_ms": round(latency_ms, 2),
            "trace": trace,
            "error": str(error),
        }
