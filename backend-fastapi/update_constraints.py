import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect(
        host='127.0.0.1',
        port=5431,
        database='postgres',
        user='postgres',
        password='Prvn@3315'
    )
    await conn.execute("""
        UPDATE projects SET project_type = LOWER(project_type) WHERE project_type IS NOT NULL;
        UPDATE p6_projects SET project_type = LOWER(project_type) WHERE project_type IS NOT NULL;
        
        ALTER TABLE p6_projects DROP CONSTRAINT IF EXISTS p6_projects_project_type_check;
        ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_project_type_check;
        
        ALTER TABLE p6_projects ADD CONSTRAINT p6_projects_project_type_check CHECK (project_type IN ('solar', 'wind', 'pss', 'other', 'bess', 'bees'));
        ALTER TABLE projects ADD CONSTRAINT projects_project_type_check CHECK (project_type IN ('solar', 'wind', 'pss', 'other', 'bess', 'bees'));
    """)
    print("Constraints updated successfully.")
    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())
