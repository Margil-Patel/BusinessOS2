"""
controller/agentic_loop.py
─────────────────────────────────────────────────────────────────
Self-correcting agentic loop for NL2SQL.

Architecture
────────────
Each loop iteration runs the full pipeline:
  Thought  → ToolOrchestrator gathers / refreshes schema context
  Action   → SQLGenerator emits SQL from the gathered context
  Observe  → SQLValidator + db.execute() check the result
  Correct  → SelfCorrector re-prompts on validation failure
             OR error is injected into context for next iteration

Rules (from spec)
-----------------
  • Never execute SQL without validation passing first.
  • Hard iteration ceiling (default 5, never above 10).
  • Never silently swallow a failed loop.
  • Max 2 self-correction attempts per SQL emit.
  • All errors injected into every subsequent prompt.
  • Row-limit guard enforced by SQLGenerator system prompt.
  • Every iteration logged to QueryLog.
  • Confidence score returned with every response.
─────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

from openai import AsyncOpenAI
from controller.intent_parser import IntentParser
from controller.loop_state import LoopState
from controller.self_corrector import SelfCorrector
from controller.sql_generator import SQLGenerator, quote_sql_identifiers
from controller.sql_validator import SQLValidationError, SQLValidator, UnsafeQueryError
from controller.tool_orchestrator import SchemaContext, ToolOrchestrator

if TYPE_CHECKING:
    from config.settings import Settings
    from model.facade import ModelFacade

logger = logging.getLogger(__name__)

# Hard ceiling — spec says never above 10
_ABSOLUTE_MAX_ITER = 10

_REASONING_PROMPT = """You are a senior database analyst. Analyze the user's natural language query before database schema matching.
Analyze the query according to these steps:

Step 1 - Understand Intent: Determine the user's intention (e.g., retrieve records, filter records, aggregate data, compare values, sort results, count rows, find maximum/minimum, metadata question, greeting/non-database conversation). Do not inspect schemas yet.
Step 2 - Identify Important Information: Extract only meaningful entities or values (e.g., business identifiers, names, codes) and identify conversational filler terms to ignore.
Step 3 - Classify Words: Classify tokens into:
  - Action words: (e.g. show, find, list, retrieve, display, tell, fetch, count - never search these in schema)
  - Conversational filler: (e.g. details, record, information, entry, data, about, please, kindly, me - ignore completely, never search in schema)
  - Business entities: (e.g. specific IDs, names, categories, values to search in table data like 'MC10', 'Bhavesh Patel')
  - Possible schema terms: (e.g. terms representing tables, columns, or relationships like 'village', 'price', 'crop')
Step 4 - Reason Before Schema Lookup: Reason about what information is actually required and what terms are candidates for schema search.

You MUST respond in this exact format (ensure the labels match exactly):

Intent Detected: <intent description>
Ignored Conversational Terms: <comma-separated list of ignored terms, or none>
Business Entities: <comma-separated list of business identifiers/values, or none>
Candidate Schema Terms: <comma-separated list of potential tables/columns, or none. DO NOT include any Action words (like 'show') or Conversational fillers here.>
Reason for Schema Lookup: <brief explanation of what to search for and where to search>

