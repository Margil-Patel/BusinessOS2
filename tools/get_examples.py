"""
tools/get_examples.py
──────────────────────
LLM-callable tool: few-shot example retrieval from the query log.
Dramatically improves accuracy on repeated query patterns.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from model.facade import ModelFacade

SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_query_examples",
        "description": (
            "Retrieves the most similar past (NL query, SQL) pairs from the query history. "
            "Use these as few-shot examples to improve SQL generation accuracy. "
            "Call this for complex or ambiguous queries."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The current natural language query",
                },
                "top_k": {
                    "type": "integer",
                    "description": "Number of examples to retrieve (default 3)",
                    "default": 3,
                },
            },
            "required": ["query"],
        },
    },
}


async def get_query_examples(
    query: str,
    top_k: int = 3,
    *,
    model: "ModelFacade",
) -> list[dict[str, Any]]:
    """
    Returns: [
      {"nl_query": "...", "sql_query": "SELECT ...", "success": true}
    ]
    """
    return await model.get_examples(query, top_k=top_k)
