import psycopg
conn = psycopg.connect('host=127.0.0.1 port=5432 dbname=DPR user=postgres password=Nikitha')
cur = conn.cursor()
cur.execute('''
        SELECT sa.object_id, sa.activity_id,
               sa.name, sa.status, sa.wbs_name,
               parent_wbs.name,
               sa.spv_no
        FROM solar_activities sa
        LEFT JOIN solar_wbs wbs_child ON sa.wbs_object_id = wbs_child.object_id
        LEFT JOIN solar_wbs parent_wbs ON wbs_child.parent_object_id = parent_wbs.object_id
        JOIN projects p ON sa.project_object_id = p.object_id
        WHERE sa.name = 'WTG1-CW-Soil Test' AND p.name ILIKE '%MANDVI%'
''')
print(cur.fetchall())
