"""
view/cli/shell.py
──────────────────
Typer CLI for local use.

Commands:
  nl2sql query "show me all users"     — run a query
  nl2sql explain "show me all users"   — generate SQL without executing
  nl2sql sync                          — introspect DB and rebuild registry
  nl2sql health                        — check system status
  nl2sql log                           — show recent query history
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table
from rich.syntax import Syntax

app = typer.Typer(name="nl2sql", help="NL2SQL Engine — Convert natural language to SQL")
console = Console()


def _get_engine():
    """Bootstrap the engine synchronously for CLI use."""
    sys.path.insert(0, str(Path(__file__).parents[2]))
    from config.settings import get_settings
    from model.facade import ModelFacade
    from controller.query_controller import QueryController

    settings = get_settings()
    model = ModelFacade(settings)
    ctrl = QueryController(model, settings)
    return model, ctrl, settings


@app.command()
def query(
    question: str = typer.Argument(..., help="Natural language question"),
    db_id: str = typer.Option("default", "--db", help="Database ID"),
    json_output: bool = typer.Option(False, "--json", help="Output raw JSON"),
):
    """Convert a natural language question to SQL and execute it."""

    async def _run():
        model, ctrl, _ = _get_engine()
        await model.startup()
        try:
            result = await ctrl.handle(question, db_id=db_id)
            return result
        finally:
            await model.shutdown()

    result = asyncio.run(_run())

    if json_output:
        console.print_json(json.dumps(result, default=str))
        return

    if result.get("error"):
        console.print(f"[red]Error:[/red] {result['error']}")
        return

    # Display SQL
    console.print("\n[bold cyan]Generated SQL:[/bold cyan]")
    console.print(Syntax(result["sql"], "sql", theme="monokai"))

    # Display results table
    rows = result.get("rows", [])
    cols = result.get("columns", [])
    if rows and cols:
        table = Table(show_header=True, header_style="bold magenta")
        for col in cols:
            table.add_column(col)
        for row in rows[:50]:
            table.add_row(*[str(row.get(c, "")) for c in cols])
        console.print(f"\n[bold green]{result['row_count']} rows[/bold green] ({result['latency_ms']:.0f}ms)\n")
        console.print(table)
    else:
        console.print(f"\n[yellow]No rows returned[/yellow] ({result['latency_ms']:.0f}ms)")


@app.command()
def explain(
    question: str = typer.Argument(..., help="Natural language question"),
    db_id: str = typer.Option("default", "--db"),
):
    """Generate SQL + trace without executing the query."""

    async def _run():
        model, ctrl, _ = _get_engine()
        await model.startup()
        try:
            return await ctrl.explain_only(question, db_id=db_id)
        finally:
            await model.shutdown()

    result = asyncio.run(_run())
    console.print("\n[bold cyan]Generated SQL:[/bold cyan]")
    console.print(Syntax(result.get("sql", ""), "sql", theme="monokai"))
    console.print("\n[bold yellow]Tool Trace:[/bold yellow]")
    for tc in result.get("trace", {}).get("tool_calls", []):
        console.print(f"  Round {tc['round']}: [cyan]{tc['tool']}[/cyan]({tc['args']}) → {tc['result_summary']}")


@app.command()
def sync(
    verbose: bool = typer.Option(False, "--verbose", "-v"),
):
    """Introspect the database and rebuild the schema registry + embeddings."""

    async def _run():
        model, _, _ = _get_engine()
        await model.startup()
        try:
            count = await model.sync_schema()
            return count
        finally:
            await model.shutdown()

    with console.status("[bold green]Syncing schema...[/bold green]"):
        count = asyncio.run(_run())
    console.print(f"[bold green]✓[/bold green] Synced {count} tables")


@app.command()
def health():
    """Check engine health: DB connection, model status, tables loaded."""

    async def _run():
        model, _, settings = _get_engine()
        await model.startup()
        try:
            db_ok = False
            try:
                await model.db.execute("SELECT 1")
                db_ok = True
            except Exception:
                pass
            return {
                "db": "✓ connected" if db_ok else "✗ failed",
                "model": settings.ollama_model,
                "tables": model.registry.count(),
            }
        finally:
            await model.shutdown()

    info = asyncio.run(_run())
    console.print(f"DB:     [cyan]{info['db']}[/cyan]")
    console.print(f"Model:  [cyan]{info['model']}[/cyan]")
    console.print(f"Tables: [cyan]{info['tables']}[/cyan] loaded")


@app.command()
def log(limit: int = typer.Option(10, "--limit", "-n")):
    """Show recent query history."""

    async def _run():
        model, _, _ = _get_engine()
        await model.startup()
        try:
            return await model.query_log.recent(limit=limit)
        finally:
            await model.shutdown()

    entries = asyncio.run(_run())
    table = Table(show_header=True, header_style="bold magenta")
    table.add_column("ID", width=5)
    table.add_column("NL Query", width=40)
    table.add_column("SQL", width=50)
    table.add_column("OK", width=4)
    table.add_column("ms", width=8)

    for e in entries:
        table.add_row(
            str(e["id"]),
            e["nl_query"][:38],
            e["sql_query"][:48],
            "✓" if e["success"] else "✗",
            f"{e.get('latency_ms', 0):.0f}",
        )
    console.print(table)


if __name__ == "__main__":
    app()
