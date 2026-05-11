"""
controller/intent_parser.py
────────────────────────────
Extracts structured intent from a natural language query.
Identifies query type, entities, time references, and aggregation hints.
No LLM call — pure heuristic extraction (fast, deterministic).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class QueryType(str, Enum):
    SELECT = "select"
    AGGREGATION = "aggregation"
    RANKING = "ranking"
    FILTER = "filter"
    JOIN = "join"
    SUBQUERY = "subquery"
    UNKNOWN = "unknown"


@dataclass
class Intent:
    nl_query: str
    query_type: QueryType = QueryType.UNKNOWN
    entities: list[str] = field(default_factory=list)
    time_references: list[str] = field(default_factory=list)
    aggregations: list[str] = field(default_factory=list)
    filters: list[str] = field(default_factory=list)
    limit_hint: int | None = None
    is_unsafe: bool = False
    db_id: str = "default"

    def to_prompt_context(self) -> str:
        lines = [
            f"Query type: {self.query_type.value}",
            f"Entities mentioned: {', '.join(self.entities) or 'none detected'}",
        ]
        if self.time_references:
            lines.append(f"Time references: {', '.join(self.time_references)}")
        if self.aggregations:
            lines.append(f"Aggregations: {', '.join(self.aggregations)}")
        if self.filters:
            lines.append(f"Filters: {', '.join(self.filters)}")
        if self.limit_hint:
            lines.append(f"Result limit hint: {self.limit_hint}")
        return "\n".join(lines)

    def to_dict(self) -> dict[str, Any]:
        return {
            "nl_query": self.nl_query,
            "query_type": self.query_type.value,
            "entities": self.entities,
            "time_references": self.time_references,
            "aggregations": self.aggregations,
            "filters": self.filters,
            "limit_hint": self.limit_hint,
        }


# ── Pattern dictionaries ───────────────────────────────────────────────────────
_UNSAFE_PATTERNS = re.compile(
    r"\b(drop|delete|truncate|update|insert|alter|grant|revoke|exec|execute)\b",
    re.IGNORECASE,
)
_AGG_PATTERNS = re.compile(
    r"\b(count|sum|average|avg|total|max|min|maximum|minimum|mean|median|percentage|rate)\b",
    re.IGNORECASE,
)
_TIME_PATTERNS = re.compile(
    r"\b(today|yesterday|this\s+week|last\s+week|this\s+month|last\s+month|"
    r"this\s+year|last\s+year|last\s+\d+\s+days?|past\s+\d+\s+days?|"
    r"\d{4}-\d{2}-\d{2}|q[1-4]\s+\d{4})\b",
    re.IGNORECASE,
)
_RANKING_PATTERNS = re.compile(
    r"\b(top\s+\d+|bottom\s+\d+|best|worst|highest|lowest|most|least|ranked|ranking)\b",
    re.IGNORECASE,
)
_LIMIT_PATTERN = re.compile(r"\btop\s+(\d+)\b|\b(\d+)\s+(?:records?|rows?|results?|items?)\b", re.IGNORECASE)
_JOIN_PATTERNS = re.compile(
    r"\b(with|and|including|joined|related|linked|associated|along\s+with)\b",
    re.IGNORECASE,
)


class IntentParser:
    """Lightweight, heuristic-based intent extractor. No LLM calls."""

    def parse(self, nl_query: str, db_id: str = "default") -> Intent:
        intent = Intent(nl_query=nl_query, db_id=db_id)

        # Safety check
        intent.is_unsafe = bool(_UNSAFE_PATTERNS.search(nl_query))

        # Query type
        intent.query_type = self._detect_query_type(nl_query)

        # Aggregations
        intent.aggregations = list({m.group(0).lower() for m in _AGG_PATTERNS.finditer(nl_query)})

        # Time references
        intent.time_references = list({m.group(0).lower() for m in _TIME_PATTERNS.finditer(nl_query)})

        # Limit hint
        limit_match = _LIMIT_PATTERN.search(nl_query)
        if limit_match:
            intent.limit_hint = int(limit_match.group(1) or limit_match.group(2))

        # Coarse entity extraction — words likely to be table/column names
        intent.entities = self._extract_entities(nl_query)

        return intent

    def _detect_query_type(self, query: str) -> QueryType:
        q = query.lower()
        if _UNSAFE_PATTERNS.search(query):
            return QueryType.UNKNOWN
        if bool(_RANKING_PATTERNS.search(query)):
            return QueryType.RANKING
        if bool(_AGG_PATTERNS.search(query)):
            return QueryType.AGGREGATION
        if "who has never" in q or "not in" in q or "without" in q:
            return QueryType.SUBQUERY
        if bool(_JOIN_PATTERNS.search(query)) and any(
            word in q for word in ["customer", "product", "order", "user", "item"]
        ):
            return QueryType.JOIN
        if any(word in q for word in ["where", "filter", "only", "with status", "that are"]):
            return QueryType.FILTER
        return QueryType.SELECT

    def _extract_entities(self, query: str) -> list[str]:
        # Remove stop words and extract noun-like tokens
        stop_words = {
            "show", "me", "all", "the", "a", "an", "list", "get", "find", "what",
            "how", "many", "is", "are", "have", "has", "for", "of", "in", "on",
            "and", "or", "with", "by", "from", "to", "that", "which", "who",
            "where", "when", "their", "its", "this", "these", "those", "each",
            "every", "between", "than", "last", "this", "past", "recent", "give",
        }
        tokens = re.findall(r"\b[a-z][a-z_]{2,}\b", query.lower())
        return [t for t in tokens if t not in stop_words][:10]
