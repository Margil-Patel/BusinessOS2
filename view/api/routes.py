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
from controller.sql_validator import SQLValidationError, UnsafeQueryError
from view.schemas.request import QueryRequest
from view.schemas.response import HealthResponse, QueryResponse

logger = logging.getLogger(__name__)
router = APIRouter()


def get_controller(request: Request) -> QueryController:
    """FastAPI dependency — retrieves controller from app state."""
    return request.app.state.controller


def get_model(request: Request) -> Any:
    """FastAPI dependency — retrieves model facade from app state."""
    return request.app.state.model


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


@router.get("/log", response_model=list[dict], summary="Recent query history")
async def query_log(request: Request, limit: int = 20) -> list[dict[str, Any]]:
    """Returns the most recent query log entries."""
    model = get_model(request)
    return await model.query_log.recent(limit=limit)
