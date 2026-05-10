import asyncio
from config.settings import get_settings
from model.facade import ModelFacade

async def test():
    settings = get_settings()
    model = ModelFacade(settings)
    await model.startup()
    await model.sync_schema()
    
    results = await model.find_tables("farmers")
    print("Search results:")
    for r in results:
        print(f"Table: {r['qualified_name']}")
        print(f"Columns: {r['column_names']}")
    await model.shutdown()

asyncio.run(test())
