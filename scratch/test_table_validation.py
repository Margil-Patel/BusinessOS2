import re

def validate_tables_exist(sql: str, registered_tables: set) -> None:
    # Strip SQL comments
    sql_clean = re.sub(r"--.*?\n", "", sql)
    sql_clean = re.sub(r"/\*.*?\*/", "", sql_clean, flags=re.DOTALL)
    
    # Extract CTE names
    cte_names = set()
    with_match = re.search(r"\bWITH\s+([a-zA-Z0-9_]+)\s+AS", sql_clean, re.IGNORECASE)
    if with_match:
        cte_names.add(with_match.group(1).lower())
        # Find additional CTEs separated by commas
        extra_ctes = re.findall(r",\s*([a-zA-Z0-9_]+)\s+AS\b", sql_clean, re.IGNORECASE)
        for extra in extra_ctes:
            cte_names.add(extra.lower())
            
    matches = re.findall(
        r"\b(?:FROM|JOIN)\s+([a-zA-Z0-9_.\"\u0060]+)\b",
        sql_clean,
        re.IGNORECASE,
    )
    
    print(f"SQL: {sql.strip()}")
    print(f"Detected CTEs: {cte_names}")
    for m in matches:
        name = m.replace('"', '').replace('`', '').strip()
        if name.lower() in ("select", "where", "group", "order", "limit", "values", "join", "from"):
            continue
        if name.lower() in cte_names:
            print(f"  Table '{name}' is a local CTE.")
            continue
            
        # Check if table is registered
        is_registered = (name in registered_tables) or (name.split('.')[-1] in registered_tables)
        if not is_registered:
            print(f"  [ERR] Table '{name}' does not exist in the database.")
        else:
            print(f"  [OK] Table '{name}' exists.")

registered = {"tiles_business.tile_inventory", "tile_inventory", "agri_management.farmers", "farmers"}

sql1 = "SELECT * FROM core.orders o JOIN tiles_business.tile_inventory ti ON o.product_id = ti.tile_id"
validate_tables_exist(sql1, registered)

sql2 = """
WITH cte1 AS (
    SELECT * FROM tiles_business.tile_inventory
),
cte2 AS (
    SELECT * FROM agri_management.farmers
)
SELECT * FROM cte1 JOIN cte2 ON cte1.id = cte2.id
"""
validate_tables_exist(sql2, registered)
