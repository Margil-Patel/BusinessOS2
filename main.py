"""
main.py
────────
Uvicorn entry point for the NL2SQL Engine FastAPI application.

Startup sequence:
  1. Load settings from .env
  2. Connect to database
  3. Sync schema (introspect + embed)
  4. Start serving requests

Run: uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).parent))

from config.settings import get_settings
from controller.query_controller import QueryController
from model.facade import ModelFacade
from view.api.middleware import APIKeyMiddleware, RequestLoggingMiddleware
from view.api.routes import router

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("nl2sql")


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    settings = get_settings()

    logger.info("=== NL2SQL Engine starting up ===")
    logger.info("Model: %s | DB: %s", settings.ollama_model, settings.database_url.split("@")[-1])

    # Boot model layer
    model = ModelFacade(settings)
    await model.startup()

    # Sync schema on startup (idempotent)
    try:
        count = await model.sync_schema()
        logger.info("Schema sync: %d tables loaded", count)
    except Exception as exc:
        logger.warning("Schema sync failed (continuing): %s", exc)

    # Create controller
    controller = QueryController(model, settings)

    # Store in app state (View layer accesses via Depends)
    app.state.model = model
    app.state.controller = controller
    app.state.settings = settings

    logger.info("=== NL2SQL Engine ready ===")
    yield

    # Shutdown
    logger.info("=== NL2SQL Engine shutting down ===")
    await model.shutdown()


# ── App ───────────────────────────────────────────────────────────────────────
def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="NL2SQL Engine",
        description=(
            "Production-grade Natural Language to SQL engine. "
            "Powered by Ollama (qwen2.5:7b) with MVC architecture, "
            "semantic table search, and full tool-calling pipeline."
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # ── Middleware (order matters — last added = outermost) ───────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestLoggingMiddleware)
    if settings.is_production:
        app.add_middleware(APIKeyMiddleware, api_key=settings.api_key)

    # ── Routes ────────────────────────────────────────────────────────────────
    app.include_router(router, prefix="")

    return app


app = create_app()


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
