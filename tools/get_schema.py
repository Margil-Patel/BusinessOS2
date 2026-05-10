"""
tools/get_schema.py
────────────────────
LLM-callable tool: column + type lookup for specific tables.
Called after find_relevant_tables to get full column details.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from model.facade import ModelFacade

SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_table_schema",
        "description": (
            "Returns column names, data types, nullability, PK/FK flags, and "
            "business descriptions for each requested table. Call after find_relevant_tables."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "table_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "List of table names to get schema for. "
                        "Use qualified names (schema.table) when available."
                    ),
                }
            },
            "required": ["table_names"],
        },
    },
}


async def get_table_schema(
    table_names: list[str],
    *,
    model: "ModelFacade",
) -> dict[str, Any]:
    """
    Returns: {
      "schema.table": {
        "columns": [{"name": ..., "type": ..., "is_pk": ..., "description": ...}],
        "description": ...
      }
    }
    """
    return await model.get_schema(table_names)
