import sys
sys.path.insert(0, '.')
from fastapi.testclient import TestClient
from main import app

with TestClient(app) as client:
    print("--- 1. FETCHING CURRENT TABLE DATA ---")
    res1 = client.get("/tables/public.student/data")
    cols = res1.json().get("columns", [])
    print("Current columns:", cols)

    print("\n--- 2. ALTERING TABLE: SET Enrollment_No AS PRIMARY KEY ---")
    target_cols = [
        {"name": "Sr_No", "type": "INTEGER", "nullable": False, "is_primary_key": False, "original_name": "Sr_No"},
        {"name": "Name", "type": "VARCHAR", "nullable": True, "is_primary_key": False, "original_name": "Name"},
        {"name": "Enrollment_No", "type": "BIGINT", "nullable": False, "is_primary_key": True, "original_name": "Enrollment_No"},
        {"name": "sem", "type": "INTEGER", "nullable": True, "is_primary_key": False, "original_name": "sem"},
        {"name": "Back", "type": "INTEGER", "nullable": True, "is_primary_key": False, "original_name": "Back"},
    ]
    res2 = client.post("/schema/tables/public.student/alter", json={"columns": target_cols})
    print("Alter Status:", res2.status_code)

    print("\n--- 3. REVERTING TABLE: RESET Sr_No AS PRIMARY KEY ---")
    revert_cols = [
        {"name": "Sr_No", "type": "INTEGER", "nullable": False, "is_primary_key": True, "original_name": "Sr_No"},
        {"name": "Name", "type": "VARCHAR", "nullable": True, "is_primary_key": False, "original_name": "Name"},
        {"name": "Enrollment_No", "type": "BIGINT", "nullable": False, "is_primary_key": False, "original_name": "Enrollment_No"},
        {"name": "sem", "type": "INTEGER", "nullable": True, "is_primary_key": False, "original_name": "sem"},
        {"name": "Back", "type": "INTEGER", "nullable": True, "is_primary_key": False, "original_name": "Back"},
    ]
    res3 = client.post("/schema/tables/public.student/alter", json={"columns": revert_cols})
    print("Revert Status:", res3.status_code)
