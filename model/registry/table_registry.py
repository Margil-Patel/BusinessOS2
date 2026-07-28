"""
model/registry/table_registry.py
──────────────────────────────────
Core data structures for the metadata layer.

TableMeta and ColumnMeta are the canonical representations of schema knowledge.
TableRegistry is the in-memory store that the controller reads through ModelFacade.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class ColumnMeta:
    """Metadata for a single database column."""

    name: str
    data_type: str
    nullable: bool = True
    is_primary_key: bool = False
    is_foreign_key: bool = False
    foreign_table: str | None = None
    foreign_column: str | None = None
    description: str = ""
    synonyms: list[str] = field(default_factory=list)
    default_value: str | None = None
    check_constraint: str | None = None
    has_index: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "type": self.data_type,
            "nullable": self.nullable,
            "is_pk": self.is_primary_key,
            "is_fk": self.is_foreign_key,
            "foreign_table": self.foreign_table,
            "foreign_column": self.foreign_column,
            "description": self.description,
            "synonyms": self.synonyms,
            "default_value": self.default_value,
            "check_constraint": self.check_constraint,
            "has_index": self.has_index,
        }


@dataclass
class TableMeta:
    """Metadata for a single database table."""

    name: str
    schema: str = "public"
    description: str = ""
    domain_tags: list[str] = field(default_factory=list)
    columns: list[ColumnMeta] = field(default_factory=list)
    row_count_approx: int | None = None
    is_active: bool = True

    @property
    def qualified_name(self) -> str:
        """Schema-qualified table name, e.g. 'public.orders'."""
        return f"{self.schema}.{self.name}"

    @property
    def embedding_text(self) -> str:
        """
        Rich text representation used to build the semantic search embedding.
        Includes table name, description, domain tags, and column summaries.
        """
        col_lines = []
        for col in self.columns:
            desc = f" — {col.description}" if col.description else ""
            fk = f" (FK → {col.foreign_table}.{col.foreign_column})" if col.is_foreign_key else ""
            pk = " (PK)" if col.is_primary_key else ""
            col_lines.append(f"  {col.name} [{col.data_type}]{pk}{fk}{desc}")

        tags = ", ".join(self.domain_tags) if self.domain_tags else "general"
        cols_text = "\n".join(col_lines) if col_lines else "  (no columns)"

        return (
            f"Table: {self.qualified_name}\n"
            f"Description: {self.description or 'No description'}\n"
            f"Domain: {tags}\n"
            f"Columns:\n{cols_text}"
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "schema": self.schema,
            "qualified_name": self.qualified_name,
            "description": self.description,
            "domain_tags": self.domain_tags,
            "columns": [c.to_dict() for c in self.columns],
            "row_count_approx": self.row_count_approx,
            "is_active": self.is_active,
        }

    def get_column(self, name: str) -> ColumnMeta | None:
        for col in self.columns:
            if col.name.lower() == name.lower():
                return col
        return None


class TableRegistry:
    """
    In-memory registry of all known tables and their metadata.

    The registry is populated by SchemaLoader.sync() and then queried
    by the controller through ModelFacade. All access is synchronous
    (no DB calls) after initial load.
    """

    def __init__(self) -> None:
        self._tables: dict[str, TableMeta] = {}  # key = qualified_name

    # ── CRUD ──────────────────────────────────────────────────────────────────

    def add(self, table: TableMeta) -> None:
        self._tables[table.qualified_name] = table
        logger.debug("Registered table: %s", table.qualified_name)

    def get(self, qualified_name: str) -> TableMeta | None:
        # Try exact match first, then case-insensitive
        if qualified_name in self._tables:
            return self._tables[qualified_name]
        lower = qualified_name.lower()
        for k, v in self._tables.items():
            if k.lower() == lower:
                return v
        return None

    def get_by_name(self, name: str) -> TableMeta | None:
        """Look up by unqualified table name."""
        for table in self._tables.values():
            if table.name.lower() == name.lower():
                return table
        return None

    def remove(self, qualified_name: str) -> None:
        self._tables.pop(qualified_name, None)

    def mark_inactive(self, qualified_name: str) -> None:
        if t := self.get(qualified_name):
            t.is_active = False

    def all_tables(self, active_only: bool = True) -> list[TableMeta]:
        if active_only:
            return [t for t in self._tables.values() if t.is_active]
        return list(self._tables.values())

    def count(self) -> int:
        return len(self._tables)

    # ── Column access ─────────────────────────────────────────────────────────

    def get_columns(self, table_names: list[str]) -> dict[str, Any]:
        """
        Return schema context for the given list of table names.
        table_names may be qualified ("schema.table") or unqualified.
        Returns: {"table_name": {"description": ..., "columns": [...]}}
        """
        result: dict[str, Any] = {}
        for name in table_names:
            table = self.get(name) or self.get_by_name(name)
            if table:
                result[table.qualified_name] = table.to_dict()
            else:
                logger.warning("get_columns: table not found: %s", name)
        return result

    def __repr__(self) -> str:
        return f"<TableRegistry tables={self.count()}>"
