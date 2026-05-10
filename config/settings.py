"""
config/settings.py
──────────────────
Pydantic BaseSettings — all configuration loaded from environment variables
or a .env file. Single source of truth for the entire engine.
"""
from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = Field(
        default="sqlite+aiosqlite:///./nl2sql_dev.db",
        description="SQLAlchemy async URL for the target database",
    )
    log_db_url: str = Field(
        default="sqlite+aiosqlite:///./nl2sql_log.db",
        description="SQLAlchemy async URL for the query log store",
    )

    # ── Ollama / LLM ──────────────────────────────────────────────────────────
    ollama_base_url: str = Field(
        default="http://localhost:11434/v1",
        description="Ollama OpenAI-compatible API base URL",
    )
    ollama_model: str = Field(
        default="qwen2.5:7b",
        description="Ollama model name for SQL generation and tool-calling",
    )
    ollama_embed_model: str = Field(
        default="nomic-embed-text",
        description="Ollama model name for generating embeddings",
    )

    # ── Security ──────────────────────────────────────────────────────────────
    api_key: str = Field(
        default="dev-insecure-key",
        description="API key required in X-API-Key header",
    )

    # ── App behaviour ─────────────────────────────────────────────────────────
    app_env: str = Field(default="development")
    log_level: str = Field(default="INFO")
    max_rows: int = Field(default=500, description="Max rows returned per query")
    max_tool_rounds: int = Field(default=5, description="Max LLM tool-calling iterations")
    rate_limit: int = Field(default=60, description="Requests per minute per IP")

    # ── ChromaDB vector store ─────────────────────────────────────────────────
    chroma_persist_dir: str = Field(
        default="./.chroma_nl2sql",
        description="Persistence directory for ChromaDB",
    )
    chroma_collection: str = Field(
        default="nl2sql_tables",
        description="ChromaDB collection name for table embeddings",
    )

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


# ── Module-level singleton ────────────────────────────────────────────────────
_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
