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
    db_id: str = Field(default="default", description="Target database identifier")
    options: QueryOptions = Field(default_factory=QueryOptions)

    model_config = {"json_schema_extra": {"example": {"nl_query": "Show all orders placed today"}}}
