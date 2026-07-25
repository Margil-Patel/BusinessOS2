"""
controller/query_controller.py
────────────────────────────────
Main pipeline entry point. Ties all steps together.
This is the ONLY class the View layer calls into.

Pipeline (Agentic Loop):
  1. Parse intent          (heuristic)
  2. AgenticLoop.run()     ← replaces steps 2–5
     2a. Gather schema context  (Ollama tool loop)    ← ToolOrchestrator
     2b. Generate SQL            (Ollama)              ← SQLGenerator
     2c. Validate SQL            (static + EXPLAIN)    ← SQLValidator
     2d. Self-correct on failure (re-prompt)           ← SelfCorrector
     2e. Execute SQL             (DB)
     2f. On runtime error → inject error → retry loop
  3. Format response
  4. Log query             (always, even on failure)

The handle() signature is UNCHANGED — the View layer (middleware.py,
API routes) requires no modification.
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any, Optional

from controller.agentic_loop import AgenticLoop
from controller.intent_parser import Intent, IntentParser
from controller.result_formatter import ResultFormatter
from controller.sql_validator import UnsafeQueryError
from controller.tool_orchestrator import SchemaContext
from model.query_log.log import QueryLogEntry

if TYPE_CHECKING:
    from config.settings import Settings
    from model.facade import ModelFacade

logger = logging.getLogger(__name__)


class QueryFailedError(Exception):
    """Raised when the agentic loop exhausts all iterations without success."""


class QueryController:
    """
    Orchestrates the full NL → SQL → Results pipeline via AgenticLoop.

    Architecture contracts:
    - View layer calls ONLY this class.
    - This class imports ONLY ModelFacade from the model layer.
    - All LLM calls happen inside AgenticLoop's sub-components.
    """

    def __init__(self, model: "ModelFacade", settings: "Settings") -> None:
        self._model = model
        self._settings = settings
        self._parser = IntentParser()
        self._loop = AgenticLoop(
            model=model,
            settings=settings,
            max_iterations=settings.loop_max_iter,
            max_correction_attempts=settings.loop_max_corrections,
        )
        self._formatter = ResultFormatter()

    async def handle(
        self,
        nl_query: str,
        history: list[dict[str, str]] | None = None,
        db_id: str = "default",
    ) -> dict[str, Any]:
        """
        Process a natural language query end-to-end via the agentic loop.
        Signature is identical to the pre-loop version — View layer unchanged.
        """
        start = time.monotonic()

        # Quick safety pre-check (avoids spinning up the loop for blocked queries)
        intent = self._parser.parse(nl_query, db_id=db_id)
        if intent.is_unsafe:
            elapsed = (time.monotonic() - start) * 1000
            await self._log(nl_query, "BLOCKED", 0, False, elapsed, db_id, "Unsafe query detected")
            return self._formatter.format_error(
                UnsafeQueryError("This type of query is not allowed"),
                intent=intent,
                latency_ms=elapsed,
            )

        try:
            # ── Run the full agentic loop ─────────────────────────────────────
            state = await self._loop.run(nl_query, history=history, db_id=db_id)

            elapsed = (time.monotonic() - start) * 1000

            if not state.success:
                # Loop exhausted — log and surface structured error
                error_summary = "; ".join(
                    f"{e['kind']}: {e['message']}" for e in state.errors
                )
                await self._log(
                    nl_query, state.final_sql or "", state.iteration,
                    False, elapsed, db_id, error_summary,
                )
                raise QueryFailedError(
                    f"Agentic loop exhausted after {state.iteration} iteration(s). "
                    f"Errors: {error_summary}"
                )

            # ── Log every iteration to QueryLog ───────────────────────────────
            await self._log(
                nl_query, state.final_sql or "", state.iteration,
                True, elapsed, db_id,
            )

            # ── Fetch full rows with all columns if possible ──────────────────
            full_rows = None
            full_columns = None
            if state.final_sql:
                try:
                    import re
                    # Rewrite to SELECT *
                    sql_clean = re.sub(r"--.*?\n", "", state.final_sql)
                    sql_clean = re.sub(r"/\*.*?\*/", "", sql_clean, flags=re.DOTALL)
                    
                    match = re.match(r"^(\s*SELECT\s+(?:DISTINCT\s+)?)(.*?)\bFROM\b", sql_clean, re.IGNORECASE | re.DOTALL)
                    if match:
                        select_prefix = match.group(1)
                        projection = match.group(2)
                        rest = sql_clean[match.end(2):]
                        
                        # Only rewrite if projection does not already contain '*' and is not an aggregation
                        if '*' not in projection and not re.search(r"\b(COUNT|SUM|AVG|MIN|MAX|GROUP\s+BY)\b", sql_clean, re.IGNORECASE):
                            rewritten_sql = f"{select_prefix}* {rest}"
                            logger.info("[QueryController] Executing full columns query: %s", rewritten_sql[:120])
                            full_rows = await self._model.db.execute(rewritten_sql)
                            full_columns = list(full_rows[0].keys()) if full_rows else []
                except Exception as rewrite_exc:
                    logger.warning("[QueryController] Failed to execute full columns query: %s", rewrite_exc)

            # ── Build context for the formatter (uses last schema context) ────
            # AgenticLoop accumulates tool_results in state; we reconstruct a
            # minimal SchemaContext so the formatter's trace output is populated.
            context = self._state_to_schema_context(state)

            return self._formatter.format_from_state(
                state=state,
                context=context,
                intent=intent,
                latency_ms=elapsed,
                full_rows=full_rows,
                full_columns=full_columns,
            )

        except QueryFailedError as exc:
            elapsed = (time.monotonic() - start) * 1000
            return self._formatter.format_error(
                exc,
                intent=intent,
                latency_ms=elapsed,
            )

        except Exception as exc:
            elapsed = (time.monotonic() - start) * 1000
            logger.exception("Unexpected error in QueryController.handle: %s", exc)
            await self._log(nl_query, "", 0, False, elapsed, db_id, str(exc))
            return self._formatter.format_error(
                exc, intent=intent, latency_ms=elapsed
            )

    async def explain_only(
        self,
        nl_query: str,
        history: list[dict[str, str]] | None = None,
        db_id: str = "default",
    ) -> dict[str, Any]:
        """
        Return tool trace + SQL without executing. Used by /explain endpoint.
        Preserved from the pre-loop version — no behavioural change.
        """
        from controller.sql_generator import SQLGenerator
        from controller.tool_orchestrator import ToolOrchestrator

        intent = self._parser.parse(nl_query, db_id=db_id)
        orchestrator = ToolOrchestrator(self._model, self._settings)
        generator = SQLGenerator(self._settings)

        context = await orchestrator.gather_context(intent, history=history)
        sql = await generator.generate(intent, context, history=history)
        return {
            "sql": sql,
            "trace": {
                "intent": intent.to_dict(),
                "tool_calls": context.tool_trace,
                "rounds_used": context.rounds_used,
                "tables_used": [t["qualified_name"] for t in context.tables_found],
                "schema_context": context.to_prompt_text(),
            },
        }

    # ── private helpers ───────────────────────────────────────────────────────

    def _state_to_schema_context(self, state: "Any") -> SchemaContext:
        """
        Reconstruct a minimal SchemaContext from LoopState tool_results
        so the formatter can populate the trace fields.
        """
        ctx = SchemaContext()
        ctx.tool_trace = state.tool_results
        ctx.rounds_used = state.iteration
        return ctx

    async def _log(
        self,
        nl_query: str,
        sql: str,
        iterations: int,
        success: bool,
        latency_ms: float,
        db_id: str,
        error: str | None = None,
    ) -> None:
        """Log every query — even failures — for few-shot improvement."""
        try:
            entry = QueryLogEntry(
                nl_query=nl_query,
                sql_query=sql,
                success=success,
                latency_ms=latency_ms,
                error_msg=error,
                db_id=db_id,
            )
            await self._model.log_query(entry)
        except Exception as log_err:
            logger.warning("Failed to log query: %s", log_err)
