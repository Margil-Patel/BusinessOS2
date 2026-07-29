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
import re
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


def _extract_business_entities(reasoning_analysis: str | None) -> list[str]:
    if not reasoning_analysis:
        return []
    entities = []
    for line in reasoning_analysis.splitlines():
        if line.strip().startswith("Business Entities:"):
            # Extract content after ":"
            val = line.split(":", 1)[1].strip()
            if val and val.lower() not in ("none", "none.", "n/a"):
                # Split by comma
                parts = [p.strip() for p in val.split(",")]
                for p in parts:
                    p_clean = p.rstrip(".")
                    if p_clean and p_clean.lower() not in ("none", "none.", "n/a"):
                        entities.append(p_clean)
    return entities


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


def _build_context_prompt_v2() -> str:
    return (
        "You are a metadata exploration agent for a SQL database.\n"
        "Your job is to gather schema context needed to answer the user's latest query.\n\n"
        "STEPS:\n"
        "1. Call find_relevant_tables to identify which tables are needed for the NEW query.\n"
        "2. Call get_table_schema for those tables to get column details.\n"
        "3. If the query involves multiple tables, call get_table_relationships.\n"
        "4. MANDATORY: For ANY filter involving a string value (e.g., 'glossy', 'active'), you MUST call get_sample_values or search_data_values to confirm the exact casing in the database.\n"
        "5. If the query contains a specific name or value (like 'Bhavesh Patel') and semantic search doesn't find the table, call search_data_values (without specifying the tables parameter) to find the table and column containing that value.\n"
        "6. Call validate_sql to verify your final plan before stopping.\n\n"
        "If you already have enough context from 'ALREADY IN CONTEXT' or previous tool calls (including confirmed sample values), you may stop."
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
        reasoning_analysis: str | None = None,
    ) -> SchemaContext:
        context = initial_context or SchemaContext()

        # Pre-populate context with business entities if present in reasoning analysis
        entities = _extract_business_entities(reasoning_analysis)
        if entities:
            for entity in entities:
                logger.info("[ToolOrchestrator] Pre-populating context for business entity: %s", entity)
                # Search data values
                search_results = await self._dispatch("search_data_values", {"keyword": entity})
                if isinstance(search_results, list) and search_results:
                    self._accumulate(context, "search_data_values", {"keyword": entity}, search_results)
                    # Automatically fetch schemas for matched tables
                    matched_tables = list({item["table"] for item in search_results})
                    if matched_tables:
                        schema_results = await self._dispatch("get_table_schema", {"table_names": matched_tables})
                        if isinstance(schema_results, dict) and schema_results:
                            self._accumulate(context, "get_table_schema", {"table_names": matched_tables}, schema_results)
        
        # 1. System instructions
        messages: list[Any] = [
            {"role": "system", "content": _build_context_prompt_v2()}
        ]

        if reasoning_analysis:
            messages.append({
                "role": "system",
                "content": (
                    "=== SENIOR ANALYST REASONING ===\n"
                    f"{reasoning_analysis}\n\n"
                    "Use the above token classifications and entities to guide your schema exploration tool calls. "
                    "Remember: do NOT search metadata for terms classified as Ignored Conversational Terms. "
                    "Focus your metadata search and search_data_values on Business Entities and Candidate Schema Terms."
                )
            })

        # 2. History (if any)
        if history:
            messages.extend(history[-10:])
            messages.append({
                "role": "system", 
                "content": "The above is history. NOW, focus on the NEW user query below."
            })

        # 3. Current Query + Intent + Context Hint
        context_hint = ""
        if context.tables_found:
            t_names = [t["qualified_name"] for t in context.tables_found]
            context_hint = f"\nALREADY IN CONTEXT: {', '.join(t_names)}"

        messages.append({
            "role": "user",
            "content": (
                f"NEW QUERY: {intent.nl_query}\n"
                f"ANALYSIS: {intent.to_prompt_context()}"
                f"{context_hint}"
            )
        })

        max_rounds = self._settings.max_tool_rounds

        for round_num in range(max_rounds):
            context.rounds_used = round_num + 1
            logger.debug("Tool loop round %d/%d", round_num + 1, max_rounds)

            # Allow the LLM to choose tools naturally
            current_tool_choice: Any = "auto"

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

        # Ensure full column schema metadata is loaded for all tables in context
        missing_schemas = [
            t["qualified_name"] for t in context.tables_found 
            if t.get("qualified_name") and t["qualified_name"] not in context.schemas
        ]
        if missing_schemas:
            schema_results = await self._dispatch("get_table_schema", {"table_names": missing_schemas})
            if isinstance(schema_results, dict) and schema_results:
                self._accumulate(context, "get_table_schema", {"table_names": missing_schemas}, schema_results)

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
                
                # Also add matched table to tables_found so it appears in prompt's RELEVANT TABLES
                existing = {t["qualified_name"] for t in ctx.tables_found}
                if item['table'] not in existing:
                    t_info = self._model.registry.get(item['table'])
                    if t_info:
                        ctx.tables_found.append({
                            "qualified_name": t_info.qualified_name,
                            "description": t_info.description,
                            "column_names": [c.name for c in t_info.columns]
                        })
        elif fn_name == "get_query_examples" and isinstance(result, list):
            ctx.examples = result

    @staticmethod
    def _summarise_result(result: Any) -> str:
        if isinstance(result, list):
            return f"[{len(result)} items]"
        if isinstance(result, dict):
            return f"{{{', '.join(list(result.keys())[:5])}}}"
        return str(result)[:80]
