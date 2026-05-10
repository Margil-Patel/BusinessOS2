import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://postgres:Margil%40123@localhost:5432/business_os2')
    rows = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_schema='agri_management' AND table_name='farmers'")
    print("Columns:")
    for r in rows:
        print(r['column_name'])
    await conn.close()

asyncio.run(main())
