"""
view/schemas/response.py
─────────────────────────
Pydantic v2 response models for the REST API.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ToolCallTrace(BaseModel):
    round: int
    tool: str
    args: dict[str, Any]
    result_summary: str


class QueryTrace(BaseModel):
    intent: dict[str, Any] = Field(default_factory=dict)
    tool_calls: list[ToolCallTrace] = Field(default_factory=list)
    rounds_used: int = 0
    tables_used: list[str] = Field(default_factory=list)


class QueryResponse(BaseModel):
    sql: str = Field(default="", description="Generated SQL query")
    rows: list[dict[str, Any]] = Field(default_factory=list, description="Result rows")
    columns: list[str] = Field(default_factory=list, description="Column names")
    row_count: int = Field(default=0)
    latency_ms: float = Field(default=0.0)
    trace: QueryTrace = Field(default_factory=QueryTrace)
    error: str | None = Field(default=None, description="Error message if query failed")

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "QueryResponse":
        trace_data = d.get("trace", {})
        tool_calls = [ToolCallTrace(**tc) for tc in trace_data.get("tool_calls", [])]
        trace = QueryTrace(
            intent=trace_data.get("intent", {}),
            tool_calls=tool_calls,
            rounds_used=trace_data.get("rounds_used", 0),
            tables_used=trace_data.get("tables_used", []),
        )
        return cls(
            sql=d.get("sql", ""),
            rows=d.get("rows", []),
            columns=d.get("columns", []),
            row_count=d.get("row_count", 0),
            latency_ms=d.get("latency_ms", 0.0),
            trace=trace,
            error=d.get("error"),
        )


class HealthResponse(BaseModel):
    status: str
    model: str
    db_connected: bool
    tables_loaded: int
    version: str = "1.0.0"
