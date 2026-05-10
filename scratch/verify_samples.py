import asyncio
import os
from config.settings import Settings
from model.facade import ModelFacade

async def main():
    settings = Settings()
    model = ModelFacade(settings)
    await model.startup()
    await model.sync_schema()
    
    table = "tiles_business.tile_inventory"
    column = "finish_type"
    
    values = await model.get_sample_values(table, column)
    print(f"Values for {table}.{column}: {values}")
    
    await model.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
