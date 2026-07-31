import psycopg

try:
    conn = psycopg.connect("dbname=DPR user=postgres password=Prvn@3315 host=127.0.0.1 port=5432")
    cur = conn.cursor()

    query = '''
        SELECT p.name, p6."ParentEPSName"
        FROM projects p
        LEFT JOIN p6_projects p6 ON p.object_id = p6."ObjectId"
        WHERE p.app_status = 'live'
        AND (
            (p6."ParentEPSName" ILIKE '%Khavda%' AND p6."ParentEPSName" NOT ILIKE '%Outside Khavda%')
            OR p6."ParentEPSName" ILIKE '%AGEL%'
            OR p6."ParentEPSName" IN (
                'Enrich Energy', 
                'Larsen and Turbo Limited', 
                'KPI Green Energy', 
                'Sterling & Wilson', 
                'Amara Raja', 
                'Bondada Energy Limited', 
                'Hild Energy'
            )
        )
    '''
    cur.execute(query)
    rows = cur.fetchall()

    print(f'Total Khavda (AGEL + EPC) projects found: {len(rows)}')
    for r in rows:
        print(f'- {r[0]} (EPS: {r[1]})')

    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
