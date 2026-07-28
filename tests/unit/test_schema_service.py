"""
tests/unit/test_schema_service.py
──────────────────────────────────
Unit tests for SchemaService — DDL execution, validation, and metadata synchronization.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from controller.schema_service import SchemaService


@pytest.fixture
def mock_session():
    sess = AsyncMock()
    # Mock context manager behavior
    sess.__aenter__.return_value = sess
    sess.__aexit__.return_value = None
    return sess


@pytest.fixture
def mock_model(mock_session):
    model = MagicMock()
    
    # Mock db.session() context manager to yield the mock_session
    db = MagicMock()
    db.session.return_value = mock_session
    model.db = db
    
    # Mock sync_schema
    model.sync_schema = AsyncMock(return_value=1)
    
    return model


@pytest.fixture
def schema_service(mock_model):
    return SchemaService(mock_model)


class TestSchemaServiceValidation:
    # ── FQN Validation ────────────────────────────────────────────────────────
    def test_parse_valid_fqn(self, schema_service):
        schema, table = schema_service._parse_and_validate_fqn("tiles_business.tile_inventory")
        assert schema == "tiles_business"
        assert table == "tile_inventory"

    def test_parse_valid_fqn_default_schema(self, schema_service):
        schema, table = schema_service._parse_and_validate_fqn("tile_inventory")
        assert schema == "public"
        assert table == "tile_inventory"

    def test_parse_fqn_invalid_characters(self, schema_service):
        with pytest.raises(ValueError, match="Invalid identifier name"):
            schema_service._parse_and_validate_fqn("tiles;drop.tile_inventory")
            
        with pytest.raises(ValueError, match="Invalid identifier name"):
            schema_service._parse_and_validate_fqn("tiles_business.tile-inventory")

    def test_parse_fqn_too_many_parts(self, schema_service):
        with pytest.raises(ValueError, match="Invalid table name format"):
            schema_service._parse_and_validate_fqn("db.schema.table")

    def test_parse_fqn_empty(self, schema_service):
        with pytest.raises(ValueError, match="Table name .* cannot be empty"):
            schema_service._parse_and_validate_fqn("")

    # ── Column Name Validation ────────────────────────────────────────────────
    def test_valid_column_name(self, schema_service):
        schema_service._validate_column_name("price_per_box")
        schema_service._validate_column_name("color")

    def test_invalid_column_name(self, schema_service):
        with pytest.raises(ValueError, match="Invalid column name"):
            schema_service._validate_column_name("price-per-box")
            
        with pytest.raises(ValueError, match="Invalid column name"):
            schema_service._validate_column_name("price; --")

    # ── Data Type Validation ──────────────────────────────────────────────────
    def test_valid_types(self, schema_service):
        schema_service._validate_type("VARCHAR(255)")
        schema_service._validate_type("DECIMAL(10, 2)")
        schema_service._validate_type("INT")

    def test_invalid_types_rejected(self, schema_service):
        with pytest.raises(ValueError, match="Invalid data type"):
            schema_service._validate_type("VARCHAR; DROP TABLE users;")


class TestSchemaServiceOperations:
    @pytest.mark.asyncio
    async def test_create_table_dict_columns(self, schema_service, mock_session, mock_model):
        cols = {"id": "SERIAL PRIMARY KEY", "name": "VARCHAR(255)"}
        await schema_service.create_table("sales.orders", cols)
        
        # Verify transaction session used
        mock_model.db.session.assert_called_once()
        
        # Verify correct SQL executed
        execute_args = mock_session.execute.call_args[0][0]
        # Text query object string check
        assert "CREATE TABLE \"sales\".\"orders\"" in str(execute_args)
        assert '"id" SERIAL PRIMARY KEY' in str(execute_args)
        assert '"name" VARCHAR(255)' in str(execute_args)
        
        # Verify commit and sync
        mock_session.commit.assert_called_once()
        mock_model.sync_schema.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_table_list_columns(self, schema_service, mock_session, mock_model):
        cols = [{"name": "id", "type": "INT"}, {"name": "val", "type": "VARCHAR"}]
        await schema_service.create_table("orders", cols)
        
        execute_args = mock_session.execute.call_args[0][0]
        assert "CREATE TABLE \"public\".\"orders\"" in str(execute_args)
        assert '"id" INT' in str(execute_args)
        assert '"val" VARCHAR' in str(execute_args)

    @pytest.mark.asyncio
    async def test_add_column(self, schema_service, mock_session, mock_model):
        await schema_service.add_column("sales.orders", "created_at", "TIMESTAMP")
        
        execute_args = mock_session.execute.call_args[0][0]
        assert "ALTER TABLE \"sales\".\"orders\" ADD COLUMN \"created_at\" TIMESTAMP" in str(execute_args)
        mock_session.commit.assert_called_once()
        mock_model.sync_schema.assert_called_once()

    @pytest.mark.asyncio
    async def test_rename_column(self, schema_service, mock_session, mock_model):
        await schema_service.rename_column("sales.orders", "val", "value")
        
        execute_args = mock_session.execute.call_args[0][0]
        assert "ALTER TABLE \"sales\".\"orders\" RENAME COLUMN \"val\" TO \"value\"" in str(execute_args)
        mock_session.commit.assert_called_once()
        mock_model.sync_schema.assert_called_once()

    @pytest.mark.asyncio
    async def test_drop_column(self, schema_service, mock_session, mock_model):
        await schema_service.drop_column("sales.orders", "value")
        
        execute_args = mock_session.execute.call_args[0][0]
        assert "ALTER TABLE \"sales\".\"orders\" DROP COLUMN \"value\"" in str(execute_args)
        mock_session.commit.assert_called_once()
        mock_model.sync_schema.assert_called_once()

    @pytest.mark.asyncio
    async def test_change_column_type(self, schema_service, mock_session, mock_model):
        await schema_service.change_column_type("sales.orders", "created_at", "DATE")
        
        execute_args = mock_session.execute.call_args[0][0]
        assert "ALTER TABLE \"sales\".\"orders\" ALTER COLUMN \"created_at\" TYPE DATE" in str(execute_args)
        mock_session.commit.assert_called_once()
        mock_model.sync_schema.assert_called_once()

    @pytest.mark.asyncio
    async def test_camel_case_aliases(self, schema_service, mock_session, mock_model):
        # Test camel case versions execute correctly
        await schema_service.addColumn("sales.orders", "test_col", "TEXT")
        mock_session.commit.assert_called()
        mock_model.sync_schema.assert_called()
