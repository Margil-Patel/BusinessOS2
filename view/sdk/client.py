"""
view/sdk/client.py
───────────────────
Python SDK client. Wraps the REST API for programmatic use.

Usage:
    from view.sdk.client import NL2SQLClient

    async with NL2SQLClient("http://localhost:8000", api_key="your-key") as client:
        result = await client.query("Show all orders from last week")
        print(result.sql)
        print(result.rows)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import httpx


@dataclass
class QueryResult:
    sql: str
    rows: list[dict[str, Any]]
    columns: list[str]
    row_count: int
    latency_ms: float
    error: str | None
    trace: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "QueryResult":
        return cls(
            sql=d.get("sql", ""),
            rows=d.get("rows", []),
            columns=d.get("columns", []),
            row_count=d.get("row_count", 0),
            latency_ms=d.get("latency_ms", 0.0),
            error=d.get("error"),
            trace=d.get("trace", {}),
        )


class NL2SQLClient:
    """
    Async Python SDK for the NL2SQL REST API.

    Example:
        client = NL2SQLClient("http://localhost:8000", api_key="secret")
        result = await client.query("Top 10 customers by revenue")
        if not result.error:
            print(result.sql)
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        api_key: str = "dev-insecure-key",
        timeout: float = 120.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = {"X-API-Key": api_key, "Content-Type": "application/json"}
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "NL2SQLClient":
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers=self._headers,
            timeout=self._timeout,
        )
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._client:
            await self._client.aclose()

    async def query(self, nl_query: str, db_id: str = "default") -> QueryResult:
        """Execute a natural language query and return results."""
        resp = await self._http_client.post(
            "/query",
            json={"nl_query": nl_query, "db_id": db_id},
        )
        resp.raise_for_status()
        return QueryResult.from_dict(resp.json())

    async def explain(self, nl_query: str, db_id: str = "default") -> dict[str, Any]:
        """Generate SQL without executing. Returns sql + trace."""
        resp = await self._http_client.post(
            "/explain",
            json={"nl_query": nl_query, "db_id": db_id},
        )
        resp.raise_for_status()
        return resp.json()

    async def health(self) -> dict[str, Any]:
        resp = await self._http_client.get("/health")
        resp.raise_for_status()
        return resp.json()

    async def list_tables(self) -> list[dict[str, Any]]:
        resp = await self._http_client.get("/tables")
        resp.raise_for_status()
        return resp.json()

    @property
    def _http_client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("Use 'async with NL2SQLClient(...) as client'")
        return self._client
