import sqlite3

def main():
    conn = sqlite3.connect('adani_dpr.db')
    cursor = conn.cursor()
    cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    for name, sql in tables:
        print(f"Table: {name}")
        print(f"Schema: {sql}\n")
    conn.close()

if __name__ == '__main__':
    main()
