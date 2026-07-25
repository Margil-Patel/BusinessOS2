"""
controller/sql_generator.py
────────────────────────────
Builds the SQL generation prompt from intent + schema context,
then calls Ollama (qwen2.5:7b) to generate the SQL query.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml
from openai import AsyncOpenAI

from controller.intent_parser import Intent
from controller.tool_orchestrator import SchemaContext

if TYPE_CHECKING:
    from config.settings import Settings

logger = logging.getLogger(__name__)

_GLOSSARY_PATH = Path(__file__).parents[1] / "config" / "glossary.yaml"

_SYSTEM_PROMPT = """You are an expert SQL query generator.
Your task is to generate a single, precise SQL query based on the user's question and the schema context provided.

RULES (non-negotiable):
1. Only use tables and columns that are explicitly listed in the schema context.
2. Never invent table or column names. However, understand that common nouns like "entries", "rows", "records", "data", "results", "items", "details", "detail", or "information" typically refer to the tables already present in your schema context. Map these terms to the most relevant table in context. For example, if the user asks "show me those entries" and the context contains `tiles_business.tile_inventory`, use `tiles_business.tile_inventory` as the table.
3. Always use the exact schema-qualified table names as provided in the schema context (e.g., if the context says `agri_management.farmers`, use `agri_management.farmers`. Do NOT default to `public` schema unless explicitly stated).
4. Use exact column names as given — do not guess or abbreviate.
5. For status/enum filters, use the exact values from the sample values list. If sample values are provided, use exact casing with '='. If no sample values match exactly, use 'ILIKE' or 'LOWER()' to ensure a case-insensitive match.
6. Use LIMIT {max_rows} unless the query is an aggregation.
7. Write read-only SELECT queries only. Never generate INSERT, UPDATE, DELETE, DROP, or DDL.
8. Return ONLY the SQL query — no explanation, no markdown fences, no commentary.
9. If you cannot generate a safe, accurate query, respond with: ERROR: <reason>
10. MANDATORY: For ALL string comparisons where the user provides a filter value (e.g., names, types, categories), prefer 'ILIKE' over '=' unless you are 100% certain of the casing from the provided SCHEMA CONTEXT.
11. When the user uses pronouns like "that", "those", or "them" (e.g., "show me those"), refer to the entities AND the filters (WHERE clause) used in the previous turn of the conversation. If the previous query filtered for "Glossy" tiles, a follow-up of "show me them" should also include the "Glossy" filter.
12. For PostgreSQL, 'ILIKE' is the preferred way to perform case-insensitive pattern matching.
13. CRITICAL: If the user's question requires querying information or entities (such as "buyers", "customers", "orders", "sales", "transactions", "invoices", etc.) that are not present in the tables or columns of the SCHEMA CONTEXT, you MUST NOT generate any SQL query. Instead, you MUST respond with: ERROR: The database does not contain tables or columns containing information about <entity_name> (e.g. buyers).

