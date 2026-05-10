"""
tools/find_tables.py
─────────────────────
LLM-callable tool: semantic table search.
Always called first in the tool-calling loop.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from model.facade import ModelFacade

# ── OpenAI-compatible tool schema ─────────────────────────────────────────────
SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "find_relevant_tables",
        "description": (
            "Semantic similarity search to find the most relevant database tables "
            "for a natural language query. Always call this first before get_table_schema."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The natural language query or description of what data you need",
                },
                "top_k": {
                    "type": "integer",
                    "description": "Number of tables to return (default 5, max 10)",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
}


async def find_relevant_tables(
    query: str,
    top_k: int = 5,
    *,
    model: "ModelFacade",
) -> list[dict[str, Any]]:
    """
    Returns the top_k most semantically similar tables for the query.
    Result: [{"qualified_name": ..., "description": ..., "score": ..., "domain_tags": [...]}]
    """
    top_k = min(max(top_k, 1), 10)
    return await model.find_tables(query, top_k=top_k)
