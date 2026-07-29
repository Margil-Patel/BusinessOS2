"""
model/registry/loader.py
─────────────────────────
Introspects a live database and synchronises the TableRegistry.
Running sync() twice produces the same result (idempotent).
Descriptions from metadata.yaml override introspected ones.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

from model.db.connector import DatabaseConnector
from model.db.dialects import Dialect, detect_dialect, get_foreign_keys_query, get_tables_query
from model.registry.table_registry import ColumnMeta, TableMeta, TableRegistry

logger = logging.getLogger(__name__)

_METADATA_PATH = Path(__file__).parents[2] / "config" / "metadata.yaml"


class SchemaLoader:
    """
    Introspects a live DB and populates a TableRegistry.

    Usage:
        loader = SchemaLoader(connector, registry)
        await loader.sync()   # idempotent
    """

    def __init__(
        self,
        connector: DatabaseConnector,
        registry: TableRegistry,
        metadata_path: Path = _METADATA_PATH,
    ) -> None:
        self._connector = connector
        self._registry = registry
        self._metadata_path = metadata_path
        self._yaml_overrides: dict[str, Any] = {}

    # ── Public API ────────────────────────────────────────────────────────────

    async def sync(self) -> int:
        """
        Synchronise the registry with the live DB schema.
        Returns the number of tables registered.
        """
        logger.info("Starting schema sync...")
        self._load_yaml_overrides()

        engine = await self._connector.get_raw_engine()
        dialect = detect_dialect(str(engine.url))
        logger.info("Detected dialect: %s", dialect)

        tables_info = await self._list_tables(engine, dialect)
        logger.info("Found %d tables in DB", len(tables_info))

        # Mark existing tables as potentially inactive
        for t in self._registry.all_tables(active_only=False):
            t.is_active = False

        for schema_name, table_name in tables_info:
            table_meta = await self._build_table_meta(engine, table_name, schema_name, dialect)
            self._apply_yaml_overrides(table_meta)
            self._registry.add(table_meta)

        count = self._registry.count()
        logger.info("Schema sync complete: %d tables registered", count)
        return count

    # ── Private helpers ───────────────────────────────────────────────────────

    def _load_yaml_overrides(self) -> None:
        if not self._metadata_path.exists():
            logger.debug("metadata.yaml not found at %s, skipping", self._metadata_path)
            return
        with open(self._metadata_path, "r") as f:
            data = yaml.safe_load(f) or {}
        self._yaml_overrides = data.get("tables", {})
        logger.debug("Loaded YAML overrides for %d tables", len(self._yaml_overrides))

    async def _list_tables(self, engine: AsyncEngine, dialect: Dialect) -> list[tuple[str, str]]:
        sql = get_tables_query(dialect)
        async with engine.connect() as conn:
            result = await conn.execute(text(sql))
            rows = result.fetchall()
        return [(str(r[0]), str(r[1])) for r in rows]

    async def _build_table_meta(
        self, engine: AsyncEngine, table_name: str, schema_name: str, dialect: Dialect
    ) -> TableMeta:
        columns = await self._introspect_columns(engine, table_name, schema_name, dialect)
        return TableMeta(
            name=table_name,
            schema=schema_name,
            description="",
            domain_tags=[],
            columns=columns,
            is_active=True,
        )

    async def _introspect_columns(
        self, engine: AsyncEngine, table_name: str, schema_name: str, dialect: Dialect
    ) -> list[ColumnMeta]:
        """Use SQLAlchemy's synchronous inspect() via run_sync for reliability."""
        cols: list[ColumnMeta] = []

        def _do_inspect(sync_conn: Any) -> list[ColumnMeta]:
            insp = inspect(sync_conn)
            raw_cols = insp.get_columns(table_name, schema=schema_name)
            pk_cols = set(insp.get_pk_constraint(table_name, schema=schema_name).get("constrained_columns", []))
            
            # Fetch indexes to check has_index
            index_cols = set()
            try:
                for idx in insp.get_indexes(table_name, schema=schema_name):
                    for col_name in idx.get("column_names", []):
                        if col_name:
                            index_cols.add(col_name)
            except Exception:
                pass

            # Fetch unique constraints
            unique_cols = set()
            try:
                for uq in insp.get_unique_constraints(table_name, schema=schema_name):
                    for col_name in uq.get("column_names", []):
                        if col_name:
                            unique_cols.add(col_name)
            except Exception:
                pass

            # Fetch check constraints
            check_map = {}
            try:
                for c in insp.get_check_constraints(table_name, schema=schema_name):
                    sql_text = c.get("sqltext", "")
                    if sql_text:
                        clean_sql = sql_text.strip("()")
                        # Match columns
                        for col in raw_cols:
                            col_name = col["name"]
                            if re.search(rf'\b{col_name}\b', clean_sql) or f'"{col_name}"' in clean_sql:
                                check_map[col_name] = clean_sql
            except Exception:
                pass

            fk_map: dict[str, dict[str, str]] = {}
            for fk in insp.get_foreign_keys(table_name, schema=schema_name):
                ref_tbl = fk.get("referred_table", "")
                ref_schema = fk.get("referred_schema") or schema_name
                ref_fqn = f"{ref_schema}.{ref_tbl}" if ref_schema else ref_tbl
                for local_col, ref_col in zip(
                    fk.get("constrained_columns", []),
                    fk.get("referred_columns", []),
                ):
                    fk_map[local_col] = {
                        "table": ref_fqn,
                        "column": ref_col,
                    }
            result = []
            for col in raw_cols:
                name = col["name"]
                fk_info = fk_map.get(name, {})
                result.append(
                    ColumnMeta(
                        name=name,
                        data_type=str(col.get("type", "unknown")),
                        nullable=col.get("nullable", True),
                        is_primary_key=name in pk_cols,
                        is_unique=name in unique_cols,
                        is_foreign_key=bool(fk_info),
                        foreign_table=fk_info.get("table"),
                        foreign_column=fk_info.get("column"),
                        default_value=str(col.get("default")) if col.get("default") is not None else None,
                        check_constraint=check_map.get(name),
                        has_index=name in index_cols,
                    )
                )
            return result

        try:
            async with engine.connect() as conn:
                cols = await conn.run_sync(_do_inspect)
        except Exception as exc:
            logger.warning("Column introspection failed for %s.%s: %s", schema_name, table_name, exc)

        return cols

    def _apply_yaml_overrides(self, table: TableMeta) -> None:
        """Merge metadata.yaml descriptions into a TableMeta (in-place)."""
        override = self._yaml_overrides.get(table.name, {})
        if not override:
            return

        if desc := override.get("description"):
            table.description = desc
        if tags := override.get("domain_tags"):
            table.domain_tags = list(tags)

        col_overrides: dict[str, Any] = override.get("columns", {})
        for col in table.columns:
            col_data = col_overrides.get(col.name, {})
            if col_data.get("description"):
                col.description = col_data["description"]
            if col_data.get("synonyms"):
                col.synonyms = list(col_data["synonyms"])
