from __future__ import annotations

import json
import re
import logging
from typing import Any

from openai import AsyncOpenAI
from config.settings import Settings, get_settings

logger = logging.getLogger(__name__)

_CIO_SCHEMA = {
    "intent": "unknown",
    "subject": [],
    "entities": [],
    "filters": [],
    "aggregation": None,
    "group_by": [],
    "order_by": [],
    "limit": None,
    "time_filter": None,
    "requested_fields": [],
    "ignored_terms": [],
    "confidence": 0.0
}

_NORMALIZER_PROMPT = """You are a natural language understanding component of a database engine.
Your sole job is to translate a natural language query into a Canonical Intent Object (CIO) in JSON format.

RULES (strict):
1. Do NOT generate SQL, read any schema, or guess database/table/column names.
2. Only structure the natural language intent exactly as requested.
3. Be completely domain-agnostic. Work for any SQL database and business domain (e.g. CRM, Dairy, HR, Inventory, ERP).
4. Output ONLY valid JSON matching the CIO structure. No commentary, no explanation, no markdown fences. Just the raw JSON object.
5. Under 'intent':
   - If the query asks about database tables, columns, schema, structure, metadata, or relationships, intent MUST be 'metadata_question'.
   - For greetings (e.g. 'hello', 'hi'), intent MUST be 'greeting'.
   - For general/non-database conversations or general knowledge (e.g. 'explain the theory of relativity'), intent MUST be 'conversation'.
6. Under 'order_by', the 'direction' MUST be 'ASC' for bottom/lowest/ascending sorting, and 'DESC' for top/highest/descending sorting.
7. Under 'entities', always extract any specific IDs, codes, names, locations, or values (like 'MC10', 'EMP102', 'Mumbai') mentioned in the query.

CIO JSON structure:
{{
  "intent": "retrieve" | "count" | "average" | "sum" | "minimum" | "maximum" | "compare" | "group" | "sort" | "trend" | "exists" | "metadata_question" | "greeting" | "conversation" | "unknown",
  "subject": ["<list of business objects/nouns mentioned, e.g. employees, customers, invoices, products, suppliers - never assume these are tables>"],
  "entities": ["<list of identifiers/values/codes exactly as written, e.g. MC10, EMP102, Mumbai, January, John, ABC Pvt Ltd - do not modify them>"],
  "filters": [
    {{
      "field": "<field name if confidently identified, e.g. salary, price, age. Else 'unknown'>",
      "operator": ">" | "<" | "=" | "between" | "before" | "after" | "contains" | "starts with" | "ends with" | "in" | "not in" | "like" | etc,
      "value": "<value>",
      "expression": "<raw expression if field name cannot be confidently identified, e.g. 'from Mumbai', 'after 2024'>"
    }}
  ],
  "aggregation": "COUNT" | "SUM" | "AVG" | "MAX" | "MIN" | "DISTINCT" | "NONE" (or null if none). For maximum/highest/max queries, aggregation MUST be 'MAX'. For minimum/lowest/min queries, aggregation MUST be 'MIN'.
  "group_by": ["<list of grouping terms/fields, e.g. category, department>"],
  "order_by": [
    {{
      "field": "<field name>",
      "direction": "ASC" | "DESC"
    }}
  ],
  "limit": <int or null>,
  "time_filter": "<raw temporal expression or null, e.g. today, yesterday, last week, this month, 2024, Q1, between January and March - do not resolve dates>",
  "requested_fields": ["<list of explicitly requested columns/fields, e.g. name, salary>"],
  "ignored_terms": ["<list of conversational/filler words, e.g. show, details, list, give me, display, tell me, please, kindly, about>"],
  "confidence": <float between 0.0 and 1.0 based on confidence of parse>
}}

Examples:
- Input: "Show details of employee EMP102"
  Output:
  {{
    "intent": "retrieve",
    "subject": ["employee"],
    "entities": ["EMP102"],
    "filters": [],
    "aggregation": null,
    "group_by": [],
    "order_by": [],
    "limit": null,
    "time_filter": null,
    "requested_fields": [],
    "ignored_terms": ["show", "details", "of"],
    "confidence": 0.99
  }}

- Input: "How many customers are from Mumbai?"
  Output:
  {{
    "intent": "count",
    "subject": ["customers"],
    "entities": ["Mumbai"],
    "filters": [
      {{
        "field": "unknown",
        "operator": "=",
        "value": "Mumbai",
        "expression": "from Mumbai"
      }}
    ],
    "aggregation": "COUNT",
    "group_by": [],
    "order_by": [],
    "limit": null,
    "time_filter": null,
    "requested_fields": [],
    "ignored_terms": [],
    "confidence": 0.96
  }}

- Input: "Top 5 products by revenue"
  Output:
  {{
    "intent": "retrieve",
    "subject": ["products"],
    "entities": [],
    "filters": [],
    "aggregation": null,
    "group_by": [],
    "order_by": [
      {{
        "field": "revenue",
        "direction": "DESC"
      }}
    ],
    "limit": 5,
    "time_filter": null,
    "requested_fields": [],
    "ignored_terms": [],
    "confidence": 0.98
  }}

QUERY: {query}
"""

class QueryNormalizer:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client = AsyncOpenAI(
            base_url=self._settings.ollama_base_url,
            api_key="ollama",
        )

    async def normalize(self, query: str) -> dict[str, Any]:
        """
        Normalize natural language query into a Canonical Intent Object (CIO).
        Returns a dict matching the CIO structure.
        """
        prompt = _NORMALIZER_PROMPT.format(query=query)
        try:
            response = await self._client.chat.completions.create(
                model=self._settings.ollama_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=1024,
            )
            raw = response.choices[0].message.content or ""
            return self._parse_json(raw)
        except Exception as exc:
            logger.error("QueryNormalizer failed: %s", exc)
            fallback = dict(_CIO_SCHEMA)
            fallback["intent"] = "unknown"
            return fallback

    def _parse_json(self, raw: str) -> dict[str, Any]:
        match = re.search(r"({.*})", raw, re.DOTALL)
        if match:
            raw_json = match.group(1)
        else:
            raw_json = raw.strip()

        try:
            parsed = json.loads(raw_json)
        except Exception:
            logger.warning("Failed to parse raw JSON from normalizer: %s", raw[:200])
            parsed = {}

        res = dict(_CIO_SCHEMA)
        for k, default_val in _CIO_SCHEMA.items():
            val = parsed.get(k)
            if val is not None:
                if isinstance(default_val, list) and not isinstance(val, list):
                    res[k] = [val]
                elif isinstance(default_val, float) and isinstance(val, int):
                    res[k] = float(val)
                else:
                    res[k] = val
        return res
