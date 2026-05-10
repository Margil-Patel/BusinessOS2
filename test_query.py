import requests
import json
url = "http://localhost:8000/query"
payload = {"nl_query": "Show all villages", "client_id": "test"}
response = requests.post(url, json=payload)
print(json.dumps(response.json(), indent=2))
