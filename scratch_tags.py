import urllib.request
import json
try:
    response = urllib.request.urlopen("http://127.0.0.1:11434/api/tags")
    data = json.loads(response.read().decode('utf-8'))
    print("Models:", [m['name'] for m in data.get('models', [])])
except Exception as e:
    print("Error:", e)
