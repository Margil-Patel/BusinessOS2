"""
model/facade.py
────────────────
ModelFacade — single interface for the controller layer.
The controller imports ONLY this class. Never individual model components.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from model.db.connector import DatabaseConnector
from model.embeddings.encoder import EmbeddingEncoder
from model.embeddings.index import EmbeddingIndex, TableMatch
from model.query_log.log import QueryLog, QueryLogEntry
from model.registry.loader import SchemaLoader
from model.registry.table_registry import TableRegistry
from model.relationships.graph import RelationshipGraph
from model.value_index.store import ValueStore

if TYPE_CHECKING:
    from config.settings import Settings

logger = logging.getLogger(__name__)


class ModelFacade:
    """
    The single interface between the controller and all model components.

    Architecture rule: The controller imports ONLY ModelFacade.
    This is the seam that allows swapping storage backends without
    touching controller logic.
    """

    def __init__(self, settings: "Settings") -> None:
        self._settings = settings

        # Core components
        self.db = DatabaseConnector(settings.database_url)
        self.registry = TableRegistry()
        self.graph = RelationshipGraph()
        self.encoder = EmbeddingEncoder(settings)
        self.embeddings = EmbeddingIndex(settings, self.encoder)
        self.value_index = ValueStore(self.db)
        self.query_log = QueryLog(settings.log_db_url)

        self._loader = SchemaLoader(self.db, self.registry)
        self._synced = False

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def startup(self) -> None:
        """Initialise the DB connection. Call this on app startup."""
        await self.db.connect()
        logger.info("ModelFacade started up")

    async def shutdown(self) -> None:
        """Close resources. Call this on app shutdown."""
        await self.db.disconnect()
        logger.info("ModelFacade shut down")

    async def sync_schema(self) -> int:
        """
        Introspect the DB and rebuild the registry, graph, and embedding index.
        Idempotent — safe to call on every startup.
        """
        count = await self._loader.sync()

        # Rebuild FK graph
        tables = self.registry.all_tables()
        self.graph.load_from_registry(tables)

        # Rebuild embedding index
        await self.embeddings.build(tables)

        self._synced = True
        logger.info("ModelFacade sync complete: %d tables", count)
        return count

    # ── Tool-callable methods (called by controller tools) ────────────────────

    async def find_tables(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        """Semantic search — returns top_k table matches."""
        if not self._synced:
            logger.warning("find_tables called before sync — results may be empty")
        matches: list[TableMatch] = await self.embeddings.search(query, top_k=top_k)
        if not matches and self.registry:
            all_tbls = self.registry.all_tables()
            return [
                {
                    "qualified_name": t.qualified_name,
                    "description": t.description,
                    "score": 0.5,
                    "domain_tags": t.domain_tags,
                    "column_names": [c.name for c in t.columns],
                }
                for t in all_tbls[:top_k]
            ]
        return [
            {
                "qualified_name": m.qualified_name,
                "description": m.description,
                "score": m.score,
                "domain_tags": m.domain_tags,
                "column_names": m.column_names,
            }
            for m in matches
        ]

    async def get_schema(self, table_names: list[str]) -> dict[str, Any]:
        """Return column definitions for the given tables."""
        return self.registry.get_columns(table_names)

    async def get_relationships(self, table_names: list[str]) -> dict[str, Any]:
        """Return FK edges and join paths between the given tables."""
        return self.graph.get_paths(table_names)

    async def get_sample_values(self, table: str, column: str) -> list[str]:
        """Return up to 20 distinct values for a column."""
        return await self.value_index.get(table, column)

    async def search_data_values(self, keyword: str, table_names: list[str]) -> list[dict[str, Any]]:
        """Search for a keyword across all columns of the given tables."""
        return await self.db.search_all_columns(keyword, table_names)

    async def get_examples(self, query: str, top_k: int = 3) -> list[dict[str, Any]]:
        """Return similar past (NL, SQL) pairs for few-shot prompting."""
        examples = await self.query_log.get_similar(query, top_k=top_k)
        return [e.to_dict() for e in examples]

    async def log_query(self, entry: "QueryLogEntry") -> None:
        await self.query_log.add(entry)
