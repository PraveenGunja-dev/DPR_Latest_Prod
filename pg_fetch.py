import psycopg2
import json

try:
    conn = psycopg2.connect(
        host="127.0.0.1",
        port="5431",
        user="postgres",
        password="Prvn@3315",
        dbname="postgres"
    )
    cursor = conn.cursor()
    
    # Let's get all activities for projectId = 1
    query = """
    SELECT 
        a.activity_id, a.name, a.status, a.planned_start, a.planned_finish, 
        a.actual_start, a.actual_finish, a.project_id,
        b.wbs_name as locations,
        b.activity_group
    FROM 
        p6_activities a
    LEFT JOIN 
        p6_wbs b ON a.wbs_id = b.wbs_id
    WHERE a.project_id = '1'
    """
    cursor.execute(query)
    rows = cursor.fetchall()
    
    print(f"Total rows fetched: {len(rows)}")
    
    count = 0
    wtgs = set()
    for row in rows:
        activity_id, name, status, ps, pf, ast, af, proj_id, locations, activity_group = row
        desc = (name or "").strip().lower()
        grp = (activity_group or "").strip().upper()
        
        # Check if it matches USS Earthing fallback
        if 'earthing' in desc or 'earth pit' in desc:
            if grp not in ['ENG', 'PROC', 'PM']:
                if locations and locations.upper().startswith('WTG'):
                    count += 1
                    wtgs.add(locations.upper().strip())
                    print(f"Match {count}: {activity_id} | {desc} | Loc: {locations}")
    
    print(f"Total Matches: {count}")
    print(f"Unique WTG Locations: {len(wtgs)}")
    
    # Also find all WTG locations to see which one is missing!
    cursor.execute("SELECT DISTINCT wbs_name FROM p6_wbs WHERE wbs_name ILIKE 'WTG%' AND project_id='1'")
    all_wtgs = cursor.fetchall()
    all_wtgs_set = set(w[0].upper().strip() for w in all_wtgs)
    
    missing = all_wtgs_set - wtgs
    print(f"Missing WTG Locations: {missing}")
    
    # Print the missing WTG's activities to see what they are named
    for m in missing:
        print(f"--- Activities for missing location {m} ---")
        for row in rows:
            locations = row[8]
            if locations and locations.upper().strip() == m:
                print(row[1])

except Exception as e:
    print(f"Error: {e}")
