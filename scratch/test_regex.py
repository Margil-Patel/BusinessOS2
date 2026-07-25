import re

sql = "SELECT tile_name \nFROM tiles_business.tile_inventory \nWHERE finish_type ILIKE 'Glossy' \nLIMIT 500;"

sql_clean = re.sub(r"--.*?\n", "", sql)
sql_clean = re.sub(r"/\*.*?\*/", "", sql_clean, flags=re.DOTALL)

match = re.match(r"^(\s*SELECT\s+(?:DISTINCT\s+)?)(.*?)\bFROM\b", sql_clean, re.IGNORECASE | re.DOTALL)
if match:
    print("Match found!")
    select_prefix = match.group(1)
    projection = match.group(2)
    rest = sql_clean[match.end(2):]
    print("Prefix:", repr(select_prefix))
    print("Projection:", repr(projection))
    print("Rest:", repr(rest))
    
    # Check conditions
    has_star = '*' in projection
    has_agg = re.search(r"\b(COUNT|SUM|AVG|MIN|MAX|GROUP\s+BY)\b", sql_clean, re.IGNORECASE)
    print("has_star:", has_star)
    print("has_agg:", bool(has_agg))
else:
    print("No match found!")
