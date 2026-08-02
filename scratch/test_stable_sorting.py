import sys
sys.path.insert(0, '.')
from fastapi.testclient import TestClient
from main import app

with TestClient(app) as client:
    print("--- 1. UPDATING ROW Sr_No = 4 ---")
    res1 = client.patch(
        "/schema/tables/public.student/rows",
        json={
            "row_id": 4,
            "pk_col": "Sr_No",
            "updates": {"Back": 0}
        }
    )
    print("Update status:", res1.status_code)

    print("\n--- 2. FETCHING TABLE ROWS (CHECKING ORDER) ---")
    res2 = client.get("/data/public.student/rows?page=1&page_size=50")
    print("Get rows status:", res2.status_code)
    rows = res2.json().get("rows", [])
    sr_nos = [r.get("Sr_No") for r in rows]
    print("Row order of Sr_No:", sr_nos)
    assert sr_nos == sorted(sr_nos), f"Row order should be sorted, got {sr_nos}"
    print("SUCCESS: Rows remain in stable primary key order after updates!")
