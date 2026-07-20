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
    cur.execute('SELECT "Id", "Name", "project_type" FROM p6_projects WHERE "Name" ILIKE \'%Demo%\'')
    rows = cur.fetchall()
    for r in rows:
        print(r)
    conn.close()
except Exception as e:
    print(f"Error: {e}")
