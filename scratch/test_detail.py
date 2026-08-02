import sys
sys.path.insert(0, '.')
from fastapi.testclient import TestClient
from main import app

with TestClient(app) as client:
    print("--- TESTING GET /tables/public.student/data ---")
    res1 = client.get("/tables/public.student/data")
    print("Status:", res1.status_code)
    print("Data:", res1.json())

    print("\n--- TESTING GET /data/schema/public.student ---")
    res2 = client.get("/data/schema/public.student")
    print("Status:", res2.status_code)
    print("Schema:", res2.json())