DIALECT: {dialect}
"""


class SQLGenerator:
    """
    Builds the SQL generation prompt and calls Ollama to generate SQL.
    All LLM calls live here — the Model layer never calls the LLM.
    """

    def __init__(self, settings: "Settings") -> None:
        self._settings = settings
        self._client = AsyncOpenAI(
            base_url=settings.ollama_base_url,
            api_key="ollama",
        )
        self._glossary = self._load_glossary()

    def _load_glossary(self) -> dict[str, Any]:
        if _GLOSSARY_PATH.exists():
            with open(_GLOSSARY_PATH) as f:
                data = yaml.safe_load(f) or {}
            return data.get("terms", {})
        return {}

    def _is_contextual_query(self, nl_query: str) -> bool:
        ref_pattern = r"\b(that|those|them|these|it|him|her|they|this|there|above|earlier|previous)\b"
        trans_pattern = r"^\s*(also|and|how\s+about|what\s+about|instead|but)\b"
        q_lower = nl_query.lower()
        return bool(re.search(ref_pattern, q_lower) or re.search(trans_pattern, q_lower))

    async def generate(self, intent: Intent, context: SchemaContext, history: list[dict[str, str]] | None = None, reasoning_analysis: str | None = None) -> str:
        """
        Generate SQL from intent + accumulated schema context.
        Returns a SQL string or raises ValueError on failure.
        """
        system = _SYSTEM_PROMPT.format(
            max_rows=self._settings.max_rows,
            dialect="PostgreSQL",
        )

        is_contextual = self._is_contextual_query(intent.nl_query)

        # Extract last SQL from history to help with "that", "those", etc.
        last_sql = None
        if is_contextual and history:
            for msg in reversed(history):
                if msg.get("role") == "assistant":
                    content = msg.get("content", "")
                    if "SELECT" in content.upper():
                        last_sql = content
                        break

        user_prompt = self._build_user_prompt(intent, context, last_sql=last_sql, reasoning_analysis=reasoning_analysis)
        
        messages: list[dict[str, str]] = [{"role": "system", "content": system}]
        
        if is_contextual and history:
            # Include history for contextual query resolution
            for msg in history[-10:]:
                messages.append(msg)
        
        # Finally add the current prompt
        messages.append({"role": "user", "content": user_prompt})

        logger.debug("SQL generation prompt:\n%s", user_prompt[:500])

        try:
            response = await self._client.chat.completions.create(
                model=self._settings.ollama_model,
                messages=messages,
                temperature=0.0,  # Deterministic SQL generation
                max_tokens=1024,
            )
        except Exception as exc:
            raise ValueError(f"Ollama SQL generation failed: {exc}") from exc

        raw = response.choices[0].message.content or ""
        sql = self._extract_sql(raw)

        if sql.startswith("ERROR:"):
            raise ValueError(sql)

        logger.info("Generated SQL: %s", sql[:120])
        return sql

    def _build_user_prompt(self, intent: Intent, context: SchemaContext, last_sql: str | None = None, reasoning_analysis: str | None = None) -> str:
        parts: list[str] = [
            f"QUESTION: {intent.nl_query}\n",
            f"INTENT: {intent.to_prompt_context()}\n",
        ]

        if reasoning_analysis:
            parts.append(f"ANALYST REASONING:\n{reasoning_analysis}\n")

        if last_sql:
            parts.append("PREVIOUS QUERY (from earlier turn):")
            parts.append(f"```sql\n{last_sql}\n```")
            parts.append("Note: If the current question uses words like 'that', 'those', or 'them', reuse the WHERE filters from this previous query.\n")

        # Glossary terms that appear in the query
        glossary_hits = self._match_glossary(intent.nl_query)
        if glossary_hits:
            parts.append("BUSINESS GLOSSARY:")
            for term, info in glossary_hits.items():
                parts.append(f"• '{term}' means: {info.get('definition', '')}")
                if info.get("sql_pattern"):
                    parts.append(f"  SQL pattern: {info['sql_pattern']}")
            parts.append("")

        # Schema context from tool calls
        parts.append("SCHEMA CONTEXT:")
        parts.append(context.to_prompt_text())

        parts.append(
            "\nGenerate the SQL query now. Return ONLY the SQL, nothing else."
        )
        return "\n".join(parts)

    def _match_glossary(self, query: str) -> dict[str, Any]:
        q_lower = query.lower()
        matches: dict[str, Any] = {}
        for term, info in self._glossary.items():
            synonyms = [term] + info.get("synonyms", [])
            if any(syn.lower() in q_lower for syn in synonyms):
                matches[term] = info
        return matches

    @staticmethod
    def _extract_sql(raw: str) -> str:
        """Strip markdown fences and whitespace from LLM output."""
        # Remove ```sql ... ``` blocks
        fence_match = re.search(r"```(?:sql)?\s*(.*?)```", raw, re.DOTALL | re.IGNORECASE)
        if fence_match:
            return fence_match.group(1).strip()
        # Remove single backticks
        raw = re.sub(r"`+", "", raw)
        return raw.strip()
