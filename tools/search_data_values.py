"""
tools/search_data_values.py
────────────────────────────
LLM-callable tool: search for a keyword across all string columns of relevant tables.
Helps resolve unknown values or filter logic.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from model.facade import ModelFacade

SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "search_data_values",
        "description": (
            "Search for a keyword across all string columns of the given tables. "
            "Use this when the user mentions a specific value (like a name, category, or type) "
            "but you don't know which column it belongs to or what the exact casing/spelling is."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "keyword": {
                    "type": "string",
                    "description": "The search term (e.g. 'glossy', 'john', 'electronics')",
                },
                "tables": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of table names to search in.",
                },
            },
            "required": ["keyword", "tables"],
        },
    },
}


async def search_data_values(
    keyword: str,
    tables: list[str],
    *,
    model: "ModelFacade",
) -> list[dict[str, Any]]:
    """
    Returns: [{"table": "...", "column": "...", "matched_value": "..."}]
    """
    return await model.search_data_values(keyword, tables)
