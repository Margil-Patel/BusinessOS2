import re

def get_full_columns_sql(sql: str) -> str | None:
    sql_clean = re.sub(r"--.*?\n", "", sql)
    sql_clean = re.sub(r"/\*.*?\*/", "", sql_clean, flags=re.DOTALL)
    
    match = re.match(r"^(\s*SELECT\s+(?:DISTINCT\s+)?)(.*?)\bFROM\b", sql_clean, re.IGNORECASE | re.DOTALL)
    if match:
        select_prefix = match.group(1)
        projection = match.group(2)
        rest = sql_clean[match.end(2):]
        
        if '*' in projection:
            return None
            
        if re.search(r"\b(COUNT|SUM|AVG|MIN|MAX|GROUP\s+BY)\b", sql_clean, re.IGNORECASE):
            return None
            
        return f"{select_prefix}* {rest}"
    return None

queries = [
    "SELECT tile_name FROM tiles_business.tile_inventory WHERE finish_type = 'Glossy' LIMIT 500;",
    "SELECT DISTINCT tile_name FROM tiles_business.tile_inventory WHERE finish_type = 'Glossy' LIMIT 500;",
    "SELECT COUNT(*) FROM tiles_business.tile_inventory;",
    "SELECT category, COUNT(*) FROM tiles_business.tile_inventory GROUP BY category;",
    "SELECT tile_name, price_per_box FROM tiles_business.tile_inventory WHERE price_per_box > 500;"
]

for q in queries:
    rewritten = get_full_columns_sql(q)
    print(f"Original: {q.strip()}")
    print(f"Rewritten: {rewritten}\n")
