import json
import sqlite3

try:
    conn = sqlite3.connect(r'd:\DPR\Digitalized_DPR_Prod\backend-fastapi\dpr.db')
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT activityGroup FROM p6_activities")
    rows = cursor.fetchall()
    print("Activity Groups:", rows)
except Exception as e:
    print('Error:', e)
