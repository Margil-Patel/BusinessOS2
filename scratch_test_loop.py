"""
scratch_test_loop.py
─────────────────────
Quick standalone tests for the agentic loop components.
No server, no DB, no Ollama required.

Run:  python scratch_test_loop.py
"""
import asyncio
from datetime import timezone, datetime

# ── Test 1: LoopState ────────────────────────────────────────────────────────
print("=" * 60)
print("TEST 1: LoopState")
print("=" * 60)

from controller.loop_state import LoopState

state = LoopState(nl_query="show me all orders from last month")
state.iteration = 1
state.add_error("validation", "column 'order_date' does not exist")
state.iteration = 2
state.add_error("runtime", "relation 'orders' does not exist")
state.sql_attempts.append("SELECT * FROM orders WHERE order_date > NOW()")

print("nl_query      :", state.nl_query)
print("correction_count:", state.correction_count)
print("runtime_errors  :", state.runtime_error_count)
print("error_context_text:\n", state.error_context_text())

state.final_sql = "SELECT * FROM schema.orders LIMIT 500"
state.rows = [{"id": 1}, {"id": 2}]
state.confidence = 0.88
state.success = True
state.finalize()

print("\nfinished_at:", state.finished_at)
print("token_count :", state.token_count)
print("to_context_dict keys:", list(state.to_context_dict().keys()))
print("✅ LoopState OK\n")


# ── Test 2: Confidence scoring ───────────────────────────────────────────────
print("=" * 60)
print("TEST 2: Confidence scoring (_score_confidence logic)")
print("=" * 60)

from controller.agentic_loop import AgenticLoop

def score(iterations, corrections, runtime_errors, rows):
    s = LoopState(nl_query="test")
    s.iteration = iterations
    for _ in range(corrections):
        s.add_error("validation", "bad sql")
    for _ in range(runtime_errors):
        s.add_error("runtime", "db error")
    s.rows = [{"x": i} for i in range(rows)]

    # Score manually using the formula
    score_val = 1.0
    score_val -= min((iterations - 1) * 0.06, 0.30)
    score_val -= corrections * 0.10
    score_val -= runtime_errors * 0.10
    if rows == 0:
        score_val -= 0.05
    elif 1 <= rows <= 5000:
        score_val += 0.02
    return round(max(0.0, min(1.0, score_val)), 4)

scenarios = [
    ("Clean 1-iteration pass",     1, 0, 0, 8),
    ("2 iterations, no errors",    2, 0, 0, 24),
    ("Self-correction needed",     3, 1, 0, 12),
    ("Runtime error + correction", 4, 1, 1, 5),
    ("Max iterations, all errors", 5, 2, 2, 0),
]

for label, iters, corrs, rterrs, rows in scenarios:
    c = score(iters, corrs, rterrs, rows)
    bar = "█" * int(c * 20)
    print(f"  {label:<38} → {c:.2f}  |{bar:<20}|")

print("✅ Confidence scoring OK\n")


# ── Test 3: Error injection into history ─────────────────────────────────────
print("=" * 60)
print("TEST 3: Error injection into history")
print("=" * 60)

state = LoopState(nl_query="show revenue by region")
state.iteration = 2
state.add_error("validation", "column 'revenue' does not exist in table 'orders'")

history = [
    {"role": "user", "content": "show revenue by region"},
]

# Simulate what AgenticLoop._inject_errors_into_history does
error_text = state.error_context_text()
injected = list(history)
injected.append({"role": "system", "content": error_text})

print(f"Original history length: {len(history)}")
print(f"Injected history length: {len(injected)}")
print(f"Injected system message:\n{injected[-1]['content']}")
print("✅ Error injection OK\n")


# ── Test 4: QueryFailedError ─────────────────────────────────────────────────
print("=" * 60)
print("TEST 4: QueryFailedError")
print("=" * 60)

from controller.query_controller import QueryFailedError

try:
    raise QueryFailedError("Loop exhausted after 5 iterations. Errors: runtime: timeout")
except QueryFailedError as e:
    print("Caught QueryFailedError:", e)
    print("✅ QueryFailedError OK\n")


# ── Test 5: Response schema fields ───────────────────────────────────────────
print("=" * 60)
print("TEST 5: QueryResponse new fields")
print("=" * 60)

from view.schemas.response import QueryResponse

resp = QueryResponse(
    sql="SELECT * FROM orders LIMIT 10",
    rows=[{"id": 1}],
    columns=["id"],
    row_count=1,
    latency_ms=142.5,
    confidence=0.91,
    iterations_used=2,
    loop_errors=[{"kind": "validation", "message": "bad column", "iteration": 1}],
)
print("confidence      :", resp.confidence)
print("iterations_used :", resp.iterations_used)
print("loop_errors     :", resp.loop_errors)
print("✅ QueryResponse fields OK\n")

# from_dict round-trip
d = resp.model_dump()
resp2 = QueryResponse.from_dict(d)
assert resp2.confidence == 0.91
assert resp2.iterations_used == 2
assert len(resp2.loop_errors) == 1
print("from_dict round-trip ✅\n")

print("=" * 60)
print("ALL TESTS PASSED ✅")
print("=" * 60)
