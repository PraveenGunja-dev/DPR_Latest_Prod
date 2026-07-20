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
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'p6_projects'")
    rows = cur.fetchall()
    print("p6_projects columns:", [r[0] for r in rows])
    conn.close()
except Exception as e:
    print(f"Error: {e}")
