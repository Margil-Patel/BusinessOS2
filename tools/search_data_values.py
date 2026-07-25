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
            "Search for a keyword across all string columns of the database. "
            "Use this when the user mentions a specific value (like a name, category, or type) "
            "but you don't know which column or table it belongs to, or what the exact casing/spelling is."
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
                    "description": "Optional list of table names to search in. If not provided, scans all registered tables in the database.",
                },
            },
            "required": ["keyword"],
        },
    },
}


async def search_data_values(
    keyword: str,
    tables: list[str] | None = None,
    *,
    model: "ModelFacade",
) -> list[dict[str, Any]]:
    """
    Returns: [{"table": "...", "column": "...", "matched_value": "..."}]
    """
    if not tables:
        tables = [t.qualified_name for t in model.registry.all_tables()]
    return await model.search_data_values(keyword, tables)
