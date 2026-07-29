"""
view/schemas/request.py
────────────────────────
Pydantic v2 request models for the REST API.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class QueryOptions(BaseModel):
    max_rows: int = Field(default=500, ge=1, le=10000)
    explain_only: bool = Field(default=False, description="Return SQL + trace without executing")
    db_id: str = Field(default="default", description="Target database identifier")


class QueryRequest(BaseModel):
    nl_query: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description="Natural language question to convert to SQL",
        examples=["Show me the top 10 customers by total orders this month"],
    )
    history: list[dict[str, str]] = Field(
        default_factory=list,
        description="Optional list of previous messages in the conversation for context",
    )
    db_id: str = Field(default="default", description="Target database identifier")
    options: QueryOptions = Field(default_factory=QueryOptions)

    model_config = {"json_schema_extra": {"example": {"nl_query": "Show all orders placed today"}}}


class ColumnDefinition(BaseModel):
    name: str = Field(..., min_length=1, max_length=63)
    type: str = Field(..., min_length=1, max_length=63)
    nullable: bool = Field(default=True)
    is_primary_key: bool = Field(default=False)
    is_unique: bool = Field(default=False)
    default_value: str | None = Field(default=None, max_length=128)
    check_constraint: str | None = Field(default=None, max_length=255)
    foreign_key_table: str | None = Field(default=None, max_length=128)
    foreign_key_column: str | None = Field(default=None, max_length=63)
    has_index: bool = Field(default=False)


class CreateTableRequest(BaseModel):
    fqn: str = Field(..., min_length=3, max_length=128)
    columns: list[ColumnDefinition] = Field(..., min_items=1)


class AddColumnRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=63)
    type: str = Field(..., min_length=1, max_length=63)


class RenameColumnRequest(BaseModel):
    new_name: str = Field(..., min_length=1, max_length=63)


class ChangeColumnTypeRequest(BaseModel):
    new_type: str = Field(..., min_length=1, max_length=63)


class ColumnAlterDefinition(BaseModel):
    name: str = Field(..., min_length=1, max_length=63)
    type: str = Field(..., min_length=1, max_length=63)
    nullable: bool = Field(default=True)
    is_primary_key: bool = Field(default=False)
    is_unique: bool = Field(default=False)
    default_value: str | None = Field(default=None, max_length=128)
    original_name: str | None = Field(default=None, max_length=63)
    check_constraint: str | None = Field(default=None, max_length=255)
    foreign_key_table: str | None = Field(default=None, max_length=128)
    foreign_key_column: str | None = Field(default=None, max_length=63)
    has_index: bool = Field(default=False)


class AlterTableRequest(BaseModel):
    columns: list[ColumnAlterDefinition] = Field(..., min_items=1)


class GenerateAISchemaRequest(BaseModel):
    prompt: str = Field(..., min_length=5, max_length=1000)


# ── Dynamic Data Management ───────────────────────────────────────────────────

class BulkInsertRequest(BaseModel):
    """Request body for POST /data/{fqn}/bulk_insert."""
    rows: list[dict] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Array of row objects to insert. Each key must be a valid column name.",
    )


class UpdateRow(BaseModel):
    """A single row update specification."""
    pk_column: str = Field(..., min_length=1, max_length=63, description="Primary key column name")
    pk_value: object = Field(..., description="Primary key value to match in WHERE clause")
    updates: dict = Field(
        ...,
        description="Dict of {column: new_value} pairs to apply in SET clause",
    )


class BulkUpdateRequest(BaseModel):
    """Request body for PUT /data/{fqn}/bulk_update."""
    rows: list[UpdateRow] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Array of update operations, one per row.",
    )


class BulkDeleteRequest(BaseModel):
    """Request body for DELETE /data/{fqn}/rows."""
    pk_column: str = Field(..., min_length=1, max_length=63, description="Primary key column name")
    pk_values: list = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="List of primary key values identifying rows to delete.",
    )
