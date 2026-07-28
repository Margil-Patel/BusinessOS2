import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://postgres:Margil%40123@localhost:5432/business_os2')
    rows = await conn.fetch("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='tiles_business' AND table_name='tile_inventory'")
    print("Columns:")
    for r in rows:
        print(f"{r['column_name']} ({r['data_type']})")
    await conn.close()

asyncio.run(main())
