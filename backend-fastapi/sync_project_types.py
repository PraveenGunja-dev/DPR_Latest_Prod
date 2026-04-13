import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def sync_project_type():
    print("Connecting to database...")
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not found!")
        return
        
    conn = await asyncpg.connect(db_url)
    print("Syncing project types backward from p6_projects to projects table...")
    query = """
    UPDATE projects p
    SET project_type = p6.project_type
    FROM p6_projects p6
    WHERE p.object_id = p6."ObjectId"
      AND p6.project_type IS NOT NULL
      AND (p.project_type IS NULL OR p.project_type != p6.project_type)
    """
    result = await conn.execute(query)
    print(f"Updated {result} projects.")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(sync_project_type())
