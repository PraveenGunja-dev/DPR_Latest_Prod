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
    cur.execute("SELECT plan_start, plan_end, actual_start, actual_end, start_date, finish_date FROM projects WHERE name = 'Demo 25MW'")
    print(cur.fetchone())
    conn.close()
except Exception as e:
    print(f"Error: {e}")
