"""
view/api/routes.py
───────────────────
FastAPI router. All routes delegate to QueryController.
The View layer NEVER imports from model/ — only controller types.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from controller.query_controller import QueryController
from controller.schema_service import SchemaService
from controller.sql_validator import SQLValidationError, UnsafeQueryError
from view.schemas.request import (
    QueryRequest,
    CreateTableRequest,
    AddColumnRequest,
    RenameColumnRequest,
    ChangeColumnTypeRequest,
    AlterTableRequest,
    GenerateAISchemaRequest,
)
from view.schemas.response import HealthResponse, QueryResponse, SchemaOperationResponse, DeletionSafetyResponse, SchemaVersionsListResponse, AISchemaProposalResponse

logger = logging.getLogger(__name__)
router = APIRouter()


def get_controller(request: Request) -> QueryController:
    """FastAPI dependency — retrieves controller from app state."""
    return request.app.state.controller


def get_model(request: Request) -> Any:
    """FastAPI dependency — retrieves model facade from app state."""
    return request.app.state.model


def get_schema_service(request: Request) -> SchemaService:
    """FastAPI dependency — retrieves schema service from app state."""
    if not hasattr(request.app.state, "schema_service"):
        from controller.schema_service import SchemaService
        request.app.state.schema_service = SchemaService(request.app.state.model)
    return request.app.state.schema_service


@router.post("/query", response_model=QueryResponse, summary="Convert natural language to SQL and execute")
async def query(
    req: QueryRequest,
    ctrl: QueryController = Depends(get_controller),
) -> QueryResponse:
    """
    Convert a natural language question to SQL and execute it against the database.

    - Runs the LLM tool-calling loop to gather schema context
    - Generates SQL using Ollama
    - Validates and executes the query
    - Returns results with full trace
    """
    try:
        result = await ctrl.handle(req.nl_query, history=req.history, db_id=req.db_id)
        return QueryResponse.from_dict(result)
    except UnsafeQueryError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except SQLValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("Unhandled error in /query: %s", exc)
        raise HTTPException(status_code=500, detail="Query pipeline failed")


@router.post("/explain", response_model=dict, summary="Generate SQL without executing")
async def explain(
    req: QueryRequest,
    ctrl: QueryController = Depends(get_controller),
) -> dict[str, Any]:
    """
    Dry-run: returns the generated SQL and tool-calling trace without executing the query.
    Useful for debugging and inspecting what the engine would do.
    """
    try:
        return await ctrl.explain_only(req.nl_query, history=req.history, db_id=req.db_id)
    except Exception as exc:
        logger.exception("Error in /explain: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/health", response_model=HealthResponse, summary="System health check")
async def health(request: Request) -> HealthResponse:
    """Returns engine status, model info, and DB connectivity."""
    model = get_model(request)
    settings = request.app.state.settings
    db_ok = False
    try:
        await model.db.execute("SELECT 1")
        db_ok = True
    except Exception:
        pass

    return HealthResponse(
        status="ok" if db_ok else "degraded",
        model=settings.ollama_model,
        db_connected=db_ok,
        tables_loaded=model.registry.count(),
    )


@router.get("/tables", response_model=list[dict], summary="List all registered tables")
async def list_tables(request: Request) -> list[dict[str, Any]]:
    """Returns all tables currently in the registry with their metadata."""
    model = get_model(request)
    return [t.to_dict() for t in model.registry.all_tables()]


@router.get("/tables/{fqn:path}/data", response_model=dict, summary="Get sample data for a table")
async def get_table_data(fqn: str, request: Request, limit: int = 50) -> dict[str, Any]:
    """Returns the first N rows for a specific table."""
    model = get_model(request)
    
    # Check if table exists in registry
    table = model.registry.get(fqn)
    if not table:
        raise HTTPException(status_code=404, detail=f"Table {fqn} not found")
    
    try:
        # Since we are fetching from a registered table, we trust the FQN
        # but we still use the DB abstraction
        query = f"SELECT * FROM {fqn} LIMIT {limit}"
        rows = await model.db.execute(query)
        columns = list(rows[0].keys()) if rows else []
        
        return {
            "fqn": fqn,
            "rows": rows,
            "columns": columns,
            "row_count": len(rows)
        }
    except Exception as exc:
        logger.exception("Error fetching data for table %s: %s", fqn, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/tables/{fqn:path}/insert", response_model=dict, summary="Insert a new row into a table")
async def insert_table_row(
    fqn: str,
    row_data: dict,
    request: Request,
    schema_service: SchemaService = Depends(get_schema_service),
) -> dict[str, Any]:
    """Inserts a new row into the specified table."""
    model = get_model(request)
    
    # Check if table exists in registry
    table = model.registry.get(fqn)
    if not table:
        raise HTTPException(status_code=404, detail=f"Table {fqn} not found")
        
    if not row_data:
        raise HTTPException(status_code=422, detail="No data provided for insertion")
        
    try:
        # Resolve table and schema parts
        parts = fqn.split(".")
        schema = parts[0] if len(parts) > 1 else "public"
        table_name = parts[-1]

        # Query existing columns of the table
        cols_rows = await model.db.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = :schema AND table_name = :table",
            {"schema": schema, "table": table_name}
        )
        existing_columns = {r["column_name"] for r in cols_rows}

        # Check for missing columns and dynamically alter table using SchemaService
        columns = list(row_data.keys())
        missing_columns = [col for col in columns if col not in existing_columns]
        
        if missing_columns:
            for missing_col in missing_columns:
                await schema_service.add_column(fqn, missing_col, "VARCHAR")

        # Build parameterized INSERT statement securely
        col_names_str = ", ".join(f'"{col}"' for col in columns)
        val_placeholders = ", ".join(f":{col}" for col in columns)
        
        sql = f"INSERT INTO {fqn} ({col_names_str}) VALUES ({val_placeholders})"
        
        await model.db.execute(sql, row_data)
        
        return {
            "success": True,
            "message": f"Successfully inserted row into {fqn}",
            "data": row_data
        }
    except Exception as exc:
        logger.exception("Error inserting row into table %s: %s", fqn, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/log", response_model=list[dict], summary="Recent query history")
async def query_log(request: Request, limit: int = 20) -> list[dict[str, Any]]:
    """Returns the most recent query log entries."""
    model = get_model(request)
    return await model.query_log.recent(limit=limit)


@router.post("/schema/tables", response_model=SchemaOperationResponse, summary="Create a new table")
async def create_table(
    request: Request,
    req: CreateTableRequest,
    schema_service: SchemaService = Depends(get_schema_service),
) -> SchemaOperationResponse:
    try:
        model = get_model(request)
        await schema_service.create_table(req.fqn, req.columns)
        table_meta = model.registry.get(req.fqn)
        return SchemaOperationResponse(
            success=True,
            message=f"Table {req.fqn} created successfully",
            data=table_meta.to_dict() if table_meta else {"fqn": req.fqn}
        )
    except Exception as exc:
        logger.exception("Error creating table %s: %s", req.fqn, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/schema/tables/{fqn:path}/columns", response_model=SchemaOperationResponse, summary="Add a column to a table")
async def add_column(
    fqn: str,
    req: AddColumnRequest,
    schema_service: SchemaService = Depends(get_schema_service),
) -> SchemaOperationResponse:
    try:
        await schema_service.add_column(fqn, req.name, req.type)
        return SchemaOperationResponse(
            success=True,
            message=f"Column {req.name} added to table {fqn} successfully",
            data={"fqn": fqn, "column_name": req.name, "column_type": req.type}
        )
    except Exception as exc:
        logger.exception("Error adding column %s to table %s: %s", req.name, fqn, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/schema/tables/{fqn:path}/columns/{column_name}/rename", response_model=SchemaOperationResponse, summary="Rename a column")
async def rename_column(
    fqn: str,
    column_name: str,
    req: RenameColumnRequest,
    schema_service: SchemaService = Depends(get_schema_service),
) -> SchemaOperationResponse:
    try:
        await schema_service.rename_column(fqn, column_name, req.new_name)
        return SchemaOperationResponse(
            success=True,
            message=f"Column {column_name} renamed to {req.new_name} in table {fqn} successfully",
            data={"fqn": fqn, "old_name": column_name, "new_name": req.new_name}
        )
    except Exception as exc:
        logger.exception("Error renaming column %s to %s in table %s: %s", column_name, req.new_name, fqn, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/schema/tables/{fqn:path}/columns/{column_name}/type", response_model=SchemaOperationResponse, summary="Alter column type")
async def change_column_type(
    fqn: str,
    column_name: str,
    req: ChangeColumnTypeRequest,
    schema_service: SchemaService = Depends(get_schema_service),
) -> SchemaOperationResponse:
    try:
        await schema_service.change_column_type(fqn, column_name, req.new_type)
        return SchemaOperationResponse(
            success=True,
            message=f"Column {column_name} type changed to {req.new_type} in table {fqn} successfully",
            data={"fqn": fqn, "column_name": column_name, "new_type": req.new_type}
        )
    except Exception as exc:
        logger.exception("Error changing column %s type in table %s: %s", column_name, fqn, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/schema/tables/{fqn:path}/columns/{column_name}", response_model=SchemaOperationResponse, summary="Drop a column")
async def drop_column(
    fqn: str,
    column_name: str,
    schema_service: SchemaService = Depends(get_schema_service),
) -> SchemaOperationResponse:
    try:
        await schema_service.drop_column(fqn, column_name)
        return SchemaOperationResponse(
            success=True,
            message=f"Column {column_name} dropped from table {fqn} successfully",
            data={"fqn": fqn, "column_name": column_name}
        )
    except Exception as exc:
        logger.exception("Error dropping column %s from table %s: %s", column_name, fqn, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/schema/tables/{fqn:path}/alter", response_model=SchemaOperationResponse, summary="Alter an existing table schema")
async def alter_table(
    fqn: str,
    request: Request,
    req: AlterTableRequest,
    schema_service: SchemaService = Depends(get_schema_service),
) -> SchemaOperationResponse:
    try:
        model = get_model(request)
        # Convert columns to list of dicts for SchemaService
        cols_list = [col.model_dump() for col in req.columns]
        await schema_service.alter_table(fqn, cols_list)
        table_meta = model.registry.get(fqn)
        return SchemaOperationResponse(
            success=True,
            message=f"Table {fqn} altered successfully",
            data=table_meta.to_dict() if table_meta else {"fqn": fqn}
        )
    except Exception as exc:
        logger.exception("Error altering table %s: %s", fqn, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/schema/tables/{fqn:path}/delete-check", response_model=DeletionSafetyResponse, summary="Check table deletion safety")
async def check_table_deletion(
    fqn: str,
    schema_service: SchemaService = Depends(get_schema_service),
) -> DeletionSafetyResponse:
    try:
        report = await schema_service.get_table_deletion_report(fqn)
        return DeletionSafetyResponse(
            success=True,
            safe=report["safe"],
            has_data=report["has_data"],
            row_count=report["row_count"],
            dependent_fks=report["dependent_fks"],
            indexes=report["indexes"],
            warnings=report["warnings"]
        )
    except Exception as exc:
        logger.exception("Error checking deletion safety for table %s: %s", fqn, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/schema/tables/{fqn:path}/columns/{column_name}/delete-check", response_model=DeletionSafetyResponse, summary="Check column deletion safety")
async def check_column_deletion(
    fqn: str,
    column_name: str,
    schema_service: SchemaService = Depends(get_schema_service),
) -> DeletionSafetyResponse:
    try:
        report = await schema_service.get_column_deletion_report(fqn, column_name)
        return DeletionSafetyResponse(
            success=True,
            safe=report["safe"],
            has_data=report["has_data"],
            row_count=report["row_count"],
            dependent_fks=report["dependent_fks"],
            indexes=report["indexes"],
            warnings=report["warnings"]
        )
    except Exception as exc:
        logger.exception("Error checking deletion safety for column %s.%s: %s", fqn, column_name, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/schema/tables/{fqn:path}", response_model=SchemaOperationResponse, summary="Drop a table")
async def drop_table(
    fqn: str,
    schema_service: SchemaService = Depends(get_schema_service),
) -> SchemaOperationResponse:
    try:
        await schema_service.drop_table(fqn)
        return SchemaOperationResponse(
            success=True,
            message=f"Table {fqn} dropped successfully",
            data={"fqn": fqn}
        )
    except Exception as exc:
        logger.exception("Error dropping table %s: %s", fqn, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/schema/tables/{fqn:path}/versions", response_model=SchemaVersionsListResponse, summary="Get table schema versions")
async def get_table_versions(
    fqn: str,
    schema_service: SchemaService = Depends(get_schema_service),
) -> SchemaVersionsListResponse:
    try:
        versions = await schema_service.get_table_versions(fqn)
        return SchemaVersionsListResponse(
            success=True,
            versions=versions
        )
    except Exception as exc:
        logger.exception("Error getting schema versions for table %s: %s", fqn, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/schema/tables/{fqn:path}/versions/{version_number:int}/restore", response_model=SchemaOperationResponse, summary="Restore table schema version")
async def restore_schema_version(
    fqn: str,
    version_number: int,
    schema_service: SchemaService = Depends(get_schema_service),
) -> SchemaOperationResponse:
    try:
        await schema_service.restore_schema_version(fqn, version_number)
        return SchemaOperationResponse(
            success=True,
            message=f"Table {fqn} restored to version {version_number} successfully",
            data={"fqn": fqn, "version": version_number}
        )
    except Exception as exc:
        logger.exception("Error restoring schema version %s for table %s: %s", version_number, fqn, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/schema/ai/generate", response_model=AISchemaProposalResponse, summary="Generate a proposed schema from natural language")
async def generate_proposed_schema(
    req: GenerateAISchemaRequest,
    schema_service: SchemaService = Depends(get_schema_service),
) -> AISchemaProposalResponse:
    try:
        proposal = await schema_service.generate_proposed_schema(req.prompt)
        return AISchemaProposalResponse(
            success=True,
            fqn=proposal["fqn"],
            columns=proposal["columns"]
        )
    except Exception as exc:
        logger.exception("Error generating proposed schema from natural language: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
