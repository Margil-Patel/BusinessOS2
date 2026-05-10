"""
tests/unit/test_validator.py
─────────────────────────────
Unit tests for SQLValidator — safety and syntax checks.
"""
import pytest
from controller.sql_validator import SQLValidationError, SQLValidator, UnsafeQueryError


@pytest.fixture
def validator():
    return SQLValidator()


class TestSQLValidator:
    # ── Safe queries ──────────────────────────────────────────────────────────
    def test_valid_select(self, validator):
        validator.check("SELECT * FROM public.orders LIMIT 10")

    def test_valid_select_with_join(self, validator):
        validator.check(
            "SELECT o.id, c.name FROM public.orders o JOIN public.customers c ON o.customer_id = c.id"
        )

    def test_valid_cte(self, validator):
        validator.check("WITH ranked AS (SELECT * FROM public.products) SELECT * FROM ranked")

    def test_valid_aggregation(self, validator):
        validator.check(
            "SELECT COUNT(*), SUM(total_amount) FROM public.orders WHERE status = 'completed'"
        )

    # ── Blocked statements ────────────────────────────────────────────────────
    def test_blocks_drop(self, validator):
        with pytest.raises(UnsafeQueryError):
            validator.check("DROP TABLE public.orders")

    def test_blocks_delete(self, validator):
        with pytest.raises(UnsafeQueryError):
            validator.check("DELETE FROM public.orders WHERE id = 1")

    def test_blocks_truncate(self, validator):
        with pytest.raises(UnsafeQueryError):
            validator.check("TRUNCATE TABLE public.orders")

    def test_blocks_update(self, validator):
        with pytest.raises(UnsafeQueryError):
            validator.check("UPDATE public.orders SET status = 'cancelled'")

    def test_blocks_insert(self, validator):
        with pytest.raises(UnsafeQueryError):
            validator.check("INSERT INTO public.orders (status) VALUES ('pending')")

    def test_blocks_alter(self, validator):
        with pytest.raises(UnsafeQueryError):
            validator.check("ALTER TABLE public.orders ADD COLUMN foo TEXT")

    def test_blocks_create(self, validator):
        with pytest.raises(UnsafeQueryError):
            validator.check("CREATE TABLE bad_table (id INTEGER)")

    # ── Injection patterns ────────────────────────────────────────────────────
    def test_blocks_semicolon_injection(self, validator):
        with pytest.raises(UnsafeQueryError):
            validator.check("SELECT * FROM orders; DROP TABLE orders")

    # ── Empty / malformed ─────────────────────────────────────────────────────
    def test_rejects_empty(self, validator):
        with pytest.raises(SQLValidationError):
            validator.check("")

    def test_rejects_whitespace(self, validator):
        with pytest.raises(SQLValidationError):
            validator.check("   ")

    def test_rejects_non_select(self, validator):
        with pytest.raises(SQLValidationError):
            validator.check("SHOW TABLES")
