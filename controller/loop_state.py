"""
controller/loop_state.py
─────────────────────────────────────────────────────────────────
Accumulates all state across agentic loop iterations.
Passed into every subsequent LLM call as structured context so
the model can see what it already tried and what went wrong.
─────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class LoopState:
    """
    State accumulator for a single user query processed by AgenticLoop.

    Fields
    ------
    nl_query        : The original natural-language question.
    iteration       : Current loop iteration (1-indexed).
    tool_results    : Raw results from every tool call made so far.
    errors          : Validation / runtime errors encountered so far.
    sql_attempts    : All SQL strings attempted during the loop.
    final_sql       : The SQL that successfully executed (None until success).
    rows            : Result rows from the final successful execution.
    confidence      : 0.0–1.0 score computed after success.
    success         : True only when a SQL executed without error.
    started_at      : UTC timestamp when the loop began.
    finished_at     : UTC timestamp when the loop ended (set by finalize()).
    token_count     : Rough proxy for context size (sum of tool result lengths).
    """

    nl_query: str
    iteration: int = 0
    tool_results: list[dict[str, Any]] = field(default_factory=list)
    errors: list[dict[str, Any]] = field(default_factory=list)
    sql_attempts: list[str] = field(default_factory=list)
    final_sql: str | None = None
    rows: list[dict[str, Any]] = field(default_factory=list)
    confidence: float = 0.0
    success: bool = False
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: datetime | None = None
    token_count: int = 0

    # ── helpers ──────────────────────────────────────────────────────────────

    def add_error(self, kind: str, msg: str) -> None:
        """Record an error that occurred in the current iteration."""
        self.errors.append(
            {
                "kind": kind,
                "message": msg,
                "iteration": self.iteration,
            }
        )

    def finalize(self) -> None:
        """Mark the loop as done and compute token_count."""
        self.finished_at = datetime.now(timezone.utc)
        # Rough context-size proxy — sum of serialised tool result lengths
        self.token_count = sum(len(str(r)) for r in self.tool_results)

    def to_context_dict(self) -> dict[str, Any]:
        """
        Serialise state for injection into the next LLM prompt.
        Limits tool_results to the last 10 to avoid context explosion.
        """
        return {
            "nl_query": self.nl_query,
            "iteration": self.iteration,
            "tool_results": self.tool_results[-10:],
            "errors": self.errors,
            "sql_attempts": self.sql_attempts,
        }

    def error_context_text(self) -> str:
        """
        Render previous errors as a compact text block for prompt injection.
        Returns an empty string when there are no errors.
        """
        if not self.errors:
            return ""
        lines = ["PREVIOUS ERRORS (you must fix these in the new SQL):"]
        for err in self.errors:
            lines.append(
                f"  [Iteration {err['iteration']}] {err['kind'].upper()}: {err['message']}"
            )
        return "\n".join(lines)

    @property
    def correction_count(self) -> int:
        """Number of self-correction errors recorded."""
        return sum(1 for e in self.errors if e["kind"] == "validation")

    @property
    def runtime_error_count(self) -> int:
        """Number of runtime (DB execution) errors recorded."""
        return sum(1 for e in self.errors if e["kind"] == "runtime")
