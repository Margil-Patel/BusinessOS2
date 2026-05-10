import asyncio
import logging
import sys
from config.settings import get_settings
from model.facade import ModelFacade
from controller.query_controller import QueryController

# Configure logging to stdout
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    stream=sys.stdout
)

async def test():
    settings = get_settings()
    model = ModelFacade(settings)
    await model.startup()
    await model.sync_schema()
    
    controller = QueryController(model, settings)
    
    query = "Show all village from the farmers table"
    print(f"\n--- Testing query: {query} ---")
    result = await controller.handle(query)
    
    print("\n--- Result ---")
    import json
    print(json.dumps(result, indent=2))
    
    await model.shutdown()

if __name__ == "__main__":
    asyncio.run(test())
