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
    cur.execute('SELECT "Name", "project_type" FROM p6_projects WHERE "Name" ILIKE \'%Demo%\' LIMIT 1')
    print(cur.fetchone())
    conn.close()
except Exception as e:
    print(f"Error: {e}")
