"""
tests/unit/test_data_service.py
────────────────────────────────
Unit tests for DataService — DML operations, identifier validation, and
transaction rollback behaviour.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from controller.data_service import DataService, DataServiceError


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_session():
    """Async context-manager mock for db.session()."""
    sess = AsyncMock()
    sess.__aenter__ = AsyncMock(return_value=sess)
    sess.__aexit__ = AsyncMock(return_value=None)
    # Default: execute returns a result with rowcount 0
    result = MagicMock()
    result.rowcount = 0
    result.fetchall.return_value = []
    result.keys.return_value = []
    result.scalar.return_value = 0
    sess.execute = AsyncMock(return_value=result)
    return sess


@pytest.fixture
def mock_model(mock_session):
    model = MagicMock()
    db = MagicMock()
    db.session.return_value = mock_session
    model.db = db
    model.sync_schema = AsyncMock(return_value=1)
    return model


@pytest.fixture
def svc(mock_model):
    return DataService(mock_model)


# ── Identifier validation ─────────────────────────────────────────────────────

class TestIdentifierValidation:

    def test_parse_valid_fqn_with_schema(self, svc):
        schema, table = svc._parse_and_validate_fqn("tiles_business.tile_inventory")
        assert schema == "tiles_business"
        assert table  == "tile_inventory"

    def test_parse_valid_fqn_bare_name_defaults_to_public(self, svc):
        schema, table = svc._parse_and_validate_fqn("orders")
        assert schema == "public"
        assert table  == "orders"

    def test_parse_fqn_rejects_semicolon(self, svc):
        with pytest.raises(DataServiceError, match="Unsafe identifier"):
            svc._parse_and_validate_fqn("tiles;drop.inventory")

    def test_parse_fqn_rejects_hyphen(self, svc):
        with pytest.raises(DataServiceError, match="Unsafe identifier"):
            svc._parse_and_validate_fqn("public.my-table")

    def test_parse_fqn_rejects_three_parts(self, svc):
        with pytest.raises(DataServiceError, match="too many dots"):
            svc._parse_and_validate_fqn("a.b.c")

    def test_parse_fqn_rejects_empty(self, svc):
        with pytest.raises(DataServiceError, match="cannot be empty"):
            svc._parse_and_validate_fqn("")

    def test_validate_column_name_valid(self, svc):
        svc._validate_column_name("unit_price")       # should not raise
        svc._validate_column_name("_internal_col")    # leading underscore OK

    def test_validate_column_name_rejects_space(self, svc):
        with pytest.raises(DataServiceError, match="Unsafe column name"):
            svc._validate_column_name("col name")

    def test_validate_column_name_rejects_sql_injection(self, svc):
        with pytest.raises(DataServiceError, match="Unsafe column name"):
            svc._validate_column_name("col; DROP TABLE users--")

    def test_validate_column_name_rejects_empty(self, svc):
        with pytest.raises(DataServiceError, match="cannot be empty"):
            svc._validate_column_name("")


# ── bulk_insert ───────────────────────────────────────────────────────────────

class TestBulkInsert:

    @pytest.mark.asyncio
    async def test_bulk_insert_rejects_empty_rows(self, svc):
        with pytest.raises(DataServiceError, match="cannot be empty"):
            await svc.bulk_insert("public.orders", [])

    @pytest.mark.asyncio
    async def test_bulk_insert_rejects_unsafe_column(self, svc):
        bad_rows = [{"valid_col": 1, "bad; col": 2}]
        with pytest.raises(DataServiceError, match="Unsafe column name"):
            await svc.bulk_insert("public.orders", bad_rows)

    @pytest.mark.asyncio
    async def test_bulk_insert_rejects_oversized_batch(self, svc):
        rows = [{"col": i} for i in range(501)]
        with pytest.raises(DataServiceError, match="exceeds maximum"):
            await svc.bulk_insert("public.orders", rows)

    @pytest.mark.asyncio
    async def test_bulk_insert_success(self, svc, mock_session):
        rows = [
            {"tile_name": "Marble A", "price_per_box": 500},
            {"tile_name": "Marble B", "price_per_box": 600},
        ]
        count = await svc.bulk_insert("tiles_business.tile_inventory", rows)
        assert count == 2
        assert mock_session.commit.called
        assert not mock_session.rollback.called

    @pytest.mark.asyncio
    async def test_bulk_insert_rolls_back_on_db_error(self, svc, mock_session):
        """If the second INSERT raises, the transaction must roll back."""
        call_count = 0

        async def side_effect(sql, params=None):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise RuntimeError("DB constraint violation")
            result = MagicMock()
            result.rowcount = 1
            return result

        mock_session.execute = side_effect

        rows = [{"col": "a"}, {"col": "b"}]
        with pytest.raises(RuntimeError, match="DB constraint violation"):
            await svc.bulk_insert("public.test_table", rows)

        assert mock_session.rollback.called
        assert not mock_session.commit.called


# ── bulk_update ───────────────────────────────────────────────────────────────

class TestBulkUpdate:

    @pytest.mark.asyncio
    async def test_bulk_update_rejects_empty_rows(self, svc):
        with pytest.raises(DataServiceError, match="cannot be empty"):
            await svc.bulk_update("public.orders", [])

    @pytest.mark.asyncio
    async def test_bulk_update_rejects_missing_pk_column(self, svc):
        rows = [{"pk_value": 1, "updates": {"status": "done"}}]
        with pytest.raises(DataServiceError, match="missing 'pk_column'"):
            await svc.bulk_update("public.orders", rows)

    @pytest.mark.asyncio
    async def test_bulk_update_rejects_empty_updates(self, svc):
        rows = [{"pk_column": "id", "pk_value": 1, "updates": {}}]
        with pytest.raises(DataServiceError, match="empty 'updates'"):
            await svc.bulk_update("public.orders", rows)

    @pytest.mark.asyncio
    async def test_bulk_update_rejects_unsafe_update_column(self, svc):
        rows = [{"pk_column": "id", "pk_value": 1, "updates": {"bad; col": "x"}}]
        with pytest.raises(DataServiceError, match="Unsafe column name"):
            await svc.bulk_update("public.orders", rows)

    @pytest.mark.asyncio
    async def test_bulk_update_success(self, svc, mock_session):
        result = MagicMock()
        result.rowcount = 1
        mock_session.execute = AsyncMock(return_value=result)

        rows = [
            {"pk_column": "id", "pk_value": 42, "updates": {"status": "shipped"}},
        ]
        updated = await svc.bulk_update("public.orders", rows)
        assert updated == 1
        assert mock_session.commit.called


# ── bulk_delete ───────────────────────────────────────────────────────────────

class TestBulkDelete:

    @pytest.mark.asyncio
    async def test_bulk_delete_rejects_empty_pk_values(self, svc):
        with pytest.raises(DataServiceError, match="cannot be empty"):
            await svc.bulk_delete("public.orders", "id", [])

    @pytest.mark.asyncio
    async def test_bulk_delete_rejects_unsafe_pk_column(self, svc):
        with pytest.raises(DataServiceError, match="Unsafe column name"):
            await svc.bulk_delete("public.orders", "id; DROP TABLE--", [1, 2])

    @pytest.mark.asyncio
    async def test_bulk_delete_rejects_oversized_list(self, svc):
        with pytest.raises(DataServiceError, match="exceeds maximum"):
            await svc.bulk_delete("public.orders", "id", list(range(1001)))

    @pytest.mark.asyncio
    async def test_bulk_delete_success(self, svc, mock_session):
        result = MagicMock()
        result.rowcount = 3
        mock_session.execute = AsyncMock(return_value=result)

        deleted = await svc.bulk_delete("public.orders", "id", [10, 11, 12])
        assert deleted == 3
        assert mock_session.commit.called

    @pytest.mark.asyncio
    async def test_bulk_delete_rolls_back_on_db_error(self, svc, mock_session):
        mock_session.execute = AsyncMock(side_effect=RuntimeError("FK violation"))

        with pytest.raises(RuntimeError, match="FK violation"):
            await svc.bulk_delete("public.orders", "id", [99])

        assert mock_session.rollback.called
        assert not mock_session.commit.called
