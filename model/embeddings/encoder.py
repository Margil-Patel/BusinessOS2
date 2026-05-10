"""
model/embeddings/encoder.py
────────────────────────────
Embedding encoder wrapper.
Primary: Ollama embeddings API (nomic-embed-text)
Fallback: sentence-transformers (local)
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx
import numpy as np

if TYPE_CHECKING:
    from config.settings import Settings

logger = logging.getLogger(__name__)


class EmbeddingEncoder:
    """
    Generates dense vector embeddings for text.
    Tries Ollama first; falls back to sentence-transformers if unavailable.
    """

    def __init__(self, settings: "Settings") -> None:
        self._ollama_url = settings.ollama_base_url.replace("/v1", "")
        self._ollama_model = settings.ollama_embed_model
        self._st_model = None
        self._use_ollama: bool | None = None

    async def encode(self, texts: list[str]) -> list[list[float]]:
        if self._use_ollama is None:
            self._use_ollama = await self._check_ollama()
            logger.info("Embedding backend: %s", "Ollama" if self._use_ollama else "sentence-transformers")
        if self._use_ollama:
            return await self._encode_ollama(texts)
        return self._encode_local(texts)

    async def encode_one(self, text: str) -> list[float]:
        vectors = await self.encode([text])
        return vectors[0]

    async def _check_ollama(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self._ollama_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            logger.info("Ollama not reachable — using local sentence-transformers")
            return False

    async def _encode_ollama(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        async with httpx.AsyncClient(timeout=60.0) as client:
            for text in texts:
                resp = await client.post(
                    f"{self._ollama_url}/api/embeddings",
                    json={"model": self._ollama_model, "prompt": text},
                )
                resp.raise_for_status()
                vectors.append(resp.json()["embedding"])
        return vectors

    def _encode_local(self, texts: list[str]) -> list[list[float]]:
        if self._st_model is None:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading sentence-transformers: all-MiniLM-L6-v2")
            self._st_model = SentenceTransformer("all-MiniLM-L6-v2")
        return self._st_model.encode(texts, convert_to_numpy=True).tolist()
