import asyncio
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import get_settings
from controller.query_controller import QueryController
from model.facade import ModelFacade

async def test_full_pipeline():
    settings = get_settings()
    model = ModelFacade(settings)
    await model.startup()
    # No sync needed as it was done in previous script, but ModelFacade does it on init or we can call it
    await model.sync_schema()
    
    controller = QueryController(model, settings)
    
    # Test case 1: Known value (Glossy)
    query1 = "how many tiles are of glossy types"
    print(f"Testing Query 1: {query1}")
    res1 = await controller.handle(query1)
    print(f"Generated SQL: {res1.get('sql')}")
    print(f"Result count: {res1.get('rows', [{}])[0].get('count')}")
    
    # Test case 2: Partially known or slightly misspelled to force ILIKE or glossary usage
    query2 = "list all gloss finish tiles"
    print(f"\nTesting Query 2: {query2}")
    res2 = await controller.handle(query2)
    print(f"Generated SQL: {res2.get('sql')}")
    
    await model.shutdown()

if __name__ == "__main__":
    asyncio.run(test_full_pipeline())
