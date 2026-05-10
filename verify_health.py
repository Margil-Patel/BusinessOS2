import urllib.request, json

r = urllib.request.urlopen("http://localhost:8000/health")
h = json.loads(r.read())
print("=== HEALTH ===")
print(json.dumps(h, indent=2))

r2 = urllib.request.urlopen("http://localhost:8000/tables")
tables = json.loads(r2.read())
print(f"\n=== TABLES ({len(tables)} loaded) ===")
for t in tables[:8]:
    desc = t.get("description") or "(no description)"
    print(f"  {t['qualified_name']}: {desc[:60]}")
if len(tables) > 8:
    print(f"  ... and {len(tables)-8} more")
