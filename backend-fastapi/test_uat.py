import psycopg2, json

try:
    conn = psycopg2.connect('postgres://psqladmin:1k8h02grUu%2BqJ2uHZb%3C%7BlB3LF%25%2BYj-Ar@az10psqldmrcbtp01.postgres.database.azure.com:5432/DPR_UAT?sslmode=require')
    cur = conn.cursor()
    cur.execute("SELECT id, data_json FROM dpr_supervisor_entries WHERE project_id = (SELECT id FROM projects WHERE short_name LIKE '%ASEJ2L%') AND sheet_type = 'manpower_details_2' ORDER BY id DESC LIMIT 1")
    row = cur.fetchone()
    print("row:", row[0] if row else "None")
    if row:
        data = row[1]
        if isinstance(data, str):
            data = json.loads(data)
        rows = data.get('rows', [])
        print("num rows:", len(rows))
        for r in rows:
            print("isDeleted:", r.get('isDeleted', False), "activity:", r.get('activity'))
except Exception as e:
    print(e)
