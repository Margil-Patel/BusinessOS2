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

    history = [
        {"role": "user", "content": "give details of margil"},
        {"role": "assistant", "content": "SELECT * FROM public.student WHERE \"Name\" ILIKE 'Margil' LIMIT 500;"}
    ]

    print("--- RUNNING SECOND QUERY WITH HISTORY ---")
    res = await qc.handle("give details of margil", history=history)
    print("Result SQL:", res.get("sql"))
    print("Result Rows:", res.get("rows"))
    print("Trace:", res.get("trace"))
    await mf.shutdown()

asyncio.run(main())
