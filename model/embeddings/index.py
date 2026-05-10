"""
model/embeddings/index.py
──────────────────────────
ChromaDB-backed semantic search index for table descriptions.
Replaces FAISS for Windows compatibility.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from config.settings import Settings
    from model.embeddings.encoder import EmbeddingEncoder
    from model.registry.table_registry import TableMeta

logger = logging.getLogger(__name__)


@dataclass
class TableMatch:
    qualified_name: str
    description: str
    score: float
    domain_tags: list[str]
    column_names: list[str]


class EmbeddingIndex:
    """
    ChromaDB-backed vector index for semantic table search.

    build(tables)  — embed all table descriptions and upsert into ChromaDB
    search(query)  — return top_k most semantically similar tables
    """

    def __init__(self, settings: "Settings", encoder: "EmbeddingEncoder") -> None:
        self._settings = settings
        self._encoder = encoder
        self._collection = None
        self._client = None

    def _get_collection(self) -> Any:
        if self._collection is None:
            import chromadb
            self._client = chromadb.PersistentClient(path=self._settings.chroma_persist_dir)
            self._collection = self._client.get_or_create_collection(
                name=self._settings.chroma_collection,
                metadata={"hnsw:space": "cosine"},
            )
            logger.info("ChromaDB collection ready: %s", self._settings.chroma_collection)
        return self._collection

    async def build(self, tables: "list[TableMeta]") -> None:
        """Embed all tables and upsert into the vector store."""
        if not tables:
            return

        col = self._get_collection()
        texts = [t.embedding_text for t in tables]
        ids = [t.qualified_name for t in tables]
        metadatas = [
            {
                "name": t.name,
                "schema": t.schema,
                "description": t.description,
                "tags": ",".join(t.domain_tags),
                "columns": ",".join(c.name for c in t.columns),
            }
            for t in tables
        ]

        embeddings = await self._encoder.encode(texts)
        col.upsert(ids=ids, embeddings=embeddings, documents=texts, metadatas=metadatas)
        logger.info("Embedded %d tables into ChromaDB", len(tables))

    async def search(self, query: str, top_k: int = 5) -> list[TableMatch]:
        """Return the top_k most relevant tables for the query."""
        col = self._get_collection()
        if col.count() == 0:
            logger.warning("EmbeddingIndex is empty — run build() first")
            return []

        query_vec = await self._encoder.encode_one(query)
        results = col.query(
            query_embeddings=[query_vec],
            n_results=min(top_k, col.count()),
            include=["metadatas", "distances", "documents"],
        )

        matches: list[TableMatch] = []
        for i, qname in enumerate(results["ids"][0]):
            meta = results["metadatas"][0][i]
            dist = results["distances"][0][i]
            score = 1.0 - dist  # cosine: distance 0 = identical
            matches.append(
                TableMatch(
                    qualified_name=qname,
                    description=meta.get("description", ""),
                    score=round(score, 4),
                    domain_tags=meta.get("tags", "").split(",") if meta.get("tags") else [],
                    column_names=meta.get("columns", "").split(",") if meta.get("columns") else [],
                )
            )
        return sorted(matches, key=lambda m: m.score, reverse=True)
