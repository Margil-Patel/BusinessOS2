"""
controller/query_controller.py
────────────────────────────────
Main pipeline entry point. Ties all steps together.
This is the ONLY class the View layer calls into.

Pipeline:
  1. Parse intent  (heuristic)
  2. Gather schema context  (Ollama tool loop)
  3. Generate SQL  (Ollama)
  4. Validate SQL  (static + EXPLAIN)
  5. Execute SQL  (DB)
  6. Format response
  7. Log query  (always, even on failure)
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any, Optional

from controller.intent_parser import Intent, IntentParser
from controller.result_formatter import ResultFormatter
from controller.sql_generator import SQLGenerator
from controller.sql_validator import SQLValidationError, SQLValidator, UnsafeQueryError
from controller.tool_orchestrator import SchemaContext, ToolOrchestrator
from model.query_log.log import QueryLogEntry

if TYPE_CHECKING:
    from config.settings import Settings
    from model.facade import ModelFacade

logger = logging.getLogger(__name__)


class QueryController:
    """
    Orchestrates the full NL → SQL → Results pipeline.

    Architecture contracts:
    - View layer calls ONLY this class
    - This class imports ONLY ModelFacade from the model layer
    - All LLM calls happen inside ToolOrchestrator and SQLGenerator
    """

    def __init__(self, model: "ModelFacade", settings: "Settings") -> None:
        self._model = model
        self._settings = settings
        self._parser = IntentParser()
        self._orchestrator = ToolOrchestrator(model, settings)
        self._generator = SQLGenerator(settings)
        self._validator = SQLValidator()
        self._formatter = ResultFormatter()

    async def handle(self, nl_query: str, db_id: str = "default") -> dict[str, Any]:
        """
        Process a natural language query end-to-end.

        Returns a dict matching QueryResponse schema:
        {sql, rows, columns, row_count, latency_ms, trace, error}
        """
        start = time.monotonic()
        intent = self._parser.parse(nl_query, db_id=db_id)
        sql: str | None = None
        context: Optional[SchemaContext] = None

        # ── Safety check before any LLM calls ─────────────────────────────────
        if intent.is_unsafe:
            elapsed = (time.monotonic() - start) * 1000
            await self._log(nl_query, "BLOCKED", False, elapsed, db_id, "Unsafe query detected")
            return self._formatter.format_error(
                UnsafeQueryError("This type of query is not allowed"),
                intent=intent,
                latency_ms=elapsed,
            )

        try:
            # ── Step 1: Gather schema context via tool-calling loop ────────────
            logger.info("Gathering context for: %r", nl_query)
            context = await self._orchestrator.gather_context(intent)

            # ── Step 2: Generate SQL ──────────────────────────────────────────
            sql = await self._generator.generate(intent, context)

            # ── Step 3: Validate SQL (MUST run before execute) ────────────────
            self._validator.check(sql, db_id)

            # Run EXPLAIN for deeper validation (best-effort — don't fail on SQLite)
            try:
                await self._validator.explain(sql, self._model.db)
            except Exception as explain_err:
                logger.warning("EXPLAIN validation failed: %s", explain_err)
                # For non-Postgres backends, EXPLAIN may not work — skip
                if "EXPLAIN" not in str(explain_err):
                    raise SQLValidationError(str(explain_err)) from explain_err

            # ── Step 4: Execute ───────────────────────────────────────────────
            logger.info("Executing SQL: %s", sql[:80])
            rows = await self._model.db.execute(sql)

            elapsed = (time.monotonic() - start) * 1000
            await self._log(nl_query, sql, True, elapsed, db_id)

            return self._formatter.format(sql, rows, context, intent, latency_ms=elapsed)

        except (SQLValidationError, UnsafeQueryError) as exc:
            elapsed = (time.monotonic() - start) * 1000
            await self._log(nl_query, sql or "", False, elapsed, db_id, str(exc))
            return self._formatter.format_error(exc, sql=sql, intent=intent, context=context, latency_ms=elapsed)

        except Exception as exc:
            elapsed = (time.monotonic() - start) * 1000
            logger.exception("Query pipeline error: %s", exc)
            await self._log(nl_query, sql or "", False, elapsed, db_id, str(exc))
            return self._formatter.format_error(exc, sql=sql, intent=intent, context=context, latency_ms=elapsed)

    async def explain_only(self, nl_query: str, db_id: str = "default") -> dict[str, Any]:
        """
        Return tool trace + SQL without executing. Used by /explain endpoint.
        """
        intent = self._parser.parse(nl_query, db_id=db_id)
        context = await self._orchestrator.gather_context(intent)
        sql = await self._generator.generate(intent, context)
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

    async def _log(
        self,
        nl_query: str,
        sql: str,
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
