import asyncio
import logging
from config.settings import get_settings
from model.facade import ModelFacade
from controller.agentic_loop import AgenticLoop

logging.basicConfig(level=logging.WARNING)

QUERIES = [
    "give details of bhavesh patel",
    "who is bhavesh patel",
    "details of bhavesh",
    "show details about bhavesh patel",
    "give enrollment number of maitry",
    "find farmer named bhavesh",
    "show information for farmer bhavesh patel",
    "tell me about rakesh joshi",
]

async def test():
    settings = get_settings()
    model = ModelFacade(settings)
    await model.startup()
    await model.sync_schema()

    loop = AgenticLoop(model, settings)

    for q in QUERIES:
        print(f"\n==================== QUERY: '{q}' ====================")
        try:
            state = await loop.run(q)
            print("Success:", state.success)
            print("Final SQL:", state.final_sql)
            if not state.success:
                print("Errors:", state.errors)
        except Exception as e:
            print("EXCEPTION:", e)

    await model.shutdown()

if __name__ == "__main__":
    asyncio.run(test())
