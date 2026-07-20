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
    cur.execute('SELECT "Id", "Name", "project_type", "PlannedStartDate", "PlannedFinishDate", "StartDate", "FinishDate" FROM p6_projects WHERE "Name" ILIKE \'Demo 25MW\'')
    print("p6_projects:")
    print(cur.fetchall())
    
    cur.execute('SELECT object_id, name, project_type, start_date, finish_date FROM projects WHERE name ILIKE \'Demo 25MW\'')
    print("projects:")
    print(cur.fetchall())
    conn.close()
except Exception as e:
    print(f"Error: {e}")
