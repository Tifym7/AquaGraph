import requests
import time

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

query = """
[out:json][timeout:25];
area["ISO3166-1"="RO"][admin_level=2]->.ro;
way["waterway"="river"](area.ro);
out count;
"""

print("Querying Overpass")
resp = requests.post(
    OVERPASS_URL, 
    data={"data": query},
    headers={"User-Agent": "AquaGraph/1.0", "Accept": "*/*"}
)

print(f"Status: {resp.status_code}")
if resp.status_code != 200:
    print(resp.text)
else:
    print(resp.json())
