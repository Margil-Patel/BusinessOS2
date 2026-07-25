"""
controller/self_corrector.py
─────────────────────────────────────────────────────────────────
Called when SQL validation fails during the agentic loop.

Re-prompts the LLM with:
  - The invalid SQL
  - The exact validation / runtime error
  - The schema context collected so far
  - The original NL query

Returns a corrected SQL string, or None if max_attempts exhausted.
─────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from openai import AsyncOpenAI

if TYPE_CHECKING:
    from config.settings import Settings
    from controller.loop_state import LoopState

logger = logging.getLogger(__name__)

_CORRECTION_SYSTEM = (
    "You are an expert SQL debugger. "
    "You will be shown an invalid SQL query and the exact error it produced. "
    "Your ONLY job is to return a corrected SQL query. "
    "Output ONLY the fixed SQL — no explanation, no markdown fences, no commentary."
)


class SelfCorrector:
    """
    Re-prompts the LLM with bad SQL + error message and asks for a fix.

    Rules (from spec):
    - Max 2 correction attempts per SQL emit.
    - Beyond 2 attempts means schema context is wrong; caller should
      re-enter the tool-gathering phase rather than keep correcting.
    """

    def __init__(self, settings: "Settings") -> None:
        self._settings = settings
        self._client = AsyncOpenAI(
            base_url=settings.ollama_base_url,
            api_key="ollama",
        )

    async def correct(
        self,
        bad_sql: str,
        error: str,
        state: "LoopState",
        schema_context_text: str = "",
        max_attempts: int = 2,
    ) -> str | None:
        """
        Attempt to correct *bad_sql* up to *max_attempts* times.

        Parameters
        ----------
        bad_sql             : The SQL that failed validation.
        error               : The validation/runtime error message.
        state               : Current LoopState (for NL query + prior errors).
        schema_context_text : Schema context string from ToolOrchestrator.
        max_attempts        : Max correction rounds (default 2 per spec rule).

        Returns
        -------
        Corrected SQL string on success, None if all attempts fail.
        """
        for attempt in range(1, max_attempts + 1):
            logger.info(
                "SelfCorrector attempt %d/%d for iteration %d",
                attempt, max_attempts, state.iteration,
            )
            prompt = self._correction_prompt(
                bad_sql, error, state, schema_context_text
            )
            try:
                response = await self._client.chat.completions.create(
                    model=self._settings.ollama_model,
                    messages=[
                        {"role": "system", "content": _CORRECTION_SYSTEM},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.0,
                    max_tokens=1024,
                )
            except Exception as exc:
                logger.error("SelfCorrector LLM call failed: %s", exc)
                return None

            raw = response.choices[0].message.content or ""
            corrected = self._extract_sql(raw)

            if corrected and not corrected.startswith("ERROR:"):
                state.sql_attempts.append(corrected)
                logger.info("SelfCorrector produced corrected SQL: %s", corrected[:80])
                return corrected

            logger.warning("SelfCorrector attempt %d produced no usable SQL", attempt)

        logger.warning("SelfCorrector exhausted all %d attempts", max_attempts)
        return None

    # ── private helpers ───────────────────────────────────────────────────────

    def _correction_prompt(
        self,
        bad_sql: str,
        error: str,
        state: "LoopState",
        schema_context_text: str,
    ) -> str:
        parts = [
            f"Original NL query: {state.nl_query}",
            "",
            "Invalid SQL:",
            bad_sql,
            "",
            f"Validation / runtime error:\n{error}",
        ]
        if schema_context_text:
            parts += [
                "",
                "Schema context collected so far:",
                schema_context_text,
            ]
        if state.errors:
            parts += [
                "",
                "Previous errors in this session (do NOT repeat these mistakes):",
            ]
            for err in state.errors:
                parts.append(
                    f"  [Iteration {err['iteration']}] {err['kind'].upper()}: {err['message']}"
                )
        parts += [
            "",
            "Return ONLY the corrected SQL, nothing else.",
        ]
        return "\n".join(parts)

    @staticmethod
    def _extract_sql(raw: str) -> str:
        """Strip markdown fences and whitespace from LLM output."""
        fence = re.search(r"```(?:sql)?\s*(.*?)```", raw, re.DOTALL | re.IGNORECASE)
        if fence:
            return fence.group(1).strip()
        return re.sub(r"`+", "", raw).strip()
