import sys
sys.path.insert(0, '.')
from fastapi.testclient import TestClient
from main import app

with TestClient(app) as client:
    print("--- TESTING GET column delete-check ---")
    res1 = client.get("/schema/tables/public.student/columns/Sem/delete-check")
    print("Status:", res1.status_code)
    print("Response:", res1.json())

    print("\n--- TESTING DELETE column ---")
    res2 = client.delete("/schema/tables/public.student/columns/Sem")
    print("Status:", res2.status_code)
    print("Response:", res2.json())
