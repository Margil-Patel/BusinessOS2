"""
tools/get_sample_values.py
───────────────────────────
LLM-callable tool: distinct column values for enum resolution.
Resolves "completed" vs "COMPLETED" mismatches in WHERE clauses.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from model.facade import ModelFacade

SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_sample_values",
        "description": (
            "Returns up to 20 distinct values for a column. "
            "Use this for status/enum columns to get the exact casing/spelling used in the DB. "
            "Essential for accurate WHERE clause filters."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "table": {
                    "type": "string",
                    "description": "Table name (qualified or unqualified)",
                },
                "column": {
                    "type": "string",
                    "description": "Column name to get distinct values for",
                },
            },
            "required": ["table", "column"],
        },
    },
}


async def get_sample_values(
    table: str,
    column: str,
    *,
    model: "ModelFacade",
) -> list[str]:
    """
    Returns: ["COMPLETED", "PENDING", "CANCELLED", ...]
    """
    return await model.get_sample_values(table, column)
