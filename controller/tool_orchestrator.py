"""
controller/tool_orchestrator.py
────────────────────────────────
Drives the Ollama tool-calling loop (up to MAX_TOOL_ROUNDS).
The LLM picks which metadata tools to call; this class dispatches them.
Uses OpenAI-compatible API pointed at Ollama.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from openai import AsyncOpenAI

from controller.intent_parser import Intent
from tools.find_tables import SCHEMA as FIND_TABLES_SCHEMA
from tools.find_tables import find_relevant_tables
from tools.get_examples import SCHEMA as GET_EXAMPLES_SCHEMA
from tools.get_examples import get_query_examples
from tools.get_relationships import SCHEMA as GET_RELATIONSHIPS_SCHEMA
from tools.get_relationships import get_table_relationships
from tools.get_sample_values import SCHEMA as GET_SAMPLE_SCHEMA
from tools.get_sample_values import get_sample_values
from tools.search_data_values import SCHEMA as SEARCH_DATA_SCHEMA
from tools.search_data_values import search_data_values
from tools.get_schema import SCHEMA as GET_SCHEMA_SCHEMA
from tools.get_schema import get_table_schema
from tools.validate_sql import SCHEMA as VALIDATE_SQL_SCHEMA
from tools.validate_sql import validate_sql

if TYPE_CHECKING:
    from config.settings import Settings
    from model.facade import ModelFacade

logger = logging.getLogger(__name__)

# All tool schemas exposed to the LLM
TOOL_SCHEMAS = [
    FIND_TABLES_SCHEMA,
    GET_SCHEMA_SCHEMA,
    GET_RELATIONSHIPS_SCHEMA,
    GET_SAMPLE_SCHEMA,
    SEARCH_DATA_SCHEMA,
    GET_EXAMPLES_SCHEMA,
    VALIDATE_SQL_SCHEMA,
]

# Dispatch map: tool name → coroutine function
TOOL_DISPATCH: dict[str, Any] = {
    "find_relevant_tables": find_relevant_tables,
    "get_table_schema": get_table_schema,
    "get_table_relationships": get_table_relationships,
    "get_sample_values": get_sample_values,
    "search_data_values": search_data_values,
    "get_query_examples": get_query_examples,
    "validate_sql": validate_sql,
}


@dataclass
class SchemaContext:
    """Accumulated context gathered during the tool-calling loop."""

    tables_found: list[dict[str, Any]] = field(default_factory=list)
    schemas: dict[str, Any] = field(default_factory=dict)
    relationships: dict[str, Any] = field(default_factory=dict)
    sample_values: dict[str, list[str]] = field(default_factory=dict)
    examples: list[dict[str, Any]] = field(default_factory=list)
    tool_trace: list[dict[str, Any]] = field(default_factory=list)
    rounds_used: int = 0

    def to_prompt_text(self) -> str:
        """Render the gathered context as text for the SQL generation prompt."""
        parts: list[str] = []

        if self.tables_found:
            parts.append("=== RELEVANT TABLES ===")
            for t in self.tables_found:
                col_hint = f" (Columns: {', '.join(t['column_names'])})" if t.get("column_names") else ""
                parts.append(f"• {t['qualified_name']}: {t.get('description', '')}{col_hint}")

        if self.schemas:
            parts.append("\n=== TABLE SCHEMAS ===")
            for table_name, info in self.schemas.items():
                parts.append(f"\nTable: {table_name}")
                if info.get("description"):
                    parts.append(f"Description: {info['description']}")
                for col in info.get("columns", []):
                    pk = " [PK]" if col.get("is_pk") else ""
                    fk = f" [FK→{col.get('foreign_table')}.{col.get('foreign_column')}]" if col.get("is_fk") else ""
                    desc = f" — {col['description']}" if col.get("description") else ""
                    parts.append(f"  {col['name']} {col['type']}{pk}{fk}{desc}")

        if self.relationships and self.relationships.get("join_paths"):
            parts.append("\n=== JOIN PATHS ===")
            for jp in self.relationships["join_paths"]:
                parts.append(f"• {' → '.join(jp['tables'])}: {', '.join(jp['joins'])}")

        if self.sample_values:
            parts.append("\n=== SAMPLE VALUES ===")
            for key, vals in self.sample_values.items():
                parts.append(f"• {key}: {', '.join(str(v) for v in vals[:10])}")

        if self.examples:
            parts.append("\n=== SIMILAR PAST QUERIES ===")
            for ex in self.examples:
                parts.append(f"NL: {ex['nl_query']}\nSQL: {ex['sql_query']}")

        return "\n".join(parts)


def _build_context_prompt(intent: Intent) -> str:
    return (
        f"You are a metadata exploration agent for a SQL database.\n"
        f"Your job is to gather schema context needed to answer this query:\n\n"
        f"QUERY: {intent.nl_query}\n\n"
        f"INTENT ANALYSIS:\n{intent.to_prompt_context()}\n\n"
        f"Use the available tools to:\n"
        f"1. Call find_relevant_tables first to identify which tables are needed\n"
        f"2. Call get_table_schema for those tables to get column details\n"
        f"3. If the query involves multiple tables, call get_table_relationships\n"
        f"4. For ANY filter involving a string value (like a name, status, category, or type), call get_sample_values to see the exact casing and spelling used in the database.\n"
        f"5. If the user mentions a specific value but you don't know which column it belongs to, call search_data_values to scan the database for matching values.\n"
        f"6. For complex queries, call get_query_examples for few-shot context\n\n"
        f"When you have enough context to generate accurate SQL, stop calling tools."
    )


class ToolOrchestrator:
    """
    Drives the Ollama tool-calling loop to gather schema context.
    Max MAX_TOOL_ROUNDS iterations to prevent runaway loops.
    """

    def __init__(self, model: "ModelFacade", settings: "Settings") -> None:
        self._model = model
        self._settings = settings
        self._client = AsyncOpenAI(
            base_url=settings.ollama_base_url,
            api_key="ollama",  # Ollama ignores this but client requires it
        )

    async def gather_context(
        self, 
        intent: Intent, 
        history: list[dict[str, str]] | None = None,
        initial_context: SchemaContext | None = None,
    ) -> SchemaContext:
        context = initial_context or SchemaContext()
        messages: list[Any] = [
            {"role": "system", "content": _build_context_prompt(intent)}
        ]

        if history:
            # History is passed as [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
            # We filter it to keep it relevant
            for msg in history[-10:]:  # Keep last 10 messages for context
                # Map roles correctly for the LLM
                messages.append(msg)

        max_rounds = self._settings.max_tool_rounds

        for round_num in range(max_rounds):
            context.rounds_used = round_num + 1
            logger.debug("Tool loop round %d/%d", round_num + 1, max_rounds)

            # Force find_relevant_tables on the first round ONLY if we have no history
            current_tool_choice: Any = "auto"
            if round_num == 0 and not history:
                current_tool_choice = {"type": "function", "function": {"name": "find_relevant_tables"}}

            try:
                response = await self._client.chat.completions.create(
                    model=self._settings.ollama_model,
                    messages=messages,
                    tools=TOOL_SCHEMAS,  # type: ignore[arg-type]
                    tool_choice=current_tool_choice,
                    temperature=0.1,
                )
            except Exception as exc:
                logger.error("LLM call failed in tool loop: %s", exc)
                break

            choice = response.choices[0]
            logger.info("LLM Response [Round %d]: %s (Finish: %s)", 
                        round_num + 1, 
                        choice.message.content or "TOOL_CALL", 
                        choice.finish_reason)

            # LLM decided it has enough context
            if choice.finish_reason in ("stop", "end_turn") and not choice.message.tool_calls:
                logger.debug("Tool loop finished after %d rounds (stop)", round_num + 1)
                break

            # No tool calls — done
            if not choice.message.tool_calls:
                break

            # Add assistant message to history
            messages.append(choice.message)

            # Execute each tool call
            tool_results: list[dict[str, Any]] = []
            for tc in choice.message.tool_calls:
                fn_name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    args = {}

                logger.info("Calling tool: %s(%s)", fn_name, args)
                result = await self._dispatch(fn_name, args)

                # Accumulate results into context
                self._accumulate(context, fn_name, args, result)

                # Record trace
                context.tool_trace.append({
                    "round": round_num + 1,
                    "tool": fn_name,
                    "args": args,
                    "result_summary": self._summarise_result(result),
                })

                tool_results.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, default=str),
                })

            messages.extend(tool_results)

        return context

    async def _dispatch(self, fn_name: str, args: dict[str, Any]) -> Any:
        fn = TOOL_DISPATCH.get(fn_name)
        if fn is None:
            logger.warning("Unknown tool: %s", fn_name)
            return {"error": f"Unknown tool: {fn_name}"}
        try:
            return await fn(**args, model=self._model)
        except Exception as exc:
            logger.error("Tool %s raised: %s", fn_name, exc)
            return {"error": str(exc)}

    def _accumulate(self, ctx: SchemaContext, fn_name: str, args: dict[str, Any], result: Any) -> None:
        if fn_name == "find_relevant_tables" and isinstance(result, list):
            # Merge, avoid duplicates
            existing = {t["qualified_name"] for t in ctx.tables_found}
            for t in result:
                if t.get("qualified_name") not in existing:
                    ctx.tables_found.append(t)
        elif fn_name == "get_table_schema" and isinstance(result, dict):
            ctx.schemas.update(result)
        elif fn_name == "get_table_relationships" and isinstance(result, dict):
            ctx.relationships = result
        elif fn_name == "get_sample_values" and isinstance(result, list):
            key = f"{args.get('table', '?')}.{args.get('column', '?')}"
            ctx.sample_values[key] = result
        elif fn_name == "search_data_values" and isinstance(result, list):
            # Format as sample values too, so SQL generator sees them
            for item in result:
                key = f"{item['table']}.{item['column']}"
                if key not in ctx.sample_values:
                    ctx.sample_values[key] = []
                if item['matched_value'] not in ctx.sample_values[key]:
                    ctx.sample_values[key].append(item['matched_value'])
        elif fn_name == "get_query_examples" and isinstance(result, list):
            ctx.examples = result

    @staticmethod
    def _summarise_result(result: Any) -> str:
        if isinstance(result, list):
            return f"[{len(result)} items]"
        if isinstance(result, dict):
            return f"{{{', '.join(list(result.keys())[:5])}}}"
        return str(result)[:80]
