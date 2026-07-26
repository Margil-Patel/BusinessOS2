"""
tests/evaluation/evaluators/tools.py
──────────────────────────────────────
Evaluator for Tool Usage & Agent Efficiency (Jaccard similarity, turn counts).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


@dataclass
class ToolScore:
    jaccard_score: float
    tool_precision: float
    tool_recall: float
    invoked_tools: list[str]
    expected_tools: list[str]
    agent_rounds: int


class ToolEvaluator:
    """Evaluates agent tool usage trace against expected tool sequence."""

    def evaluate(self, tool_trace: Sequence[dict | str], expected_tools: Sequence[str], agent_rounds: int = 1) -> ToolScore:
        # Extract tool names from trace if trace contains dict objects
        invoked_names: list[str] = []
        for item in tool_trace:
            if isinstance(item, dict):
                name = item.get("tool") or item.get("name") or item.get("tool_name")
                if name:
                    invoked_names.append(str(name).lower())
            elif isinstance(item, str):
                invoked_names.append(item.lower())

        exp_names = [t.lower() for t in expected_tools]

        if not exp_names:
            score = 1.0 if not invoked_names else 0.5
            return ToolScore(
                jaccard_score=score,
                tool_precision=score,
                tool_recall=score,
                invoked_tools=invoked_names,
                expected_tools=exp_names,
                agent_rounds=agent_rounds,
            )

        inv_set = set(invoked_names)
        exp_set = set(exp_names)

        intersection = inv_set.intersection(exp_set)
        union = inv_set.union(exp_set)

        jaccard = len(intersection) / len(union) if union else 1.0
        precision = len(intersection) / len(inv_set) if inv_set else 0.0
        recall = len(intersection) / len(exp_set) if exp_set else 0.0

        return ToolScore(
            jaccard_score=round(jaccard, 4),
            tool_precision=round(precision, 4),
            tool_recall=round(recall, 4),
            invoked_tools=invoked_names,
            expected_tools=exp_names,
            agent_rounds=agent_rounds,
        )
