"""
controller/sql_validator.py
────────────────────────────
SQL safety gate. Runs before every db.execute().
Blocks destructive statements and runs EXPLAIN dry-run.
"""
from __future__ import annotations

import re
from typing import Any

import sqlparse
from sqlparse.sql import Statement
from sqlparse.tokens import Keyword, DDL, DML


class SQLValidationError(Exception):
    """Raised when SQL fails syntax or safety validation."""


class UnsafeQueryError(SQLValidationError):
    """Raised when SQL contains a disallowed destructive statement."""


# Blocked statement types — no bypass, no flags
_BLOCKED_KEYWORDS = frozenset({
    "DROP", "DELETE", "TRUNCATE", "UPDATE", "INSERT", "ALTER",
    "CREATE", "REPLACE", "MERGE", "GRANT", "REVOKE", "EXEC", "EXECUTE",
})

_INJECTION_PATTERNS = [
    re.compile(r";\s*(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT|ALTER)", re.IGNORECASE),
    re.compile(r"--\s*(?:DROP|DELETE)", re.IGNORECASE),
    re.compile(r"/\*.*(?:DROP|DELETE).*\*/", re.IGNORECASE | re.DOTALL),
]


class SQLValidator:
    """
    Two-stage validator:
    1. Static analysis — block dangerous keywords, check syntax
    2. EXPLAIN dry-run — catches column/table errors before execution
    """

    def check(self, sql: str, db_id: str = "default") -> None:
        """
        Raises SQLValidationError or UnsafeQueryError if the SQL is invalid.
        Silent return = safe to execute.
        """
        if not sql or not sql.strip():
            raise SQLValidationError("SQL query is empty")

        self._check_injection(sql)
        self._check_keywords(sql)
        self._check_syntax(sql)

    def _check_injection(self, sql: str) -> None:
        for pattern in _INJECTION_PATTERNS:
            if pattern.search(sql):
                raise UnsafeQueryError(f"Potential SQL injection detected: {sql[:100]}")

    def _check_keywords(self, sql: str) -> None:
        parsed = sqlparse.parse(sql)
        if not parsed:
            raise SQLValidationError("Could not parse SQL")

        for statement in parsed:
            for token in statement.flatten():
                if token.ttype in (DDL, DML, Keyword):
                    value = token.value.upper()
                    if value in _BLOCKED_KEYWORDS:
                        raise UnsafeQueryError(
                            f"Statement type '{value}' is not allowed. "
                            f"Only SELECT queries are permitted."
                        )

    def _check_syntax(self, sql: str) -> None:
        """Basic structural check — must start with SELECT (or WITH for CTEs)."""
        clean = sql.strip().lstrip("(").upper()
        if not (clean.startswith("SELECT") or clean.startswith("WITH")):
            raise SQLValidationError(
                f"Query must start with SELECT or WITH. Got: {sql[:50]!r}"
            )

    async def explain(self, sql: str, db: Any) -> None:
        """
        Run EXPLAIN against the DB. Call this after check() for full validation.
        Import db lazily to avoid circular dependency.
        """
        from model.db.connector import DatabaseConnector
        assert isinstance(db, DatabaseConnector)
        await db.execute_explain(sql)
