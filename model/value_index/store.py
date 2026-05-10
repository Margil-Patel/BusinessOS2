"""
model/value_index/store.py
───────────────────────────
Distinct-value cache per column. Used by get_sample_values tool
to resolve enum mismatches in WHERE clauses.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import diskcache

if TYPE_CHECKING:
    from model.db.connector import DatabaseConnector

logger = logging.getLogger(__name__)

_CACHE_DIR = "./.nl2sql_value_cache"
_CACHE_TTL = 3600  # 1 hour


class ValueStore:
    """
    Fetches and caches distinct column values from the target database.
    Uses diskcache for persistence across process restarts.
    """

    def __init__(self, connector: "DatabaseConnector") -> None:
        self._connector = connector
        self._cache = diskcache.Cache(_CACHE_DIR)

    async def get(self, table: str, column: str, limit: int = 20) -> list[str]:
        """
        Return up to `limit` distinct values for table.column.
        Results are cached for 1 hour to avoid repeated DB round-trips.
        """
        cache_key = f"{table}::{column}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            logger.debug("ValueStore cache hit: %s", cache_key)
            return cached  # type: ignore[return-value]

        logger.debug("ValueStore fetching distinct values for %s.%s", table, column)
        values = await self._connector.fetch_distinct(table, column, limit=limit)
        self._cache.set(cache_key, values, expire=_CACHE_TTL)
        return values

    def invalidate(self, table: str, column: str | None = None) -> None:
        if column:
            self._cache.delete(f"{table}::{column}")
        else:
            # Invalidate all columns for this table
            for key in list(self._cache.iterkeys()):
                if str(key).startswith(f"{table}::"):
                    self._cache.delete(key)

    def clear_all(self) -> None:
        self._cache.clear()
