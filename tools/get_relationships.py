"""
tools/get_relationships.py
───────────────────────────
LLM-callable tool: FK edges and join paths between tables.
Critical for multi-table queries.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from model.facade import ModelFacade

SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_table_relationships",
        "description": (
            "Returns FK edges, join keys, cardinality, and shortest join paths "
            "between the specified tables. Critical for multi-table JOIN queries."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "table_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Tables to find relationships between",
                }
            },
            "required": ["table_names"],
        },
    },
}


async def get_table_relationships(
    table_names: list[str],
    *,
    model: "ModelFacade",
) -> dict[str, Any]:
    """
    Returns: {
      "relationships": [{"from": ..., "to": ..., "join": "t1.col = t2.col"}],
      "join_paths": [{"tables": [...], "joins": [...], "hop_count": 1}]
    }
    """
    return await model.get_relationships(table_names)
