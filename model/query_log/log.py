"""
model/query_log/log.py
───────────────────────
Persistent store for (nl_query, sql, success, latency_ms) query history.
Used for few-shot retrieval — improves accuracy on repeated patterns.
Backed by SQLite via aiosqlite.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

import aiosqlite

logger = logging.getLogger(__name__)

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS query_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nl_query    TEXT NOT NULL,
    sql_query   TEXT NOT NULL,
    success     INTEGER NOT NULL DEFAULT 1,
    latency_ms  REAL,
    error_msg   TEXT,
    db_id       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
)
"""

_CREATE_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_query_log_created ON query_log (created_at DESC)
"""


@dataclass
class QueryLogEntry:
    nl_query: str
    sql_query: str
    success: bool = True
    latency_ms: float | None = None
    error_msg: str | None = None
    db_id: str | None = None
    id: int | None = None
    created_at: str | None = None
    similarity: float = field(default=0.0, compare=False)

    def to_dict(self) -> dict[str, Any]:
        return {
            "nl_query": self.nl_query,
            "sql_query": self.sql_query,
            "success": self.success,
            "similarity": round(self.similarity, 4),
        }


class QueryLog:
    """
    SQLite-backed log of all past (NL, SQL) pairs.
    Supports few-shot retrieval via simple TF-IDF-like keyword matching
    (no vector search needed — query log is typically small).
    """

    def __init__(self, db_path: str = "./nl2sql_log.db") -> None:
        # Strip async scheme for aiosqlite
        self._db_path = db_path.replace("sqlite+aiosqlite:///", "").replace("sqlite:///", "")
        self._ready = False

    async def _ensure_ready(self) -> None:
        if self._ready:
            return
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(_CREATE_TABLE_SQL)
            await db.execute(_CREATE_INDEX_SQL)
            await db.commit()
        self._ready = True

    async def add(self, entry: QueryLogEntry) -> None:
        await self._ensure_ready()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                """INSERT INTO query_log (nl_query, sql_query, success, latency_ms, error_msg, db_id)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    entry.nl_query,
                    entry.sql_query,
                    1 if entry.success else 0,
                    entry.latency_ms,
                    entry.error_msg,
                    entry.db_id,
                ),
            )
            await db.commit()

    async def get_similar(self, query: str, top_k: int = 3) -> list[QueryLogEntry]:
        """
        Retrieve the most similar past queries using keyword overlap scoring.
        Simple but effective for few-shot retrieval in small query logs.
        """
        await self._ensure_ready()
        query_tokens = set(query.lower().split())

        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM query_log WHERE success = 1 ORDER BY created_at DESC LIMIT 200"
            ) as cursor:
                rows = await cursor.fetchall()

        scored: list[QueryLogEntry] = []
        for row in rows:
            row_tokens = set(row["nl_query"].lower().split())
            if not row_tokens:
                continue
            intersection = query_tokens & row_tokens
            union = query_tokens | row_tokens
            jaccard = len(intersection) / len(union) if union else 0.0
            if jaccard > 0:
                entry = QueryLogEntry(
                    id=row["id"],
                    nl_query=row["nl_query"],
                    sql_query=row["sql_query"],
                    success=bool(row["success"]),
                    latency_ms=row["latency_ms"],
                    db_id=row["db_id"],
                    created_at=row["created_at"],
                    similarity=jaccard,
                )
                scored.append(entry)

        scored.sort(key=lambda e: e.similarity, reverse=True)
        return scored[:top_k]

    async def recent(self, limit: int = 10) -> list[dict[str, Any]]:
        await self._ensure_ready()
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM query_log ORDER BY created_at DESC LIMIT ?", (limit,)
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]
