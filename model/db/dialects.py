"""
model/db/dialects.py
─────────────────────
Dialect-specific SQL helpers for schema introspection.
Supports Postgres, MySQL, and SQLite.
"""
from __future__ import annotations

from enum import Enum


class Dialect(str, Enum):
    POSTGRES = "postgresql"
    MYSQL = "mysql"
    SQLITE = "sqlite"
    UNKNOWN = "unknown"


def detect_dialect(db_url: str) -> Dialect:
    url = db_url.lower()
    if "postgresql" in url or "postgres" in url:
        return Dialect.POSTGRES
    if "mysql" in url or "mariadb" in url:
        return Dialect.MYSQL
    if "sqlite" in url:
        return Dialect.SQLITE
    return Dialect.UNKNOWN


def get_tables_query(dialect: Dialect, schema: str | None = None) -> str:
    """Return SQL to list all user tables in the DB."""
    if dialect == Dialect.POSTGRES:
        schema_filter = f"AND table_schema = '{schema}'" if schema else "AND table_schema NOT IN ('pg_catalog', 'information_schema')"
        return f"""
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE'
            {schema_filter}
            ORDER BY table_schema, table_name
        """
    if dialect == Dialect.MYSQL:
        return """
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE'
              AND table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY table_schema, table_name
        """
    # SQLite
    return """
        SELECT 'main' AS table_schema, name AS table_name
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    """


def get_columns_query(dialect: Dialect, table: str, schema: str | None = None) -> str:
    """Return SQL to get column definitions for a table."""
    if dialect == Dialect.POSTGRES:
        schema_val = schema or "public"
        return f"""
            SELECT
                c.column_name,
                c.data_type,
                c.is_nullable,
                c.column_default,
                CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END AS is_primary_key,
                CASE WHEN fk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END AS is_foreign_key,
                fk.foreign_table_name,
                fk.foreign_column_name
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT ku.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage ku
                  ON tc.constraint_name = ku.constraint_name
                 AND tc.table_schema = ku.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_name = '{table}'
                  AND tc.table_schema = '{schema_val}'
            ) pk ON pk.column_name = c.column_name
            LEFT JOIN (
                SELECT
                    kcu.column_name,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                  ON ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_name = '{table}'
                  AND tc.table_schema = '{schema_val}'
            ) fk ON fk.column_name = c.column_name
            WHERE c.table_name = '{table}' AND c.table_schema = '{schema_val}'
            ORDER BY c.ordinal_position
        """
    if dialect == Dialect.MYSQL:
        return f"""
            SELECT
                column_name,
                data_type,
                is_nullable,
                column_default,
                IF(column_key = 'PRI', 'YES', 'NO') AS is_primary_key,
                IF(column_key = 'MUL', 'YES', 'NO') AS is_foreign_key,
                NULL AS foreign_table_name,
                NULL AS foreign_column_name
            FROM information_schema.columns
            WHERE table_name = '{table}'
            ORDER BY ordinal_position
        """
    # SQLite
    return f"PRAGMA table_info('{table}')"


def get_foreign_keys_query(dialect: Dialect, schema: str | None = None) -> str:
    """Return SQL to list all FK relationships."""
    if dialect == Dialect.POSTGRES:
        schema_val = schema or "public"
        return f"""
            SELECT
                tc.table_name AS from_table,
                kcu.column_name AS from_column,
                ccu.table_name AS to_table,
                ccu.column_name AS to_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = '{schema_val}'
            ORDER BY tc.table_name
        """
    if dialect == Dialect.MYSQL:
        return """
            SELECT
                table_name AS from_table,
                column_name AS from_column,
                referenced_table_name AS to_table,
                referenced_column_name AS to_column
            FROM information_schema.key_column_usage
            WHERE referenced_table_name IS NOT NULL
        """
    # SQLite — FK pragma per table (caller must iterate)
    return "SELECT name FROM sqlite_master WHERE type='table'"
