import psycopg
import os
import sys
from dotenv import load_dotenv

# Load env vars
load_dotenv()

def create_dpr_uat():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not found in .env")
        return

    # 1. Parse host, user, password from the URL
    # Replace the DB name with 'postgres' to connect to the default maintenance DB
    if "/DPR_UAT" in db_url:
        admin_url = db_url.replace("/DPR_UAT", "/postgres")
    elif "/DPR_Project" in db_url:
         admin_url = db_url.replace("/DPR_Project", "/postgres")
    else:
        print("Error: Could not determine database name from URL")
        return

    print(f"Connecting to admin database to create DPR_UAT...")
    
    try:
        # We must use autocommit mode because CREATE DATABASE cannot run in a transaction
        with psycopg.connect(admin_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                # Check if it already exists
                cur.execute("SELECT 1 FROM pg_database WHERE datname = 'DPR_UAT'")
                exists = cur.fetchone()
                
                if exists:
                    print("✓ Database 'DPR_UAT' already exists.")
                else:
                    print("Creating database 'DPR_UAT'...")
                    cur.execute('CREATE DATABASE "DPR_UAT"')
                    print("✓ Database 'DPR_UAT' created successfully!")
                    
    except Exception as e:
        print(f"Error creating database: {e}")
        sys.exit(1)

if __name__ == "__main__":
    create_dpr_uat()
