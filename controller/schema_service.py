"""
controller/schema_service.py
────────────────────────────
Centralized service for executing DDL operations and managing PostgreSQL schema modifications safely.
"""

from __future__ import annotations

import logging
import re
from typing import Any, TYPE_CHECKING

from sqlalchemy import text

if TYPE_CHECKING:
    from model.facade import ModelFacade

logger = logging.getLogger(__name__)


class SchemaService:
    """
    Service responsible for database schema modifications (DDL).
    All methods ensure:
      1. Identifier validation (against SQL injection).
      2. PostgreSQL transactions for DDL.
      3. Synchronisation of schema metadata and embeddings.
    """

    def __init__(self, model: ModelFacade) -> None:
        self.model = model

    def _parse_and_validate_fqn(self, fqn: str) -> tuple[str, str]:
        """
        Parses a fully qualified table name into (schema, table).
        Validates both parts to ensure they are safe PostgreSQL identifiers.
        """
        if not fqn:
            raise ValueError("Table name (FQN) cannot be empty")
        parts = fqn.split(".")
        if len(parts) > 2:
            raise ValueError(f"Invalid table name format: {fqn}")
        
        for part in parts:
            if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", part):
                raise ValueError(f"Invalid identifier name: {part}")
                
        schema = parts[0] if len(parts) > 1 else "public"
        table = parts[-1]
        return schema, table

    def _validate_column_name(self, name: str) -> None:
        """Validates that a column name is a safe PostgreSQL identifier."""
        if not name:
            raise ValueError("Column name cannot be empty")
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", name):
            raise ValueError(f"Invalid column name: {name}")

    def _validate_type(self, type_str: str) -> None:
        """Validates that the SQL type expression is safe."""
        if not type_str:
            raise ValueError("Type expression cannot be empty")
        # Allow only safe alphanumeric characters, spaces, parentheses, commas
        if not re.match(r"^[a-zA-Z0-9_,\(\)\s]+$", type_str):
            raise ValueError(f"Invalid data type: {type_str}")

    async def sync_metadata(self) -> int:
        """Synchronizes PostgreSQL schema metadata and triggers model metadata refresh."""
        logger.info("Synchronizing metadata and embeddings")
        return await self.model.sync_schema()

    async def create_table(self, fqn: str, columns: dict[str, str] | list[dict[str, Any]]) -> None:
        """
        Creates a new table in PostgreSQL.
        columns can be:
          - A dictionary of {col_name: col_type}
          - A list of dicts with {"name": col_name, "type": col_type}
        """
        schema, table = self._parse_and_validate_fqn(fqn)
        
        # Parse column definitions
        col_defs = []
        if isinstance(columns, dict):
            for col_name, col_type in columns.items():
                self._validate_column_name(col_name)
                self._validate_type(col_type)
                col_defs.append(f'"{col_name}" {col_type}')
        elif isinstance(columns, list):
            extra_queries = []
            for col in columns:
                col_data = col.model_dump() if hasattr(col, "model_dump") else (col.dict() if hasattr(col, "dict") else col)
                col_name = col_data.get("name")
                col_type = col_data.get("type")
                if not col_name or not col_type:
                    raise ValueError("Column definition must contain 'name' and 'type'")
                self._validate_column_name(col_name)
                self._validate_type(col_type)
                
                parts = [f'"{col_name}"', col_type]
                
                if col_data.get("is_primary_key") and "PRIMARY KEY" not in col_type.upper():
                    parts.append("PRIMARY KEY")
                elif col_data.get("is_unique") and "UNIQUE" not in col_type.upper():
                    parts.append("UNIQUE")
                
                if not col_data.get("nullable", True) and "NOT NULL" not in col_type.upper():
                    parts.append("NOT NULL")
                
                default_val = col_data.get("default_value")
                if default_val is not None and default_val != "":
                    # Validate default value structure to prevent SQL injection
                    if not re.match(r"^[a-zA-Z0-9_\s\(\)<>=\!,\.\'\-\+\*\/\"&|%:]*$", str(default_val)):
                        raise ValueError(f"Invalid characters in default value: {default_val}")
                    parts.append(f"DEFAULT {default_val}")

                # CHECK constraint
                check_val = col_data.get("check_constraint")
                if check_val is not None and check_val != "":
                    if not re.match(r"^[a-zA-Z0-9_\s\(\)<>=\!,\.\'\-\+\*\/\"&|%]*$", str(check_val)):
                        raise ValueError(f"Invalid characters in CHECK constraint: {check_val}")
                    parts.append(f"CHECK ({check_val})")

                # FOREIGN KEY constraint
                fk_table = col_data.get("foreign_key_table")
                fk_col = col_data.get("foreign_key_column")
                if fk_table and fk_col:
                    ref_table_meta = self.model.registry.get(fk_table)
                    if not ref_table_meta:
                        raise ValueError(f"Referenced foreign key table '{fk_table}' does not exist")
                    if not any(c.name.lower() == fk_col.lower() for c in ref_table_meta.columns):
                        raise ValueError(f"Referenced foreign key column '{fk_col}' does not exist on table '{fk_table}'")
                    
                    ref_schema, ref_table = self._parse_and_validate_fqn(fk_table)
                    parts.append(f'REFERENCES "{ref_schema}"."{ref_table}" ("{fk_col}")')

                # INDEX configuration
                if col_data.get("has_index"):
                    idx_name = f"{table}_{col_name}_idx"
                    extra_queries.append(f'CREATE INDEX IF NOT EXISTS "{idx_name}" ON "{schema}"."{table}" ("{col_name}")')
                
                col_defs.append(" ".join(parts))
        else:
            raise ValueError("Columns must be a dict or a list of dicts")

        if not col_defs:
            raise ValueError("Cannot create a table with zero columns")

        col_defs_str = ", ".join(col_defs)
        sql = f'CREATE TABLE "{schema}"."{table}" ({col_defs_str})'
        
        async with self.model.db.session() as sess:
            await sess.execute(text(sql))
            if isinstance(columns, list):
                for ex_sql in extra_queries:
                    await sess.execute(text(ex_sql))
            await sess.commit()

        await self.sync_metadata()

    async def add_column(self, fqn: str, column_name: str, column_type: str = "VARCHAR") -> None:
        """Adds a new column to an existing table."""
        schema, table = self._parse_and_validate_fqn(fqn)
        self._validate_column_name(column_name)
        self._validate_type(column_type)

        sql = f'ALTER TABLE "{schema}"."{table}" ADD COLUMN "{column_name}" {column_type}'

        async with self.model.db.session() as sess:
            await sess.execute(text(sql))
            await sess.commit()

        await self.sync_metadata()

    async def rename_column(self, fqn: str, old_name: str, new_name: str) -> None:
        """Renames a column in an existing table."""
        schema, table = self._parse_and_validate_fqn(fqn)
        self._validate_column_name(old_name)
        self._validate_column_name(new_name)

        sql = f'ALTER TABLE "{schema}"."{table}" RENAME COLUMN "{old_name}" TO "{new_name}"'

        async with self.model.db.session() as sess:
            await sess.execute(text(sql))
            await sess.commit()

        await self.sync_metadata()

    async def get_table_deletion_report(self, fqn: str) -> dict[str, Any]:
        """
        Analyzes dependencies, foreign keys, indexes, and active rows for a table
        and returns a detailed safety report.
        """
        schema, table = self._parse_and_validate_fqn(fqn)
        
        # 1. Row count / Has data
        row_count = 0
        has_data = False
        try:
            async with self.model.db.session() as sess:
                res = await sess.execute(text(f'SELECT COUNT(*) FROM "{schema}"."{table}"'))
                row_count = res.scalar() or 0
                has_data = row_count > 0
        except Exception:
            pass

        # 2. Foreign keys referencing this table
        fk_sql = """
            SELECT
                tc.table_schema || '.' || tc.table_name AS dependent_table,
                kcu.column_name AS dependent_column,
                ccu.column_name AS referenced_column,
                tc.constraint_name
            FROM
                information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND ccu.table_schema = :schema
              AND ccu.table_name = :table
        """
        dependent_fks = []
        try:
            async with self.model.db.session() as sess:
                res = await sess.execute(text(fk_sql), {"schema": schema, "table": table})
                for row in res.fetchall():
                    dependent_fks.append({
                        "table": row[0],
                        "column": row[1],
                        "referenced_column": row[2],
                        "constraint": row[3]
                    })
        except Exception as exc:
            logger.warning("Error fetching dependent FKs for table %s: %s", fqn, exc)

        # 3. Indexes
        idx_sql = """
            SELECT DISTINCT
                i.relname AS index_name
            FROM
                pg_class t,
                pg_class i,
                pg_index ix,
                pg_namespace n
            WHERE
                t.oid = ix.indrelid
                AND i.oid = ix.indexrelid
                AND t.relnamespace = n.oid
                AND n.nspname = :schema
                AND t.relname = :table
        """
        indexes = []
        try:
            async with self.model.db.session() as sess:
                res = await sess.execute(text(idx_sql), {"schema": schema, "table": table})
                indexes = [row[0] for row in res.fetchall() if not row[0].endswith('_pkey')]
        except Exception as exc:
            logger.warning("Error fetching indexes for table %s: %s", fqn, exc)

        warnings = []
        if has_data:
            warnings.append(f"Table contains {row_count} rows of existing data.")
        if dependent_fks:
            warnings.append(f"Table is referenced by {len(dependent_fks)} Foreign Key constraints.")
        if indexes:
            warnings.append(f"Table has {len(indexes)} active indexes.")

        return {
            "safe": len(dependent_fks) == 0,
            "has_data": has_data,
            "row_count": row_count,
            "dependent_fks": dependent_fks,
            "indexes": indexes,
            "warnings": warnings
        }

    async def get_column_deletion_report(self, fqn: str, column_name: str) -> dict[str, Any]:
        """
        Analyzes dependencies, foreign keys, indexes, and active values for a column
        and returns a detailed safety report.
        """
        schema, table = self._parse_and_validate_fqn(fqn)
        self._validate_column_name(column_name)

        # 1. Non-null count
        non_null_count = 0
        has_data = False
        try:
            async with self.model.db.session() as sess:
                res = await sess.execute(text(f'SELECT COUNT(*) FROM "{schema}"."{table}" WHERE "{column_name}" IS NOT NULL'))
                non_null_count = res.scalar() or 0
                has_data = non_null_count > 0
        except Exception:
            pass

        # 2. Foreign keys referencing this column
        fk_sql = """
            SELECT
                tc.table_schema || '.' || tc.table_name AS dependent_table,
                kcu.column_name AS dependent_column,
                ccu.column_name AS referenced_column,
                tc.constraint_name
            FROM
                information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND ccu.table_schema = :schema
              AND ccu.table_name = :table
              AND ccu.column_name = :column_name
        """
        dependent_fks = []
        try:
            async with self.model.db.session() as sess:
                res = await sess.execute(text(fk_sql), {"schema": schema, "table": table, "column_name": column_name})
                for row in res.fetchall():
                    dependent_fks.append({
                        "table": row[0],
                        "column": row[1],
                        "referenced_column": row[2],
                        "constraint": row[3]
                    })
        except Exception as exc:
            logger.warning("Error fetching dependent FKs for column %s.%s: %s", fqn, column_name, exc)

        # 3. Indexes on this column
        idx_sql = """
            SELECT DISTINCT
                i.relname AS index_name
            FROM
                pg_class t,
                pg_class i,
                pg_index ix,
                pg_attribute a,
                pg_namespace n
            WHERE
                t.oid = ix.indrelid
                AND i.oid = ix.indexrelid
                AND a.attrelid = t.oid
                AND a.attnum = ANY(ix.indkey)
                AND t.relnamespace = n.oid
                AND n.nspname = :schema
                AND t.relname = :table
                AND a.attname = :column_name
        """
        indexes = []
        try:
            async with self.model.db.session() as sess:
                res = await sess.execute(text(idx_sql), {"schema": schema, "table": table, "column_name": column_name})
                indexes = [row[0] for row in res.fetchall() if not row[0].endswith('_pkey')]
        except Exception as exc:
            logger.warning("Error fetching indexes for column %s.%s: %s", fqn, column_name, exc)

        warnings = []
        if has_data:
            warnings.append(f"Column contains {non_null_count} non-null values.")
        if dependent_fks:
            warnings.append(f"Column is referenced by foreign keys in: {', '.join(set(fk['table'] for fk in dependent_fks))}.")
        if indexes:
            warnings.append(f"Column is part of active indexes: {', '.join(indexes)}.")

        return {
            "safe": len(dependent_fks) == 0,
            "has_data": has_data,
            "row_count": non_null_count,
            "dependent_fks": dependent_fks,
            "indexes": indexes,
            "warnings": warnings
        }

    async def drop_column(self, fqn: str, column_name: str) -> None:
        """Drops a column from a table, checking safety first."""
        schema, table = self._parse_and_validate_fqn(fqn)
        self._validate_column_name(column_name)

        report = await self.get_column_deletion_report(fqn, column_name)
        if not report["safe"]:
            raise ValueError(f"Cannot drop column '{column_name}' from table '{fqn}' due to dependent foreign keys")

        sql = f'ALTER TABLE "{schema}"."{table}" DROP COLUMN "{column_name}"'

        async with self.model.db.session() as sess:
            await sess.execute(text(sql))
            await sess.commit()

        await self.sync_metadata()

    async def drop_table(self, fqn: str) -> None:
        """Drops a table from PostgreSQL, checking safety first."""
        schema, table = self._parse_and_validate_fqn(fqn)

        report = await self.get_table_deletion_report(fqn)
        if not report["safe"]:
            raise ValueError(f"Cannot drop table '{fqn}' due to dependent foreign keys")

        sql = f'DROP TABLE "{schema}"."{table}"'

        async with self.model.db.session() as sess:
            await sess.execute(text(sql))
            await sess.commit()

        await self.sync_metadata()

    async def change_column_type(self, fqn: str, column_name: str, new_type: str) -> None:
        """Changes the type of a column in a table."""
        schema, table = self._parse_and_validate_fqn(fqn)
        self._validate_column_name(column_name)
        self._validate_type(new_type)

        sql = f'ALTER TABLE "{schema}"."{table}" ALTER COLUMN "{column_name}" TYPE {new_type}'

        async with self.model.db.session() as sess:
            await sess.execute(text(sql))
            await sess.commit()

        await self.sync_metadata()

    async def alter_table(self, fqn: str, target_columns: list[dict[str, Any]]) -> None:
        """
        Compares the existing PostgreSQL schema of a table with the desired target_columns
        and executes the minimum set of ALTER TABLE DDL queries inside a transaction.
        """
        schema, table = self._parse_and_validate_fqn(fqn)
        
        # Get the current columns in the registry
        table_meta = self.model.registry.get(fqn)
        if not table_meta:
            raise ValueError(f"Table {fqn} not found in registry")
            
        current_cols = {col.name.lower(): col for col in table_meta.columns}
        
        # We will build a list of DDL statements to execute inside a single transaction
        ddl_statements = []
        summaries = []
        
        # First, track renames to align current names with target names
        target_by_original = {}
        for col_data in target_columns:
            orig_name = col_data.get("original_name")
            name = col_data.get("name")
            
            if orig_name and orig_name.lower() in current_cols and orig_name.lower() != name.lower():
                self._validate_column_name(name)
                self._validate_column_name(orig_name)
                # Add rename statement
                ddl_statements.append(f'ALTER TABLE "{schema}"."{table}" RENAME COLUMN "{orig_name}" TO "{name}"')
                summaries.append(f"Renamed column {orig_name} to {name}")
                target_by_original[orig_name.lower()] = name
                
        # Now, construct the current columns mapping after any renames
        renamed_current_cols = {}
        for name_lower, col in current_cols.items():
            if name_lower in target_by_original:
                new_name = target_by_original[name_lower]
                renamed_current_cols[new_name.lower()] = col
            else:
                renamed_current_cols[name_lower] = col
                
        # Now process additions, type changes, nullability modifications, uniqueness, and defaults
        target_names = set()
        for col_data in target_columns:
            name = col_data.get("name")
            self._validate_column_name(name)
            target_names.add(name.lower())
            
            col_type = col_data.get("type")
            self._validate_type(col_type)
            
            nullable = col_data.get("nullable", True)
            is_pk = col_data.get("is_primary_key", False)
            is_unique = col_data.get("is_unique", False)
            default_val = col_data.get("default_value")
            
            if name.lower() not in renamed_current_cols:
                # 1. ADD COLUMN
                parts = [f'"{name}"', col_type]
                if is_pk:
                    parts.append("PRIMARY KEY")
                elif is_unique:
                    parts.append("UNIQUE")
                if not nullable:
                    parts.append("NOT NULL")
                if default_val is not None and default_val != "":
                    if not re.match(r"^[a-zA-Z0-9_\s\(\)<>=\!,\.\'\-\+\*\/\"&|%:]*$", str(default_val)):
                        raise ValueError(f"Invalid default value: {default_val}")
                    parts.append(f"DEFAULT {default_val}")
                
                check_val = col_data.get("check_constraint")
                if check_val is not None and check_val != "":
                    if not re.match(r"^[a-zA-Z0-9_\s\(\)<>=\!,\.\'\-\+\*\/\"&|%]*$", str(check_val)):
                        raise ValueError(f"Invalid characters in CHECK constraint: {check_val}")
                    parts.append(f"CHECK ({check_val})")

                fk_table = col_data.get("foreign_key_table")
                fk_col = col_data.get("foreign_key_column")
                if fk_table and fk_col:
                    ref_table_meta = self.model.registry.get(fk_table)
                    if not ref_table_meta:
                        raise ValueError(f"Referenced foreign key table '{fk_table}' does not exist")
                    if not any(c.name.lower() == fk_col.lower() for c in ref_table_meta.columns):
                        raise ValueError(f"Referenced foreign key column '{fk_col}' does not exist on table '{fk_table}'")
                    ref_schema, ref_table = self._parse_and_validate_fqn(fk_table)
                    parts.append(f'REFERENCES "{ref_schema}"."{ref_table}" ("{fk_col}")')

                ddl_statements.append(f'ALTER TABLE "{schema}"."{table}" ADD COLUMN {" ".join(parts)}')
                summaries.append(f"Added column {name} ({col_type})")
                
                if col_data.get("has_index"):
                    idx_name = f"{table}_{name}_idx"
                    ddl_statements.append(f'CREATE INDEX IF NOT EXISTS "{idx_name}" ON "{schema}"."{table}" ("{name}")')
                    summaries.append(f"Created index on {name}")
            else:
                # Current column exists (or was renamed)
                current_col = renamed_current_cols[name.lower()]
                
                # Check Type change
                curr_type_norm = current_col.data_type.upper()
                target_type_norm = col_type.upper()
                type_map = {"INT": "INTEGER", "INT4": "INTEGER", "INT8": "BIGINT"}
                curr_type_norm = type_map.get(curr_type_norm, curr_type_norm)
                target_type_norm = type_map.get(target_type_norm, target_type_norm)
                
                if curr_type_norm != target_type_norm:
                    ddl_statements.append(
                        f'ALTER TABLE "{schema}"."{table}" ALTER COLUMN "{name}" TYPE {col_type} USING "{name}"::{col_type}'
                    )
                    summaries.append(f"Changed type of {name} from {curr_type_norm} to {target_type_norm}")
                
                # Check Nullability change
                if current_col.nullable != nullable:
                    if nullable:
                        ddl_statements.append(f'ALTER TABLE "{schema}"."{table}" ALTER COLUMN "{name}" DROP NOT NULL')
                        summaries.append(f"Set column {name} NULL")
                    else:
                        ddl_statements.append(f'ALTER TABLE "{schema}"."{table}" ALTER COLUMN "{name}" SET NOT NULL')
                        summaries.append(f"Set column {name} NOT NULL")
                        
                # Check Uniqueness change
                if is_unique and not current_col.is_unique and not current_col.is_primary_key:
                    constraint_name = f"{table}_{name}_key"
                    ddl_statements.append(f'ALTER TABLE "{schema}"."{table}" ADD CONSTRAINT "{constraint_name}" UNIQUE ("{name}")')
                    summaries.append(f"Set column {name} UNIQUE")
                elif not is_unique and current_col.is_unique:
                    constraint_name = f"{table}_{name}_key"
                    ddl_statements.append(f'ALTER TABLE "{schema}"."{table}" DROP CONSTRAINT IF EXISTS "{constraint_name}"')
                    summaries.append(f"Removed UNIQUE constraint from {name}")
                    
                # Check Default Value change
                curr_default = current_col.default_value
                if default_val is not None and default_val != "":
                    if not re.match(r"^[a-zA-Z0-9_\s\(\)<>=\!,\.\'\-\+\*\/\"&|%:]*$", str(default_val)):
                        raise ValueError(f"Invalid default value: {default_val}")
                    if str(curr_default or "").strip() != str(default_val).strip():
                        ddl_statements.append(f'ALTER TABLE "{schema}"."{table}" ALTER COLUMN "{name}" SET DEFAULT {default_val}')
                        summaries.append(f"Set default of {name} to {default_val}")
                elif curr_default is not None and (default_val is None or default_val == ""):
                    ddl_statements.append(f'ALTER TABLE "{schema}"."{table}" ALTER COLUMN "{name}" DROP DEFAULT')
                    summaries.append(f"Removed default from {name}")

                # Check CHECK Constraint change
                check_val = col_data.get("check_constraint")
                ddl_statements.append(f'ALTER TABLE "{schema}"."{table}" DROP CONSTRAINT IF EXISTS "{table}_{name}_check"')
                if check_val is not None and check_val != "":
                    if not re.match(r"^[a-zA-Z0-9_\s\(\)<>=\!,\.\'\-\+\*\/\"&|%]*$", str(check_val)):
                        raise ValueError(f"Invalid characters in CHECK constraint: {check_val}")
                    ddl_statements.append(f'ALTER TABLE "{schema}"."{table}" ADD CONSTRAINT "{table}_{name}_check" CHECK ({check_val})')
                    summaries.append(f"Set CHECK constraint on {name} to {check_val}")

                # Check Foreign Key change
                fk_table = col_data.get("foreign_key_table")
                fk_col = col_data.get("foreign_key_column")
                ddl_statements.append(f'ALTER TABLE "{schema}"."{table}" DROP CONSTRAINT IF EXISTS "{table}_{name}_fkey"')
                if fk_table and fk_col:
                    ref_table_meta = self.model.registry.get(fk_table)
                    if not ref_table_meta:
                        raise ValueError(f"Referenced foreign key table '{fk_table}' does not exist")
                    if not any(c.name.lower() == fk_col.lower() for c in ref_table_meta.columns):
                        raise ValueError(f"Referenced foreign key column '{fk_col}' does not exist on table '{fk_table}'")
                    ref_schema, ref_table = self._parse_and_validate_fqn(fk_table)
                    ddl_statements.append(
                        f'ALTER TABLE "{schema}"."{table}" ADD CONSTRAINT "{table}_{name}_fkey" '
                        f'FOREIGN KEY ("{name}") REFERENCES "{ref_schema}"."{ref_table}" ("{fk_col}")'
                    )
                    summaries.append(f"Set foreign key on {name} referencing {fk_table}.{fk_col}")

                # Check Index change
                idx_name = f"{table}_{name}_idx"
                if col_data.get("has_index"):
                    ddl_statements.append(f'CREATE INDEX IF NOT EXISTS "{idx_name}" ON "{schema}"."{table}" ("{name}")')
                    if not current_col.has_index:
                        summaries.append(f"Created index on {name}")
                else:
                    ddl_statements.append(f'DROP INDEX IF EXISTS "{schema}"."{idx_name}"')
                    if current_col.has_index:
                        summaries.append(f"Dropped index on {name}")
                    
        # Now process drops: columns in renamed_current_cols that are NOT in target_names
        for curr_name in renamed_current_cols:
            if curr_name.lower() not in target_names:
                current_col = renamed_current_cols[curr_name]
                if current_col.is_primary_key:
                    raise ValueError(f"Dropping primary key column '{curr_name}' is not allowed")
                ddl_statements.append(f'ALTER TABLE "{schema}"."{table}" DROP COLUMN "{curr_name}"')
                summaries.append(f"Dropped column {curr_name}")
                
        if not ddl_statements:
            logger.info("No schema changes detected for table %s", fqn)
            return
            
        # Execute DDL statements transactionally
        async with self.model.db.session() as sess:
            for stmt in ddl_statements:
                logger.info("Executing DDL statement: %s", stmt)
                await sess.execute(text(stmt))
            await sess.commit()
            
        # Sync metadata
        await self.sync_metadata()

        # Record schema version
        try:
            table_meta = self.model.registry.get(fqn)
            if table_meta:
                snapshot = [col.to_dict() for col in table_meta.columns]
                async with self.model.db.session() as sess:
                    await self.record_version(
                        sess=sess,
                        fqn=fqn,
                        ddl="; ".join(ddl_statements),
                        snapshot=snapshot,
                        summary="; ".join(summaries) if summaries else "Altered table schema",
                        author="System User"
                    )
                    await sess.commit()
        except Exception as exc:
            logger.warning("Failed to record version for altered table %s: %s", fqn, exc)

    # CamelCase aliases for backward compatibility/JS-matching preferences
    async def createTable(self, fqn: str, columns: dict[str, str] | list[dict[str, Any]]) -> None:
        await self.create_table(fqn, columns)

    async def addColumn(self, fqn: str, column_name: str, column_type: str = "VARCHAR") -> None:
        await self.add_column(fqn, column_name, column_type)

    async def renameColumn(self, fqn: str, old_name: str, new_name: str) -> None:
        await self.rename_column(fqn, old_name, new_name)

    async def dropColumn(self, fqn: str, column_name: str) -> None:
        await self.drop_column(fqn, column_name)

    async def dropTable(self, fqn: str) -> None:
        await self.drop_table(fqn)

    async def getTableDeletionReport(self, fqn: str) -> dict[str, Any]:
        return await self.get_table_deletion_report(fqn)

    async def getColumnDeletionReport(self, fqn: str, column_name: str) -> dict[str, Any]:
        return await self.get_column_deletion_report(fqn, column_name)

    async def changeColumnType(self, fqn: str, column_name: str, new_type: str) -> None:
        await self.change_column_type(fqn, column_name, new_type)

    async def alterTable(self, fqn: str, target_columns: list[dict[str, Any]]) -> None:
        await self.alter_table(fqn, target_columns)

    async def syncMetadata(self) -> int:
        return await self.sync_metadata()

    async def init_versioning_table(self) -> None:
        """Initializes the schema versioning table in PostgreSQL if it doesn't exist."""
        sql = """
        CREATE TABLE IF NOT EXISTS public.schema_versions (
            id SERIAL PRIMARY KEY,
            fqn VARCHAR(128) NOT NULL,
            version INTEGER NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            author VARCHAR(100) NOT NULL,
            ddl TEXT NOT NULL,
            snapshot JSONB NOT NULL,
            summary TEXT NOT NULL
        );
        """
        async with self.model.db.session() as sess:
            await sess.execute(text(sql))
            await sess.commit()

    async def record_version(
        self,
        sess: Any,
        fqn: str,
        ddl: str,
        snapshot: list[dict[str, Any]],
        summary: str,
        author: str = "System User"
    ) -> None:
        """Records a new version entry for a table modification."""
        q_ver = text("SELECT COALESCE(MAX(version), 0) FROM public.schema_versions WHERE fqn = :fqn")
        res = await sess.execute(q_ver, {"fqn": fqn})
        curr_ver = res.scalar() or 0
        new_ver = curr_ver + 1

        import json
        stmt = text("""
            INSERT INTO public.schema_versions (fqn, version, author, ddl, snapshot, summary)
            VALUES (:fqn, :version, :author, :ddl, :snapshot, :summary)
        """)
        await sess.execute(stmt, {
            "fqn": fqn,
            "version": new_ver,
            "author": author,
            "ddl": ddl,
            "snapshot": json.dumps(snapshot),
            "summary": summary
        })

    async def get_table_versions(self, fqn: str) -> list[dict[str, Any]]:
        """Retrieves the list of version entries for a table."""
        await self.init_versioning_table()
        sql = """
            SELECT id, fqn, version, created_at, author, ddl, snapshot, summary 
            FROM public.schema_versions 
            WHERE fqn = :fqn
            ORDER BY version DESC
        """
        import json
        async with self.model.db.session() as sess:
            res = await sess.execute(text(sql), {"fqn": fqn})
            rows = res.fetchall()
            versions = []
            for r in rows:
                snap_data = json.loads(r[6]) if isinstance(r[6], str) else r[6]
                if not isinstance(snap_data, list):
                    snap_data = []
                versions.append({
                    "id": r[0],
                    "fqn": r[1],
                    "version": r[2],
                    "created_at": r[3].isoformat() if hasattr(r[3], "isoformat") else str(r[3]),
                    "author": r[4],
                    "ddl": r[5],
                    "snapshot": snap_data,
                    "summary": r[7]
                })
            return versions

    async def restore_schema_version(self, fqn: str, version_number: int) -> None:
        """Restores the table schema to the snapshot of a specific version number."""
        async with self.model.db.session() as sess:
            q = text("""
                SELECT snapshot FROM public.schema_versions 
                WHERE fqn = :fqn AND version = :version
            """)
            res = await sess.execute(q, {"fqn": fqn, "version": version_number})
            row = res.fetchone()
            if not row:
                raise ValueError(f"Version {version_number} not found for table {fqn}")
            
            import json
            snapshot_cols = json.loads(row[0]) if isinstance(row[0], str) else row[0]
            
        await self.alter_table(fqn, snapshot_cols)

    # CamelCase aliases
    async def getTableVersions(self, fqn: str) -> list[dict[str, Any]]:
        return await self.get_table_versions(fqn)

    async def restoreSchemaVersion(self, fqn: str, version_number: int) -> None:
        await self.restore_schema_version(fqn, version_number)

    async def generate_proposed_schema(self, user_prompt: str) -> dict[str, Any]:
        """Generates a proposed schema JSON using Ollama based on user prompt and existing registry tables."""
        existing_tables_info = []
        for table_meta in self.model.registry.all_tables():
            cols = []
            for col in table_meta.columns:
                pk_str = "PK" if col.is_pk else ""
                cols.append(f"{col.name} ({col.data_type} {pk_str})")
            existing_tables_info.append(f"- {table_meta.qualified_name} (columns: {', '.join(cols)})")
        
        existing_tables_str = "\n".join(existing_tables_info) if existing_tables_info else "None"
        
        system = (
            "You are an expert database architect.\n"
            "Your task is to analyze the user's natural language request to create a new database table and design a robust, clean PostgreSQL schema.\n\n"
            f"List of existing database tables that you can reference (foreign keys):\n{existing_tables_str}\n\n"
            "RULES:\n"
            "1. Infer the most appropriate table name (FQN - fully qualified name, default schema to 'public' unless requested otherwise).\n"
            "2. Infer all columns, choosing standard PostgreSQL datatypes (e.g. INTEGER, VARCHAR, TIMESTAMP, BOOLEAN, JSONB, NUMERIC).\n"
            "3. Always include a primary key column (typically 'id' with type 'SERIAL' or 'INTEGER').\n"
            "4. Detect relationships to the existing tables in the context, and specify 'foreign_key_table' and 'foreign_key_column' accordingly.\n"
            "5. If the user mentions constraints like 'cannot be null', 'must be unique', 'default to 0', 'must be greater than 10', configure 'nullable', 'is_unique', 'default_value', and 'check_constraint' correctly.\n"
            "6. If the user requests search or query optimization for a column, set 'has_index' to true.\n\n"
            "Output ONLY a valid JSON object matching the following structure (no explanations, no markdown formatting blocks):\n"
            "{\n"
            '  "fqn": "public.orders",\n'
            '  "columns": [\n'
            "    {\n"
            '      "name": "id",\n'
            '      "type": "SERIAL",\n'
            '      "nullable": false,\n'
            '      "is_primary_key": true,\n'
            '      "is_unique": false,\n'
            '      "default_value": "",\n'
            '      "check_constraint": "",\n'
            '      "foreign_key_table": "",\n'
            '      "foreign_key_column": "",\n'
            '      "has_index": false\n'
            "    },\n"
            "    {\n"
            '      "name": "customer_id",\n'
            '      "type": "INTEGER",\n'
            '      "nullable": false,\n'
            '      "is_primary_key": false,\n'
            '      "is_unique": false,\n'
            '      "default_value": "",\n'
            '      "check_constraint": "",\n'
            '      "foreign_key_table": "public.customers",\n'
            '      "foreign_key_column": "id",\n'
            '      "has_index": true\n'
            "    }\n"
            "  ]\n"
            "}\n"
        )
        
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            base_url=self.model._settings.ollama_base_url,
            api_key="ollama",
        )
        
        try:
            response = await client.chat.completions.create(
                model=self.model._settings.ollama_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"Request: {user_prompt}"}
                ],
                temperature=0.2,
                max_tokens=2048,
            )
        except Exception as exc:
            raise ValueError(f"Ollama schema generation failed: {exc}") from exc
            
        raw = response.choices[0].message.content or ""
        json_str = self._extract_json(raw)
        
        import json
        try:
            parsed = json.loads(json_str)
        except Exception as exc:
            logger.error("Failed to parse AI generated JSON schema: %s. Raw: %s", exc, raw)
            raise ValueError("The AI generated schema is not valid JSON. Please try describing the table again with different wording.") from exc
            
        if "fqn" not in parsed or "columns" not in parsed:
            raise ValueError("Generated JSON missing required 'fqn' or 'columns' keys")
            
        self._parse_and_validate_fqn(parsed["fqn"])
        
        sanitized_cols = []
        for col in parsed.get("columns", []):
            name = col.get("name")
            col_type = col.get("type", "VARCHAR")
            
            self._validate_column_name(name)
            self._validate_type(col_type)
            
            sanitized_cols.append({
                "name": name,
                "type": col_type,
                "nullable": bool(col.get("nullable", True)),
                "is_primary_key": bool(col.get("is_primary_key", False)),
                "is_unique": bool(col.get("is_unique", False)),
                "default_value": str(col.get("default_value") or ""),
                "check_constraint": str(col.get("check_constraint") or ""),
                "foreign_key_table": str(col.get("foreign_key_table") or ""),
                "foreign_key_column": str(col.get("foreign_key_column") or ""),
                "has_index": bool(col.get("has_index", False))
            })
            
        return {
            "fqn": parsed["fqn"],
            "columns": sanitized_cols
        }

    def _extract_json(self, raw: str) -> str:
        fence_match = re.search(r"```(?:json)?\s*(.*?)```", raw, re.DOTALL | re.IGNORECASE)
        if fence_match:
            return fence_match.group(1).strip()
        raw = re.sub(r"`+", "", raw)
        return raw.strip()

    # CamelCase alias
    async def generateProposedSchema(self, user_prompt: str) -> dict[str, Any]:
        return await self.generate_proposed_schema(user_prompt)
