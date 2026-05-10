import urllib.request
import json

data = json.dumps({'nl_query': 'Show all farmers with villages'}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:8000/query', data=data, headers={'Content-Type': 'application/json'})
try:
    response = urllib.request.urlopen(req)
    print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(e.read().decode('utf-8'))
