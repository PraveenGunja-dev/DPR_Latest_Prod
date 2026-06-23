import psycopg2
import pandas as pd

DB_HOST="127.0.0.1"
DB_PORT="5431"
DB_NAME="postgres"
DB_USER="postgres"
DB_PASSWORD="Prvn@3315"

conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD)

query = "SELECT object_id, id, name FROM projects WHERE id = 'FY25-P13' OR id LIKE '%P13%'"
df = pd.read_sql(query, conn)
print("PROJECTS:")
print(df)

conn.close()
