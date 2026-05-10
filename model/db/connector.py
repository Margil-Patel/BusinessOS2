"""
model/db/connector.py
─────────────────────
SQLAlchemy async database connector. Single source for all DB I/O.
The Model layer NEVER calls the LLM — only reads/writes data.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

logger = logging.getLogger(__name__)


class DatabaseConnector:
    """
    Wraps an async SQLAlchemy engine.
    Usage:
        db = DatabaseConnector("postgresql+asyncpg://user:pass@host/db")
        rows = await db.execute("SELECT * FROM users LIMIT 10")
    """

    def __init__(self, db_url: str, pool_size: int = 5) -> None:
        self._url = db_url
        self._engine: AsyncEngine | None = None
        self._session_factory: async_sessionmaker[AsyncSession] | None = None
        self._pool_size = pool_size

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def connect(self) -> None:
        """Initialise the async engine and session factory."""
        kwargs: dict[str, Any] = {"echo": False, "future": True}
        if not self._url.startswith("sqlite"):
            kwargs.update(pool_size=self._pool_size, max_overflow=10)

        self._engine = create_async_engine(self._url, **kwargs)
        self._session_factory = async_sessionmaker(
            self._engine, expire_on_commit=False, class_=AsyncSession
        )
        logger.info("DatabaseConnector connected: %s", self._url.split("@")[-1])

    async def disconnect(self) -> None:
        if self._engine:
            await self._engine.dispose()
            self._engine = None
            logger.info("DatabaseConnector disconnected")

    @asynccontextmanager
    async def session(self) -> AsyncGenerator[AsyncSession, None]:
        if not self._session_factory:
            await self.connect()
        async with self._session_factory() as sess:  # type: ignore[misc]
            try:
                yield sess
            except Exception:
                await sess.rollback()
                raise

    # ── Query execution ───────────────────────────────────────────────────────

    async def execute(self, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """
        Execute a SQL statement and return rows as a list of dicts.
        Raises RuntimeError on DB error (caller should catch).
        """
        async with self.session() as sess:
            result = await sess.execute(text(sql), params or {})
            if result.returns_rows:
                cols = list(result.keys())
                return [dict(zip(cols, row)) for row in result.fetchall()]
            await sess.commit()
            return []

    async def execute_explain(self, sql: str) -> list[dict[str, Any]]:
        """Dry-run via EXPLAIN — used by SQLValidator."""
        explain_sql = f"EXPLAIN {sql}"
        try:
            return await self.execute(explain_sql)
        except Exception as exc:
            raise ValueError(f"EXPLAIN failed: {exc}") from exc

    async def fetch_distinct(self, table: str, column: str, limit: int = 20) -> list[str]:
        """Fetch distinct values for a column — used by ValueStore."""
        # Schema-qualify if needed (table may be "schema.table")
        sql = f'SELECT DISTINCT "{column}" FROM {table} WHERE "{column}" IS NOT NULL LIMIT {limit}'
        try:
            rows = await self.execute(sql)
            return [str(r[column]) for r in rows]
        except Exception as exc:
            logger.warning("fetch_distinct failed for %s.%s: %s", table, column, exc)
            return []

    async def search_all_columns(self, keyword: str, tables: list[str]) -> list[dict[str, Any]]:
        """
        Search for a keyword across all string-like columns in the given tables.
        Returns: [{"table": ..., "column": ..., "matched_value": ...}]
        """
        results = []
        for table in tables:
            try:
                # 1. Get column names and types for this table
                # We use a simple query to get the schema if we don't have it
                # But here we'll just try to search common string columns or all of them
                # For Postgres, we can use information_schema
                cols_query = f"""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_schema || '.' || table_name = '{table}'
                    OR table_name = '{table}'
                """
                cols = await self.execute(cols_query)
                string_cols = [c['column_name'] for c in cols if 'char' in c['data_type'].lower() or 'text' in c['data_type'].lower()]
                
                for col in string_cols:
                    # Case-insensitive search
                    search_query = f'SELECT DISTINCT "{col}" FROM {table} WHERE "{col}" ILIKE :kw LIMIT 5'
                    matches = await self.execute(search_query, {"kw": f"%{keyword}%"})
                    for m in matches:
                        results.append({
                            "table": table,
                            "column": col,
                            "matched_value": m[col]
                        })
            except Exception as exc:
                logger.warning("Search failed for table %s: %s", table, exc)
        return results

    # ── Introspection ─────────────────────────────────────────────────────────

    async def get_raw_engine(self) -> AsyncEngine:
        if not self._engine:
            await self.connect()
        return self._engine  # type: ignore[return-value]
