import sqlite3

try:
    conn = sqlite3.connect(r'd:\DPR\Digitalized_DPR_Prod\backend-fastapi\dpr.db')
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM p6_activities WHERE name LIKE '%cable%' OR name LIKE '%Cable%' LIMIT 50")
    rows = cursor.fetchall()
    for row in rows:
        print(row[0])
    
    print("---")
    cursor.execute("SELECT name FROM p6_activities WHERE name LIKE '%earthing%' OR name LIKE '%Earthing%' LIMIT 20")
    rows = cursor.fetchall()
    for row in rows:
        print(row[0])
except Exception as e:
    print('Error:', e)
