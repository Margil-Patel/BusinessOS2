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

    # ── Full rows for expandable column view ──────────────────────────────────
    full_rows: list[dict[str, Any]] = Field(default_factory=list, description="Full result rows with all columns")
    full_columns: list[str] = Field(default_factory=list, description="Full column names")

    # ── Agentic loop metadata ─────────────────────────────────────────────────
    confidence: float = Field(
        default=0.0,
        description="Loop confidence score (0.0–1.0). Lower = more retries / corrections needed.",
    )
    iterations_used: int = Field(
        default=1,
        description="Number of agentic loop iterations consumed",
    )
    loop_errors: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Errors encountered during the loop (validation, runtime, etc.)",
    )

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
            confidence=d.get("confidence", 0.0),
            iterations_used=d.get("iterations_used", 1),
            loop_errors=d.get("loop_errors", []),
            full_rows=d.get("full_rows", []),
            full_columns=d.get("full_columns", []),
        )


class HealthResponse(BaseModel):
    status: str
    model: str
    db_connected: bool
    tables_loaded: int
    version: str = "1.0.0"


class SchemaOperationResponse(BaseModel):
    success: bool
    message: str
    data: dict[str, Any] | None = None


class ForeignKeyDependency(BaseModel):
    table: str
    column: str
    referenced_column: str
    constraint: str


class DeletionSafetyResponse(BaseModel):
    success: bool
    safe: bool
    has_data: bool
    row_count: int
    dependent_fks: list[ForeignKeyDependency] = Field(default_factory=list)
    indexes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SchemaVersionEntry(BaseModel):
    id: int
    fqn: str
    version: int
    created_at: str
    author: str
    ddl: str
    snapshot: list[dict[str, Any]]
    summary: str


class SchemaVersionsListResponse(BaseModel):
    success: bool
    versions: list[SchemaVersionEntry]


class ProposedColumn(BaseModel):
    name: str
    type: str
    nullable: bool
    is_primary_key: bool
    is_unique: bool
    default_value: str
    check_constraint: str
    foreign_key_table: str
    foreign_key_column: str
    has_index: bool


class AISchemaProposalResponse(BaseModel):
    success: bool
    fqn: str
    columns: list[ProposedColumn]


# ── Dynamic Data Management ───────────────────────────────────────────────────

class ColumnMeta(BaseModel):
    """Metadata for a single column returned by GET /data/schema/{fqn}."""
    name: str
    data_type: str
    nullable: bool
    default_value: str | None = None
    is_primary_key: bool = False
    is_unique: bool = False
    foreign_key_table: str | None = None
    foreign_key_column: str | None = None


class TableSchemaResponse(BaseModel):
    """Response for GET /data/schema/{fqn}."""
    success: bool
    fqn: str
    columns: list[ColumnMeta]


class TableRowsResponse(BaseModel):
    """Response for GET /data/{fqn}/rows."""
    success: bool
    fqn: str
    rows: list[dict[str, Any]] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)
    row_count: int
    page: int
    page_size: int
    total_count: int


class BulkInsertResponse(BaseModel):
    """Response for POST /data/{fqn}/bulk_insert."""
    success: bool
    inserted_count: int
    message: str


class BulkUpdateResponse(BaseModel):
    """Response for PUT /data/{fqn}/bulk_update."""
    success: bool
    updated_count: int
    message: str


class BulkDeleteResponse(BaseModel):
    """Response for DELETE /data/{fqn}/rows."""
    success: bool
    deleted_count: int
    message: str
