import requests
import json

try:
    res = requests.get('http://localhost:3316/api/dpr/supervisor/activities?projectId=1&dpr_category=Wind')
    data = res.json()
    
    # Dump all unique descriptions
    descs = set()
    for act in data:
        desc = act.get('description', '') or act.get('name', '')
        descs.add(desc)
    
    print("--- CABLE ---")
    for d in descs:
        if 'cable' in d.lower(): print(d)
        
    print("--- ACTIVITY GROUPS ---")
    groups = set(act.get('activityGroup') for act in data if act.get('activityGroup'))
    print(groups)
except Exception as e:
    print("Error:", e)