QUERY: {query}
"""


class AgenticLoop:
    """
    Wraps ToolOrchestrator + SQLGenerator + SQLValidator in a
    Thought → Action → Observe → Correct loop.

    The existing pipeline components are reused unchanged; this class
    only adds the retry / self-correction scaffolding around them.
    """

    def __init__(
        self,
        model: "ModelFacade",
        settings: "Settings",
        max_iterations: int = 5,
        max_correction_attempts: int = 2,
    ) -> None:
        self._model = model
        self._settings = settings
        self._max_iter = min(max_iterations, _ABSOLUTE_MAX_ITER)
        self._max_corrections = max_correction_attempts

        # Reuse existing components — no duplication
        self._parser = IntentParser()
        self._orchestrator = ToolOrchestrator(model, settings)
        self._generator = SQLGenerator(settings)
        self._validator = SQLValidator()
        self._corrector = SelfCorrector(settings)

    async def _run_analyst_reasoning(self, nl_query: str) -> str:
        try:
            client = AsyncOpenAI(
                base_url=self._settings.ollama_base_url,
                api_key="ollama",
            )
            prompt = _REASONING_PROMPT.format(query=nl_query)
            response = await client.chat.completions.create(
                model=self._settings.ollama_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=512,
            )
            return response.choices[0].message.content or ""
        except Exception as exc:
            logger.warning("Failed to run analyst reasoning: %s", exc)
            return ""

    async def run(
        self,
        nl_query: str,
        history: list[dict[str, str]] | None = None,
        db_id: str = "default",
    ) -> LoopState:
        """
        Execute the agentic loop for *nl_query*.

        Returns a LoopState with success=True on a good result,
        or success=False with populated .errors if all iterations fail.
        """
        state = LoopState(nl_query=nl_query)
        intent = self._parser.parse(nl_query, db_id=db_id)

        # Safety check — bail immediately for unsafe queries
        if intent.is_unsafe:
            state.add_error("unsafe", "Query blocked: destructive intent detected")
            state.finalize()
            logger.info("Final SQL:\n%s", state.final_sql or "None")
            return state

        # Step 1-4: Analyst Reasoning Before Schema Lookup
        reasoning_analysis = await self._run_analyst_reasoning(nl_query)
        if reasoning_analysis:
            logger.info("\n" + "="*50 + "\nSENIOR ANALYST REASONING:\n" + reasoning_analysis + "\n" + "="*50)

        # Pre-populate context with tables from history (carry-forward)
        pre_context = self._build_pre_context(history)

        schema_context: SchemaContext | None = None

        for i in range(self._max_iter):
            state.iteration = i + 1
            logger.info(
                "[AgenticLoop] Iteration %d/%d | errors_so_far=%d",
                state.iteration, self._max_iter, len(state.errors),
            )

            # ── THOUGHT: gather / refresh schema context ──────────────────────
            # On retries, pass existing context so prior tool results are reused
            # and errors are visible in the context hint.
            try:
                schema_context = await self._orchestrator.gather_context(
                    intent,
                    history=history,
                    initial_context=pre_context if i == 0 else schema_context,
                    reasoning_analysis=reasoning_analysis,
                )
                # Snapshot tool results into state for confidence scoring
                self._sync_tool_results(state, schema_context)

            except Exception as exc:
                logger.error("[AgenticLoop] Tool gathering failed: %s", exc)
                state.add_error("tool_error", str(exc))
                continue

            # ── ACTION: generate SQL ──────────────────────────────────────────
            try:
                # Inject prior errors into history so generator sees them
                augmented_history = self._inject_errors_into_history(
                    history, state
                )
                sql = await self._generator.generate(
                    intent, schema_context, history=augmented_history, reasoning_analysis=reasoning_analysis
                )
                sql = quote_sql_identifiers(sql, schema_context)
                state.sql_attempts.append(sql)
            except ValueError as exc:
                if str(exc).startswith("ERROR:"):
                    logger.info("[AgenticLoop] LLM reported error: %s", exc)
                    state.add_error("generation", str(exc))
                    state.finalize()
                    logger.info("Final SQL:\n%s", state.final_sql or "None")
                    return state
                logger.error("[AgenticLoop] SQL generation failed: %s", exc)
                state.add_error("generation", str(exc))
                continue
            except Exception as exc:
                logger.error("[AgenticLoop] SQL generation failed: %s", exc)
                state.add_error("generation", str(exc))
                continue

            # ── OBSERVE (validation gate — must pass before execute) ──────────
            validation_error: str | None = None
            try:
                self._validator.check(sql, db_id, registry=self._model.registry)
                # EXPLAIN dry-run (best-effort)
                try:
                    await self._validator.explain(sql, self._model.db)
                except Exception as explain_exc:
                    # Get the underlying database exception if it exists
                    underlying_exc = explain_exc.__cause__ or explain_exc
                    underlying_msg = str(underlying_exc).split("[SQL:")[0]
                    # Only hard-fail for non-EXPLAIN backend errors
                    if "EXPLAIN" not in underlying_msg.upper():
                        raise SQLValidationError(underlying_msg) from explain_exc
                    logger.debug("EXPLAIN not supported, skipping: %s", explain_exc)

            except UnsafeQueryError as exc:
                # Unsafe SQL — do NOT retry; surface immediately
                state.add_error("unsafe_sql", str(exc))
                logger.warning("[AgenticLoop] Unsafe SQL blocked: %s", exc)
                state.finalize()
                logger.info("Final SQL:\n%s", state.final_sql or "None")
                return state

            except SQLValidationError as exc:
                validation_error = str(exc)

            # ── CORRECT: self-correction if validation failed ─────────────────
            if validation_error:
                logger.info(
                    "[AgenticLoop] Validation failed (iter %d): %s",
                    state.iteration, validation_error,
                )
                state.add_error("validation", validation_error)

                corrected = await self._corrector.correct(
                    bad_sql=sql,
                    error=validation_error,
                    state=state,
                    schema_context_text=schema_context.to_prompt_text(),
                    max_attempts=self._max_corrections,
                )

                if corrected:
                    corrected = quote_sql_identifiers(corrected, schema_context)
                    # Re-validate the corrected SQL before continuing
                    try:
                        self._validator.check(corrected, db_id, registry=self._model.registry)
                        sql = corrected
                        logger.info(
                            "[AgenticLoop] Self-correction succeeded on iter %d",
                            state.iteration,
                        )
                    except SQLValidationError as re_exc:
                        # Corrected SQL also invalid → inject and retry loop
                        state.add_error("validation_after_correction", str(re_exc))
                        logger.warning(
                            "[AgenticLoop] Corrected SQL still invalid: %s", re_exc
                        )
                        continue
                else:
                    # Correction exhausted → re-collect context next iteration
                    logger.warning(
                        "[AgenticLoop] SelfCorrector exhausted on iter %d — "
                        "will re-collect context next iteration",
                        state.iteration,
                    )
                    continue

            # ── EXECUTE against DB ────────────────────────────────────────────
            try:
                logger.info(
                    "[AgenticLoop] Executing SQL (iter %d): %s",
                    state.iteration, sql[:80],
                )
                rows = await self._model.db.execute(sql)

                # ── SUCCESS ───────────────────────────────────────────────────
                state.final_sql = sql
                state.rows = rows
                state.confidence = self._score_confidence(state)
                state.success = True
                logger.info(
                    "[AgenticLoop] Success on iteration %d | "
                    "rows=%d | confidence=%.2f",
                    state.iteration, len(rows), state.confidence,
                )
                break

            except Exception as runtime_exc:
                # Runtime error → inject into state and retry
                err_msg = str(runtime_exc)
                logger.warning(
                    "[AgenticLoop] Runtime error on iter %d: %s",
                    state.iteration, err_msg,
                )
                state.add_error("runtime", err_msg)
                
                corrected = await self._corrector.correct(
                    bad_sql=sql,
                    error=err_msg,
                    state=state,
                    schema_context_text=schema_context.to_prompt_text() if schema_context else "",
                    max_attempts=self._max_corrections,
                )
                if corrected:
                    corrected = quote_sql_identifiers(corrected, schema_context)
                    try:
                        self._validator.check(corrected, db_id, registry=self._model.registry)
                        rows = await self._model.db.execute(corrected)
                        state.final_sql = corrected
                        state.rows = rows
                        state.confidence = self._score_confidence(state)
                        state.success = True
                        logger.info(
                            "[AgenticLoop] Runtime self-correction succeeded on iter %d | rows=%d",
                            state.iteration, len(rows),
                        )
                        break
                    except Exception as re_exc:
                        state.add_error("runtime_after_correction", str(re_exc))
                        continue

        state.finalize()
        logger.info("Final SQL:\n%s", state.final_sql or "None")
        return state

    # ── private helpers ───────────────────────────────────────────────────────

    def _build_pre_context(
        self, history: list[dict[str, str]] | None
    ) -> SchemaContext:
        """
        Seed the first iteration with tables seen in prior chat turns
        so the LLM can resolve pronouns like "that" / "those".
        """
        pre = SchemaContext()
        if not history:
            return pre
        for msg in reversed(history):
            if msg.get("role") == "assistant":
                import re
                matches = re.findall(
                    r"\b(?:FROM|JOIN)\s+([a-zA-Z0-9_.]+)\b",
                    msg.get("content", ""),
                    re.IGNORECASE,
                )
                for m in matches:
                    if m.lower() not in ("select", "where", "group", "order", "limit"):
                        table = self._model.registry.get(m)
                        if table:
                            pre.tables_found.append(table.to_dict())
                if pre.tables_found:
                    break
        return pre

    def _sync_tool_results(self, state: LoopState, ctx: SchemaContext) -> None:
        """
        Append new tool trace entries into LoopState so the confidence
        scorer and the response formatter can see the full picture.
        Only adds entries not already in state.tool_results.
        """
        existing_count = len(state.tool_results)
        for entry in ctx.tool_trace[existing_count:]:
            state.tool_results.append(entry)

    def _inject_errors_into_history(
        self,
        history: list[dict[str, str]] | None,
        state: LoopState,
    ) -> list[dict[str, str]] | None:
        """
        Append an error-context message to the chat history so that
        SQLGenerator's next LLM call sees what went wrong previously.

        We do this in a copy to avoid mutating the caller's history.
        """
        error_text = state.error_context_text()
        if not error_text:
            return history
        injected: list[dict[str, str]] = list(history or [])
        injected.append(
            {
                "role": "system",
                "content": error_text,
            }
        )
        return injected

    def _score_confidence(self, state: LoopState) -> float:
        """
        Compute a 0.0–1.0 confidence score from loop metrics.

        Scoring factors
        ---------------
        - Fewer iterations used → higher score (max deduction 0.3)
        - Self-correction count → penalty (0.1 per correction)
        - Runtime error count  → penalty (0.1 per runtime error)
        - Row plausibility     → small boost if 1 < rows < 5000
        """
        score = 1.0

        # Iteration penalty (each extra iteration costs 0.06, capped at 0.30)
        iter_penalty = min((state.iteration - 1) * 0.06, 0.30)
        score -= iter_penalty

        # Correction penalty
        score -= state.correction_count * 0.10

        # Runtime error penalty
        score -= state.runtime_error_count * 0.10

        # Row plausibility bonus/penalty
        row_count = len(state.rows)
        if row_count == 0:
            score -= 0.05  # slight suspicion — might be wrong query
        elif 1 <= row_count <= 5000:
            score += 0.02  # plausible result set

        return round(max(0.0, min(1.0, score)), 4)
