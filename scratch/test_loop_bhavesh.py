import asyncio
import logging
from config.settings import get_settings
from model.facade import ModelFacade
from controller.agentic_loop import AgenticLoop

logging.basicConfig(level=logging.INFO)

async def test():
    settings = get_settings()
    model = ModelFacade(settings)
    await model.startup()
    await model.sync_schema()
    
    loop = AgenticLoop(model, settings)
    
    query = "Show details of Bhavesh Patel."
    print("Running agentic loop...")
    state = await loop.run(query)
    
    print("Success:", state.success)
    print("Final SQL:", repr(state.final_sql))
    print("Iteration:", state.iteration)
    print("Errors:", state.errors)
    print("Rows:", len(state.rows) if state.rows else 0)
    
    await model.shutdown()

asyncio.run(test())
