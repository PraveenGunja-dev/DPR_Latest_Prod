import psycopg2
import csv

DB_HOST="127.0.0.1"
DB_PORT="5431"
DB_NAME="postgres"
DB_USER="postgres"
DB_PASSWORD="Prvn@3315"

conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD)
cur = conn.cursor()

query = "SELECT object_id, id, name FROM projects WHERE id = 'FY25-P13' OR id LIKE '%P13%'"
cur.execute(query)
rows = cur.fetchall()
print("PROJECTS:")
for row in rows:
    print(row)

conn.close()
