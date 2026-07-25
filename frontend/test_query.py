import sqlite3
import json

conn = sqlite3.connect('../backend-fastapi/dpr_data.db')
cursor = conn.cursor()
cursor.execute('SELECT data_json FROM dpr_drafts WHERE sheet_type="manpower_details_2" ORDER BY created_at DESC LIMIT 1')
row = cursor.fetchone()
if row:
    print(row[0][:500])
else:
    print("No draft data")
