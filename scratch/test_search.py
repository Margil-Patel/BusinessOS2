import sys
sys.path.insert(0, '.')
import asyncio
from config.settings import Settings
from model.facade import ModelFacade

async def main():
    s = Settings()
    mf = ModelFacade(s)
    await mf.startup()
    cols = await mf.db.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'student'")
    print("student cols:", cols)
    
    # Test search_data_values with all tables
    res = await mf.search_data_values('Margil', ['agri_management.farmers', 'dairy_ops.milk_collection_centers', 'garage_system.vehicles_serviced', 'medical_store.medicines', 'public.schema_versions', 'public.student', 'tiles_business.tile_inventory'])
    print("search_data_values result for Margil across all tables:", res)
    await mf.shutdown()

asyncio.run(main())
