import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://postgres:Margil%40123@localhost:5432/business_os2')
    rows = await conn.fetch("""
        SELECT table_schema, table_name, column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        ORDER BY table_schema, table_name, ordinal_position
    """)
    
    current_table = None
    for r in rows:
        tbl = f"{r['table_schema']}.{r['table_name']}"
        if tbl != current_table:
            current_table = tbl
            print(f"\nTable: {current_table}")
        print(f"  {r['column_name']} ({r['data_type']})")
        
    # Also let's print foreign key relationships
    fk_rows = await conn.fetch("""
        SELECT
            tc.table_schema, 
            tc.table_name, 
            kcu.column_name, 
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name 
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
    """)
    if fk_rows:
        print("\nForeign Keys:")
        for r in fk_rows:
            print(f"  {r['table_schema']}.{r['table_name']}.{r['column_name']} -> {r['foreign_table_schema']}.{r['foreign_table_name']}.{r['foreign_column_name']}")
    else:
        print("\nNo foreign keys found.")
        
    await conn.close()

asyncio.run(main())
