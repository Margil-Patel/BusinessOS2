import sqlite3

conn = sqlite3.connect('nl2sql_log.db')
cursor = conn.cursor()
cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table'")
for table in cursor.fetchall():
    print("Table:", table[0])
    print("SQL:", table[1])
    print("-"*40)
    
    # Fetch column names
    cursor.execute(f"PRAGMA table_info({table[0]})")
    cols = [col[1] for col in cursor.fetchall()]
    print("Columns:", cols)
    
    # Fetch last 5 records
    cursor.execute(f"SELECT * FROM {table[0]} ORDER BY id DESC LIMIT 5")
    for row in cursor.fetchall():
        print(dict(zip(cols, row)))
        print("="*40)
conn.close()
