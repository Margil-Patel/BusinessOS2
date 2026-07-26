"""
tests/evaluation/runner.py
───────────────────────────
CLI Benchmark Runner for NL→SQL Evaluation Engine.
Usage:
    python -m tests.evaluation.runner [--dataset PATH] [--output PATH] [--min-accuracy 0.85]
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).parents[2]))

from config.settings import get_settings
from controller.query_controller import QueryController
from model.facade import ModelFacade
from tests.evaluation.evaluators.execution import ExecutionEvaluator
from tests.evaluation.evaluators.retrieval import RetrievalEvaluator
from tests.evaluation.evaluators.sql_ast import SQLASTEvaluator
from tests.evaluation.evaluators.tools import ToolEvaluator
from tests.evaluation.loader import DatasetLoader, EvalTestCase
from tests.evaluation.reporter import ReportGenerator
from tests.evaluation.scoring import CaseEvalResult, ScoreCalculator

DEFAULT_DATASET = Path(__file__).parents[1] / "golden" / "golden_set.json"
DEFAULT_OUTPUT = Path(__file__).parents[2] / "evaluation_report.json"


async def evaluate_single_case(
    ctrl: QueryController,
    case: EvalTestCase,
    retrieval_eval: RetrievalEvaluator,
    tool_eval: ToolEvaluator,
    ast_eval: SQLASTEvaluator,
    exec_eval: ExecutionEvaluator,
    score_calc: ScoreCalculator,
) -> CaseEvalResult:
    start_time = time.monotonic()
    generated_sql: str | None = None
    error_msg: str | None = None
    tool_trace: list = []
    retrieved_tables: list[str] = []
    agent_rounds: int = 1
    generated_rows: list = []
    expected_rows: list = []
    exec_err: str | None = None

    try:
        # Step 1: Run query controller
        res = await ctrl.handle(case.nl_query, db_id=case.db_id)
        latency_ms = (time.monotonic() - start_time) * 1000

        if res.get("error"):
            error_msg = str(res["error"])
        
        generated_sql = res.get("sql")
        
        # Extract trace & context details from ResultFormatter response dictionary ("trace")
        trace = res.get("trace", {})
        if trace:
            retrieved_tables = trace.get("tables_used", [])
            tool_trace = trace.get("tool_calls", [])
            agent_rounds = trace.get("rounds_used", 1)

        generated_rows = res.get("rows", [])

        # Step 2: Evaluate retrieval & tools with AST fallback
        ret_score = retrieval_eval.evaluate(
            retrieved_tables, case.ground_truth.expected_tables, generated_sql=generated_sql
        )
        tool_score = tool_eval.evaluate(
            tool_trace, case.ground_truth.expected_tools, agent_rounds=agent_rounds
        )

        # Step 3: Evaluate SQL AST
        ast_score = ast_eval.evaluate(generated_sql, case.ground_truth.canonical_sql)

        # Step 4: Execute Canonical SQL for ground-truth rows if safe
        if case.is_safe and case.ground_truth.canonical_sql and not error_msg:
            try:
                expected_rows = await ctrl._model.db.execute(case.ground_truth.canonical_sql)
            except Exception as e:
                exec_err = f"Canonical SQL execution error: {e}"

        # Step 5: Evaluate execution match with key-column subset projection
        execution_score = exec_eval.evaluate_results(
            generated_rows,
            expected_rows,
            strategy=case.ground_truth.execution_comparison,
            execution_error=exec_err or error_msg,
        )

        # Step 6: Calculate composite score & failure reason
        return score_calc.calculate(
            case=case,
            retrieval=ret_score,
            tool=tool_score,
            ast=ast_score,
            execution=execution_score,
            latency_ms=latency_ms,
            generated_sql=generated_sql,
            error_message=error_msg,
        )

    except Exception as exc:
        latency_ms = (time.monotonic() - start_time) * 1000
        ret_score = retrieval_eval.evaluate([], case.ground_truth.expected_tables)
        tool_score = tool_eval.evaluate([], case.ground_truth.expected_tools)
        ast_score = ast_eval.evaluate(None, case.ground_truth.canonical_sql)
        execution_score = exec_eval.evaluate_results([], [], execution_error=str(exc))

        return score_calc.calculate(
            case=case,
            retrieval=ret_score,
            tool=tool_score,
            ast=ast_score,
            execution=execution_score,
            latency_ms=latency_ms,
            generated_sql=None,
            error_message=str(exc),
        )


async def run_evaluation(
    dataset_path: Path = DEFAULT_DATASET,
    output_path: Path = DEFAULT_OUTPUT,
    baseline_path: Path | None = None,
    min_accuracy: float = 0.85,
    verbose: bool = False,
) -> bool:
    print(f"============================================================")
    print(f"STARTING EVALUATION RUN: {dataset_path}")
    print(f"============================================================")

    start_run_time = time.monotonic()
    loader = DatasetLoader(dataset_path)
    cases = loader.load()

    settings = get_settings()
    model = ModelFacade(settings)
    await model.startup()

    try:
        await model.sync_schema()
    except Exception as e:
        print(f"[WARNING] Schema sync warning: {e}")

    ctrl = QueryController(model, settings)

    retrieval_eval = RetrievalEvaluator()
    tool_eval = ToolEvaluator()
    ast_eval = SQLASTEvaluator()
    exec_eval = ExecutionEvaluator()
    score_calc = ScoreCalculator()

    results: list[CaseEvalResult] = []

    for case in cases:
        print(f"  [{case.id}] {case.nl_query[:50]}...", end=" ", flush=True)
        res = await evaluate_single_case(
            ctrl, case, retrieval_eval, tool_eval, ast_eval, exec_eval, score_calc
        )
        results.append(res)
        status_tag = "[PASS]" if res.status == "PASS" else "[FAIL]"
        reason_info = f" ({res.failure_reason})" if res.failure_reason != "NONE" else ""
        print(f"{status_tag} Score: {res.composite_score:.2f} | Latency: {res.latency_ms:.0f}ms{reason_info}")

        if verbose and res.status != "PASS":
            print(f"     -> Error/SQL: {res.error_message or res.generated_sql}")

    await model.shutdown()
    total_duration = time.monotonic() - start_run_time

    # Generate JSON report
    reporter = ReportGenerator(
        results=results,
        total_duration_seconds=total_duration,
        model_name=getattr(settings, "ollama_model", "qwen2.5:7b"),
        baseline_path=baseline_path,
    )
    report = reporter.save(output_path)

    exec_acc = report["summary"]["metrics"]["execution_accuracy"]
    is_regression = report["summary"]["regression_status"]["is_regression"]

    print(f"\n============================================================")
    print(f"EVALUATION SUMMARY")
    print(f"Total Cases: {report['summary']['total_cases']}")
    print(f"Execution Accuracy: {exec_acc:.1%}")
    print(f"SQL Validity Rate: {report['summary']['metrics']['sql_validity_rate']:.1%}")
    print(f"Safety Pass Rate: {report['summary']['metrics']['safety_pass_rate']:.1%}")
    print(f"Retrieval F1 Score: {report['summary']['metrics']['retrieval_f1']:.2f}")
    print(f"Report JSON saved to: {output_path}")
    print(f"============================================================")

    if exec_acc < min_accuracy:
        print(f"[FAIL] Execution accuracy {exec_acc:.1%} is below minimum gate {min_accuracy:.1%}")
        return False
    elif is_regression:
        print(f"[FAIL] Regression detected compared to baseline!")
        return False
    else:
        print(f"[PASS] Evaluation passed all quality gates!")
        return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NL2SQL Evaluation Benchmark Runner")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--baseline", type=Path, default=None)
    parser.add_argument("--min-accuracy", type=float, default=0.85)
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    success = asyncio.run(
        run_evaluation(
            dataset_path=args.dataset,
            output_path=args.output,
            baseline_path=args.baseline,
            min_accuracy=args.min_accuracy,
            verbose=args.verbose,
        )
    )
    sys.exit(0 if success else 1)
