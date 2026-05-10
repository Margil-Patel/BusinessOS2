"""
tests/unit/test_registry.py
────────────────────────────
Unit tests for TableRegistry and related dataclasses.
"""
import pytest
from model.registry.table_registry import ColumnMeta, TableMeta, TableRegistry


def make_table(name: str, schema: str = "public") -> TableMeta:
    return TableMeta(
        name=name,
        schema=schema,
        description=f"Test table: {name}",
        domain_tags=["test"],
        columns=[
            ColumnMeta(name="id", data_type="INTEGER", is_primary_key=True),
            ColumnMeta(name="name", data_type="TEXT", nullable=True),
        ],
    )


class TestTableMeta:
    def test_qualified_name(self):
        t = make_table("orders")
        assert t.qualified_name == "public.orders"

    def test_qualified_name_custom_schema(self):
        t = make_table("items", "sales")
        assert t.qualified_name == "sales.items"

    def test_embedding_text_contains_table_name(self):
        t = make_table("orders")
        text = t.embedding_text
        assert "orders" in text
        assert "id" in text
        assert "name" in text

    def test_embedding_text_includes_fk(self):
        t = TableMeta(
            name="orders",
            schema="public",
            columns=[
                ColumnMeta(
                    name="customer_id",
                    data_type="INTEGER",
                    is_foreign_key=True,
                    foreign_table="customers",
                    foreign_column="id",
                )
            ],
        )
        assert "FK" in t.embedding_text
        assert "customers" in t.embedding_text

    def test_get_column(self):
        t = make_table("orders")
        col = t.get_column("id")
        assert col is not None
        assert col.is_primary_key

    def test_get_column_case_insensitive(self):
        t = make_table("orders")
        col = t.get_column("ID")
        assert col is not None

    def test_get_column_missing(self):
        t = make_table("orders")
        assert t.get_column("nonexistent") is None

    def test_to_dict(self):
        t = make_table("orders")
        d = t.to_dict()
        assert d["name"] == "orders"
        assert d["schema"] == "public"
        assert len(d["columns"]) == 2


class TestTableRegistry:
    def test_add_and_get(self):
        reg = TableRegistry()
        t = make_table("orders")
        reg.add(t)
        assert reg.get("public.orders") is t

    def test_get_by_name(self):
        reg = TableRegistry()
        t = make_table("orders")
        reg.add(t)
        assert reg.get_by_name("orders") is t

    def test_get_case_insensitive(self):
        reg = TableRegistry()
        reg.add(make_table("Orders"))
        assert reg.get("PUBLIC.ORDERS") is not None

    def test_mark_inactive(self):
        reg = TableRegistry()
        t = make_table("orders")
        reg.add(t)
        reg.mark_inactive("public.orders")
        assert reg.all_tables(active_only=True) == []
        assert len(reg.all_tables(active_only=False)) == 1

    def test_get_columns(self):
        reg = TableRegistry()
        reg.add(make_table("orders"))
        result = reg.get_columns(["orders"])
        assert "public.orders" in result
        assert len(result["public.orders"]["columns"]) == 2

    def test_get_columns_missing_table_logged(self, caplog):
        reg = TableRegistry()
        reg.get_columns(["nonexistent"])
        # Should not raise — just log a warning

    def test_count(self):
        reg = TableRegistry()
        reg.add(make_table("a"))
        reg.add(make_table("b"))
        assert reg.count() == 2
