import psycopg
import re
def extract_location(name: str) -> str:
    m = re.match(r'(WTG\d+)', name or '', re.IGNORECASE)
    return m.group(1).upper() if m else ''

conn = psycopg.connect('host=127.0.0.1 port=5432 dbname=DPR user=postgres password=Nikitha')
cur = conn.cursor()
cur.execute("""
        SELECT sa.object_id, sa.activity_id,
               sa.name, sa.status, sa.wbs_name,
               parent_wbs.name
        FROM solar_activities sa
        LEFT JOIN solar_wbs wbs_child ON sa.wbs_object_id = wbs_child.object_id
        LEFT JOIN solar_wbs parent_wbs ON wbs_child.parent_object_id = parent_wbs.object_id
        WHERE sa.project_object_id = 3105
""")
rows = cur.fetchall()
for r in rows:
    name = r[2]
    parent_wbs = r[5] or ''
    location = extract_location(name)
    if name == 'WTG1-CW-Soil Test':
        print('Before:', location, 'parent_wbs:', repr(parent_wbs))
    if parent_wbs and 'WTG' in parent_wbs.upper() and location:
        location = parent_wbs
    if name == 'WTG1-CW-Soil Test':
        print('After:', location)
