import sqlite3

conn = sqlite3.connect('nl2sql_log.db')
cursor = conn.cursor()
cursor.execute("SELECT nl_query, sql_query, success, error_msg FROM query_log ORDER BY id DESC LIMIT 5")
for r in cursor.fetchall():
    print("-" * 40)
    print("NL:", r[0])
    print("SQL:", repr(r[1]))
    print("Success:", r[2])
    print("Error:", r[3])

conn.close()
