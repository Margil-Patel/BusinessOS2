import urllib.request
import json

data = json.dumps({'nl_query': 'Show details of MC10'}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:8000/query', data=data, headers={'Content-Type': 'application/json'})

try:
    response = urllib.request.urlopen(req)
    print("Response Status:", response.status)
    print(json.dumps(json.loads(response.read().decode('utf-8')), indent=2))
except urllib.error.HTTPError as e:
    print("HTTP Error Status:", e.code)
    print(json.dumps(json.loads(e.read().decode('utf-8')), indent=2))
