import sys
sys.path.insert(0, '.')
import asyncio
from config.settings import Settings
from model.facade import ModelFacade
from controller.query_controller import QueryController

async def main():
    s = Settings()
    mf = ModelFacade(s)
    await mf.startup()
    await mf.sync_schema()
    qc = QueryController(mf, s)
    res = await qc.handle("give details of margil")
    print("Result:", res)
    await mf.shutdown()

asyncio.run(main())
