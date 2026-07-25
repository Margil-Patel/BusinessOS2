"""
tests/evaluation/reporter.py
────────────────────────────
Reporter module for aggregating results, generating structured JSON evaluation reports,
and evaluating regression thresholds.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Sequence

from tests.evaluation.scoring import CaseEvalResult


class ReportGenerator:
    """Aggregates case results into a structured JSON report matching design doc schema."""

    def __init__(
        self,
        results: Sequence[CaseEvalResult],
        total_duration_seconds: float,
        model_name: str = "qwen2.5:7b",
        git_commit: str = "local-dev",
        baseline_path: Optional[Path | str] = None,
    ) -> None:
        self.results = list(results)
        self.total_duration_seconds = total_duration_seconds
        self.model_name = model_name
        self.git_commit = git_commit
        self.baseline_path = Path(baseline_path) if baseline_path else None

    def generate(self) -> dict:
        total_cases = len(self.results)
        passed_cases = sum(1 for r in self.results if r.status == "PASS")
        failed_cases = total_cases - passed_cases

        safe_cases = [r for r in self.results if r.is_safe]
        unsafe_cases = [r for r in self.results if not r.is_safe]

        exec_accuracy = (
            sum(1 for r in safe_cases if r.execution_score.passed) / len(safe_cases)
            if safe_cases
            else 1.0
        )
        sql_validity = (
            sum(1 for r in safe_cases if r.ast_score.is_valid_syntax) / len(safe_cases)
            if safe_cases
            else 1.0
        )
        safety_pass_rate = (
            sum(1 for r in unsafe_cases if r.status == "PASS") / len(unsafe_cases)
            if unsafe_cases
            else 1.0
        )
        retrieval_f1 = (
            sum(r.retrieval_score.composite_f1 for r in self.results) / total_cases
            if total_cases
            else 0.0
        )
        tool_precision = (
            sum(r.tool_score.tool_precision for r in self.results) / total_cases
            if total_cases
            else 0.0
        )
        avg_agent_rounds = (
            sum(r.tool_score.agent_rounds for r in self.results) / total_cases
            if total_cases
            else 0.0
        )

        latencies = sorted(r.latency_ms for r in self.results)
        p50 = latencies[int(len(latencies) * 0.5)] if latencies else 0.0
        p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0.0

        avg_composite = (
            sum(r.composite_score for r in self.results) / total_cases
            if total_cases
            else 0.0
        )

        # Domain breakdown
        domains: dict[str, dict] = {}
        for r in self.results:
            d = r.domain
            if d not in domains:
                domains[d] = {"total": 0, "passed": 0, "execution_accuracy": 0.0, "retrieval_f1": 0.0}
            domains[d]["total"] += 1
            if r.status == "PASS":
                domains[d]["passed"] += 1

        for d, stats in domains.items():
            d_cases = [r for r in self.results if r.domain == d]
            d_safe = [r for r in d_cases if r.is_safe]
            stats["execution_accuracy"] = round(
                sum(1 for r in d_safe if r.execution_score.passed) / max(len(d_safe), 1), 4
            )
            stats["retrieval_f1"] = round(
                sum(r.retrieval_score.composite_f1 for r in d_cases) / max(len(d_cases), 1), 4
            )

        # Baseline comparison / regression detection
        regression_status = self._check_regression(exec_accuracy)

        report = {
            "metadata": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "git_commit": self.git_commit,
                "git_branch": "main",
                "environment": "evaluation",
                "llm_model": self.model_name,
                "total_duration_seconds": round(self.total_duration_seconds, 2),
            },
            "summary": {
                "total_cases": total_cases,
                "passed_cases": passed_cases,
                "failed_cases": failed_cases,
                "composite_score": round(avg_composite, 4),
                "metrics": {
                    "execution_accuracy": round(exec_accuracy, 4),
                    "sql_validity_rate": round(sql_validity, 4),
                    "safety_pass_rate": round(safety_pass_rate, 4),
                    "retrieval_f1": round(retrieval_f1, 4),
                    "tool_precision": round(tool_precision, 4),
                    "avg_agent_rounds": round(avg_agent_rounds, 2),
                    "latency_p50_ms": round(p50, 2),
                    "latency_p95_ms": round(p95, 2),
                },
                "regression_status": regression_status,
            },
            "domain_breakdown": domains,
            "results": [r.to_dict() for r in self.results],
        }
        return report

    def _check_regression(self, current_accuracy: float) -> dict:
        if not self.baseline_path or not self.baseline_path.exists():
            return {
                "is_regression": False,
                "baseline_commit": "none",
                "execution_accuracy_delta": 0.0,
                "newly_failing_cases": [],
            }

        try:
            with open(self.baseline_path, "r", encoding="utf-8") as f:
                base_data = json.load(f)
            base_acc = base_data.get("summary", {}).get("metrics", {}).get("execution_accuracy", 0.0)
            base_commit = base_data.get("metadata", {}).get("git_commit", "unknown")

            base_results = {r["id"]: r["status"] for r in base_data.get("results", [])}
            newly_failing = [
                r.case_id for r in self.results if r.status == "FAIL" and base_results.get(r.case_id) == "PASS"
            ]

            delta = current_accuracy - base_acc
            is_regression = delta < -0.01 or len(newly_failing) > 0

            return {
                "is_regression": is_regression,
                "baseline_commit": base_commit,
                "execution_accuracy_delta": round(delta, 4),
                "newly_failing_cases": newly_failing,
            }
        except Exception:
            return {
                "is_regression": False,
                "baseline_commit": "invalid_file",
                "execution_accuracy_delta": 0.0,
                "newly_failing_cases": [],
            }

    def save(self, output_path: Path | str) -> dict:
        report = self.generate()
        out_p = Path(output_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        with open(out_p, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        return report
