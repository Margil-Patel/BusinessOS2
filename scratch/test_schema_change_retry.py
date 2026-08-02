import sys
sys.path.insert(0, '.')
from fastapi.testclient import TestClient
from main import app

with TestClient(app) as client:
    print("--- 1. ADDING COLUMN test_col_1 ---")
    res1 = client.post("/schema/tables/public.student/columns", json={"name": "test_col_1", "type": "VARCHAR(255)"})
    print("Add Column Status:", res1.status_code)

    print("\n--- 2. IMMEDIATELY FETCHING TABLE DATA ---")
    res2 = client.get("/tables/public.student/data")
    print("Get Data Status:", res2.status_code)
    print("Columns Returned:", res2.json().get("columns"))

    print("\n--- 3. DROPPING COLUMN test_col_1 ---")
    res3 = client.delete("/schema/tables/public.student/columns/test_col_1")
    print("Drop Column Status:", res3.status_code)

    print("\n--- 4. IMMEDIATELY FETCHING TABLE DATA AGAIN ---")
    res4 = client.get("/tables/public.student/data")
    print("Get Data Status:", res4.status_code)
    print("Columns Returned:", res4.json().get("columns"))
