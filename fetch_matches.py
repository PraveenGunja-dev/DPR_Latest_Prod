import requests
import json

try:
    res = requests.get('http://localhost:3316/api/dpr/supervisor/activities?projectId=1&dpr_category=Wind')
    data = res.json()
    
    print("--- USS ERECTION MATCHES ---")
    count = 0
    for act in data:
        desc = (act.get('description', '') or act.get('name', '')).strip().lower()
        grp = (act.get('activityGroup') or '').strip().upper()
        
        # Dashboard logic for USS Erection:
        # withoutUssMaster = 'erection'
        # fullDescNorm.includes('erection') && (fullDesc.toUpperCase().includes('-EL-') || fullDesc.toUpperCase().includes(' USS '))
        
        if 'erection' in desc and ('-el-' in desc or ' uss ' in desc):
            if grp not in ['ENG', 'PROC', 'PM']:
                count += 1
                print(f"{count}: {act.get('activityId')} | {desc} | {grp} | Loc: {act.get('locations')}")
                
    print(f"Total USS Erection counted: {count}")
    
    print("\n--- WTG ERECTION MATCHES ---")
    count2 = 0
    for act in data:
        desc = (act.get('description', '') or act.get('name', '')).strip().lower()
        grp = (act.get('activityGroup') or '').strip().upper()
        
        # Dashboard logic for WTG Erection:
        # withoutWtgMaster = 'erection'
        # if not 'road construction', return fullDesc.includes('-ERW-') || fullDesc.includes('ERECTION WORKS')
        
        if 'erection' in desc and 'road construction' not in desc:
            if '-erw-' in desc or 'erection works' in desc:
                if grp not in ['ENG', 'PROC', 'PM']:
                    count2 += 1
                    print(f"{count2}: {act.get('activityId')} | {desc} | {grp} | Loc: {act.get('locations')}")
                    
    print(f"Total WTG Erection counted: {count2}")
    
except Exception as e:
    print("Error:", e)
