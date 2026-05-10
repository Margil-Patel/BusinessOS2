"""
tools/validate_sql.py
──────────────────────
LLM-callable tool: SQL dry-run validation.
Runs EXPLAIN before any real execution. Always called before db.execute().
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from model.facade import ModelFacade

SCHEMA: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "validate_sql",
        "description": (
            "Dry-runs a SQL query using EXPLAIN to check for syntax errors, "
            "unknown column names, or permission issues — without executing it. "
            "Always call this before final SQL execution."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "The SQL query to validate",
                },
                "db_id": {
                    "type": "string",
                    "description": "Database identifier (use 'default' if unsure)",
                    "default": "default",
                },
            },
            "required": ["sql"],
        },
    },
}


async def validate_sql(
    sql: str,
    db_id: str = "default",
    *,
    model: "ModelFacade",
) -> dict[str, Any]:
    """
    Returns: {"valid": true, "error": null}
          or {"valid": false, "error": "column 'foo' does not exist"}
    """
    try:
        await model.db.execute_explain(sql)
        return {"valid": True, "error": None}
    except Exception as exc:
        return {"valid": False, "error": str(exc)}
