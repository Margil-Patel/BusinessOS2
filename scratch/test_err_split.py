import asyncio
import asyncpg
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:Margil%40123@localhost:5432/business_os2')
    async with engine.connect() as conn:
        try:
            await conn.execute(text("EXPLAIN SELECT * FROM core.orders"))
        except Exception as e:
            print("Type of e:", type(e))
            print("e.__cause__:", type(e.__cause__))
            print("str(e):")
            print(str(e))
            print("str(e.__cause__):")
            print(str(e.__cause__))
            print("split by [SQL: on cause:")
            print(str(e.__cause__).split("[SQL:")[0])
            print("split by [SQL: on e:")
            print(str(e).split("[SQL:")[0])
    await engine.dispose()

asyncio.run(main())
