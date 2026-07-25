"""
tests/evaluation/loader.py
───────────────────────────
Dataset loader & typing models for evaluation benchmark cases.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Optional


class ExecutionComparison(str, Enum):
    SET_MATCH = "set_match"
    ORDERED_MATCH = "ordered_match"
    SCALAR_MATCH = "scalar_match"
    NONE = "none"


@dataclass
class GroundTruth:
    canonical_sql: Optional[str] = None
    expected_tables: list[str] = field(default_factory=list)
    expected_columns: list[str] = field(default_factory=list)
    expected_tools: list[str] = field(default_factory=list)
    execution_comparison: ExecutionComparison = ExecutionComparison.SET_MATCH
    expected_row_count: Optional[int] = None
    expected_error_type: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> GroundTruth:
        exec_strategy = data.get("execution_comparison", "set_match")
        try:
            comparison = ExecutionComparison(exec_strategy)
        except ValueError:
            comparison = ExecutionComparison.SET_MATCH

        return cls(
            canonical_sql=data.get("canonical_sql"),
            expected_tables=data.get("expected_tables", []),
            expected_columns=data.get("expected_columns", []),
            expected_tools=data.get("expected_tools", []),
            execution_comparison=comparison,
            expected_row_count=data.get("expected_row_count"),
            expected_error_type=data.get("expected_error_type"),
        )


@dataclass
class EvalTestCase:
    id: str
    scenario: str
    nl_query: str
    db_id: str = "default"
    domain: str = "general"
    is_safe: bool = True
    difficulty: str = "medium"
    tags: list[str] = field(default_factory=list)
    ground_truth: GroundTruth = field(default_factory=GroundTruth)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> EvalTestCase:
        # Support legacy golden_set format seamlessly
        gt_data = data.get("ground_truth")
        if gt_data is None:
            # Fallback parsing for legacy records
            gt_data = {
                "canonical_sql": data.get("canonical_sql"),
                "expected_tables": data.get("expected_tables", []),
                "expected_columns": data.get("expected_columns", []),
                "expected_tools": data.get("expected_tools", []),
                "execution_comparison": "none" if not data.get("is_safe", True) else "set_match",
            }
            # Infer tables/columns from expected_keywords if expected_tables missing
            if not gt_data["expected_tables"] and "expected_keywords" in data:
                gt_data["expected_tables"] = [
                    kw for kw in data["expected_keywords"] if "." in kw or kw in ("farmers", "medicines", "orders")
                ]

        return cls(
            id=data["id"],
            scenario=data.get("scenario", ""),
            nl_query=data["nl_query"],
            db_id=data.get("db_id", "default"),
            domain=data.get("domain", "general"),
            is_safe=data.get("is_safe", True),
            difficulty=data.get("difficulty", "medium"),
            tags=data.get("tags", []),
            ground_truth=GroundTruth.from_dict(gt_data),
        )


class DatasetLoader:
    """Loads and validates evaluation datasets."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)

    def load(self) -> list[EvalTestCase]:
        if not self.path.exists():
            raise FileNotFoundError(f"Evaluation dataset not found at: {self.path}")

        with open(self.path, "r", encoding="utf-8") as f:
            raw_cases = json.load(f)

        cases = []
        for raw in raw_cases:
            cases.append(EvalTestCase.from_dict(raw))

        return cases
