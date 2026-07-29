"""
controller/data_service.py
──────────────────────────
Generic DML service for reading and writing data to any Business OS PostgreSQL table.

Design rules:
  1. No table names are ever hardcoded.
  2. All user-supplied values are bound through SQLAlchemy :param placeholders.
  3. Table/column identifiers pass regex validation before interpolation.
  4. All write operations execute inside a single PostgreSQL transaction
     and roll back atomically on any failure.
  5. No business logic lives in API routes — only in this service.
"""

from __future__ import annotations

import logging
import re
from typing import Any, TYPE_CHECKING

from sqlalchemy import text

if TYPE_CHECKING:
    from model.facade import ModelFacade

logger = logging.getLogger(__name__)

# ── Identifier safety ─────────────────────────────────────────────────────────
_IDENT_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

# Maximum rows allowed per request to prevent accidental memory exhaustion
MAX_INSERT_ROWS = 500
MAX_UPDATE_ROWS = 500
MAX_DELETE_IDS  = 1000
MAX_PAGE_SIZE   = 1000


class DataServiceError(Exception):
    """Raised for validation or execution errors inside DataService."""


class DataService:
    """
    Generic DML service — the only layer allowed to perform SELECT/INSERT/UPDATE/DELETE
    on application tables.

    Instantiated once and stored on ``app.state.data_service``.
    """

    def __init__(self, model: "ModelFacade") -> None:
        self.model = model

    # ── Internal validators ───────────────────────────────────────────────────

    def _parse_and_validate_fqn(self, fqn: str) -> tuple[str, str]:
        """
        Parse ``schema.table`` or bare ``table`` into (schema, table).
        Both parts must satisfy ``^[a-zA-Z_][a-zA-Z0-9_]*$``.
        """
        if not fqn:
            raise DataServiceError("Table name (FQN) cannot be empty")
        parts = fqn.split(".")
        if len(parts) > 2:
            raise DataServiceError(f"Invalid FQN format (too many dots): {fqn!r}")
        for part in parts:
            if not _IDENT_RE.match(part):
                raise DataServiceError(f"Unsafe identifier in FQN: {part!r}")
        schema = parts[0] if len(parts) > 1 else "public"
        table  = parts[-1]
        return schema, table

    def _validate_column_name(self, name: str) -> None:
        """Reject any column name that is not a safe PostgreSQL identifier."""
        if not name:
            raise DataServiceError("Column name cannot be empty")
        if not _IDENT_RE.match(name):
            raise DataServiceError(f"Unsafe column name: {name!r}")

    def _validate_row_columns(self, row: dict[str, Any]) -> None:
        """Validate all keys of a row dict as safe column names."""
        for col in row:
            self._validate_column_name(col)

    @staticmethod
    def _coerce_param_val(val: Any) -> Any:
        """
        Coerce string parameters representing whole integers or floating point numbers
        to native Python int/float types to satisfy database drivers like asyncpg.
        """
        if isinstance(val, str):
            v = val.strip()
            if not v:
                return None
            if v.isdigit() or (v.startswith('-') and v[1:].isdigit()):
                try:
                    return int(v)
                except ValueError:
                    pass
            if '.' in v:
                try:
                    return float(v)
                except ValueError:
                    pass
        return val

    # ── Schema introspection ──────────────────────────────────────────────────

    async def get_table_schema(self, fqn: str) -> dict[str, Any]:
        """
        Introspect ``information_schema`` to return full column metadata for the table.

        Returns
        -------
        {
            "fqn": "schema.table",
            "columns": [
                {
                    "name": str,
                    "data_type": str,
                    "nullable": bool,
                    "default_value": str | None,
                    "is_primary_key": bool,
                    "foreign_key_table": str | None,
                    "foreign_key_column": str | None,
                }
            ]
        }
        """
        schema, table = self._parse_and_validate_fqn(fqn)

        col_sql = text("""
            SELECT
                c.column_name,
                c.data_type,
                c.is_nullable,
                c.column_default
            FROM information_schema.columns c
            WHERE c.table_schema = :schema
              AND c.table_name   = :table
            ORDER BY c.ordinal_position
        """)

        pk_sql = text("""
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema    = :schema
              AND tc.table_name      = :table
        """)

        uq_sql = text("""
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'UNIQUE'
              AND tc.table_schema    = :schema
              AND tc.table_name      = :table
        """)

        fk_sql = text("""
            SELECT
                kcu.column_name,
                ccu.table_schema || '.' || ccu.table_name AS foreign_table,
                ccu.column_name                            AS foreign_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name
             AND ccu.table_schema    = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema    = :schema
              AND tc.table_name      = :table
        """)

        params = {"schema": schema, "table": table}

        async with self.model.db.session() as sess:
            col_rows = (await sess.execute(col_sql, params)).fetchall()
            pk_rows  = (await sess.execute(pk_sql,  params)).fetchall()
            uq_rows  = (await sess.execute(uq_sql,  params)).fetchall()
            fk_rows  = (await sess.execute(fk_sql,  params)).fetchall()

        if not col_rows:
            raise DataServiceError(
                f"Table {fqn!r} not found or has no columns in information_schema"
            )

        pk_cols = {r[0] for r in pk_rows}
        uq_cols = {r[0] for r in uq_rows}
        fk_map: dict[str, dict[str, str]] = {
            r[0]: {"table": r[1], "column": r[2]} for r in fk_rows
        }

        columns = []
        for row in col_rows:
            col_name = row[0]
            fk_info  = fk_map.get(col_name, {})
            columns.append({
                "name":               col_name,
                "data_type":          row[1],
                "nullable":           row[2] == "YES",
                "default_value":      row[3],
                "is_primary_key":     col_name in pk_cols,
                "is_unique":          col_name in uq_cols,
                "foreign_key_table":  fk_info.get("table"),
                "foreign_key_column": fk_info.get("column"),
            })

        return {"fqn": fqn, "columns": columns}

    # ── Row retrieval ─────────────────────────────────────────────────────────

    async def get_table_rows(
        self,
        fqn: str,
        page: int = 1,
        page_size: int = 50,
    ) -> dict[str, Any]:
        """
        Return paginated rows from the table.

        Parameters
        ----------
        fqn       : fully qualified table name (``schema.table``)
        page      : 1-indexed page number
        page_size : rows per page (capped at MAX_PAGE_SIZE)
        """
        schema, table = self._parse_and_validate_fqn(fqn)

        if page < 1:
            raise DataServiceError("page must be >= 1")
        page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
        offset = (page - 1) * page_size

        # fqn identifiers are validated above — safe to interpolate
        count_sql = text(f'SELECT COUNT(*) AS cnt FROM "{schema}"."{table}"')
        rows_sql  = text(
            f'SELECT * FROM "{schema}"."{table}" LIMIT :lim OFFSET :off'
        )

        async with self.model.db.session() as sess:
            total_count = (await sess.execute(count_sql)).scalar() or 0
            result      = await sess.execute(rows_sql, {"lim": page_size, "off": offset})
            col_names   = list(result.keys())
            raw_rows    = result.fetchall()

        rows = [dict(zip(col_names, r)) for r in raw_rows]
        return {
            "fqn":         fqn,
            "rows":        rows,
            "columns":     col_names,
            "row_count":   len(rows),
            "page":        page,
            "page_size":   page_size,
            "total_count": total_count,
        }

    # ── Bulk insert ───────────────────────────────────────────────────────────

    async def bulk_insert(self, fqn: str, rows: list[dict[str, Any]]) -> int:
        """
        Insert multiple rows inside a single atomic PostgreSQL transaction.

        All column names are validated before any SQL is executed.
        The entire batch rolls back if any single INSERT fails.

        Returns the number of successfully inserted rows.
        """
        schema, table = self._parse_and_validate_fqn(fqn)

        if not rows:
            raise DataServiceError("rows list cannot be empty")
        if len(rows) > MAX_INSERT_ROWS:
            raise DataServiceError(
                f"Batch size {len(rows)} exceeds maximum of {MAX_INSERT_ROWS}"
            )

        # Validate all column names up front before touching the DB
        for i, row in enumerate(rows):
            if not row:
                raise DataServiceError(f"Row {i} is empty")
            self._validate_row_columns(row)

        inserted = 0
        async with self.model.db.session() as sess:
            try:
                for row in rows:
                    cols    = list(row.keys())
                    col_str = ", ".join(f'"{c}"' for c in cols)
                    val_str = ", ".join(f":val_{c}" for c in cols)
                    sql     = text(
                        f'INSERT INTO "{schema}"."{table}" ({col_str}) VALUES ({val_str})'
                    )
                    params = {f"val_{c}": self._coerce_param_val(v) for c, v in row.items()}
                    await sess.execute(sql, params)
                    inserted += 1
                await sess.commit()
            except Exception:
                await sess.rollback()
                raise

        logger.info("bulk_insert: %d rows inserted into %s", inserted, fqn)
        return inserted

    # ── Bulk update ───────────────────────────────────────────────────────────

    async def bulk_update(self, fqn: str, rows: list[dict[str, Any]]) -> int:
        """
        Update multiple rows by primary key inside a single atomic transaction.

        Each element of ``rows`` must contain:
            {
                "pk_column": str,           # name of the PK column
                "pk_value":  any,           # value to match in WHERE clause
                "updates":   {col: val, …}  # columns to SET
            }

        All column names are validated before execution.
        The entire batch rolls back on any failure.

        Returns the total number of rows affected.
        """
        schema, table = self._parse_and_validate_fqn(fqn)

        if not rows:
            raise DataServiceError("rows list cannot be empty")
        if len(rows) > MAX_UPDATE_ROWS:
            raise DataServiceError(
                f"Batch size {len(rows)} exceeds maximum of {MAX_UPDATE_ROWS}"
            )

        for i, row in enumerate(rows):
            pk_col  = row.get("pk_column")
            updates = row.get("updates", {})
            if not pk_col:
                raise DataServiceError(f"Row {i} missing 'pk_column'")
            if not updates:
                raise DataServiceError(f"Row {i} has empty 'updates'")
            self._validate_column_name(pk_col)
            for col in updates:
                self._validate_column_name(col)

        updated = 0
        async with self.model.db.session() as sess:
            try:
                for i, row in enumerate(rows):
                    pk_col  = row["pk_column"]
                    pk_val  = row["pk_value"]
                    updates = row["updates"]

                    set_parts = ", ".join(
                        f'"{c}" = :upd_{i}_{c}' for c in updates
                    )
                    sql = text(
                        f'UPDATE "{schema}"."{table}" '
                        f'SET {set_parts} '
                        f'WHERE "{pk_col}" = :pk_{i}'
                    )
                    params = {f"upd_{i}_{c}": self._coerce_param_val(v) for c, v in updates.items()}
                    params[f"pk_{i}"] = self._coerce_param_val(pk_val)

                    result  = await sess.execute(sql, params)
                    updated += result.rowcount
                await sess.commit()
            except Exception:
                await sess.rollback()
                raise

        logger.info("bulk_update: %d rows updated in %s", updated, fqn)
        return updated

    # ── Bulk delete ───────────────────────────────────────────────────────────

    async def bulk_delete(
        self,
        fqn: str,
        pk_column: str,
        pk_values: list[Any],
    ) -> int:
        """
        Delete rows whose primary key column matches any value in ``pk_values``.

        Uses ``= ANY(:vals)`` with a parameterized array — no string concatenation.
        Executes inside a single transaction; rolls back on failure.

        Returns the number of deleted rows.
        """
        schema, table = self._parse_and_validate_fqn(fqn)
        self._validate_column_name(pk_column)

        if not pk_values:
            raise DataServiceError("pk_values list cannot be empty")
        if len(pk_values) > MAX_DELETE_IDS:
            raise DataServiceError(
                f"pk_values count {len(pk_values)} exceeds maximum of {MAX_DELETE_IDS}"
            )

        sql = text(
            f'DELETE FROM "{schema}"."{table}" WHERE "{pk_column}" = ANY(:vals)'
        )

        async with self.model.db.session() as sess:
            try:
                result  = await sess.execute(sql, {"vals": pk_values})
                deleted = result.rowcount
                await sess.commit()
            except Exception:
                await sess.rollback()
                raise

        logger.info("bulk_delete: %d rows deleted from %s", deleted, fqn)
        return deleted
