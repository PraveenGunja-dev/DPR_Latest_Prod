import psycopg

try:
    conn = psycopg.connect("dbname=DPR user=postgres password=Prvn@3315 host=127.0.0.1 port=5432")
    cur = conn.cursor()

    query = '''
        SELECT DISTINCT p6."ParentEPSName"
        FROM projects p
        LEFT JOIN p6_projects p6 ON p.object_id = p6."ObjectId"
        WHERE p.app_status = 'live'
    '''
    cur.execute(query)
    rows = cur.fetchall()

    for r in rows:
        print(f'- {r[0]}')

    cur.close()
    conn.close()
except Exception as e:
    print(f'Error: {e}')
