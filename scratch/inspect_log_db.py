import sqlite3

conn = sqlite3.connect('nl2sql_log.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
print("Tables:", cursor.fetchall())

cursor.execute("SELECT count(*) FROM query_log")
print("Total log entries:", cursor.fetchone()[0])

cursor.execute("SELECT nl_query, sql_query, success, error_msg FROM query_log LIMIT 50")
for r in cursor.fetchall():
    print("-" * 40)
    print("NL:", r[0])
    print("SQL:", r[1])
    print("Success:", r[2])
    print("Error:", r[3])

conn.close()
