import psycopg2

try:
    conn = psycopg2.connect(
        host="localhost",
        port=5432,
        dbname="DPR",
        user="postgres",
        password="Nikitha"
    )
    cur = conn.cursor()
    cur.execute("""
        SELECT p.object_id, p.name, p6."PlannedStartDate", p6."PlannedFinishDate", p.start_date, p.finish_date, p.status 
        FROM projects p 
        LEFT JOIN p6_projects p6 ON p.object_id = p6."ObjectId" 
        WHERE p.name = 'Demo 25MW'
    """)
    print(cur.fetchone())
    conn.close()
except Exception as e:
    print(f"Error: {e}")
