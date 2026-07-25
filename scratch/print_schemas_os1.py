import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://postgres:Margil%40123@localhost:5432/business_os')
    rows = await conn.fetch("""
        SELECT table_schema, table_name FROM information_schema.tables 
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY table_schema, table_name
    """)
    print("Tables in business_os:")
    for r in rows:
        print(f"  {r['table_schema']}.{r['table_name']}")
    await conn.close()

asyncio.run(main())
