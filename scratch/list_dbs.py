import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://postgres:Margil%40123@localhost:5432/postgres')
    rows = await conn.fetch("SELECT datname FROM pg_database WHERE datistemplate = false")
    print("Databases:")
    for r in rows:
        print(f"- {r['datname']}")
    await conn.close()

asyncio.run(main())
