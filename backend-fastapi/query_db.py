import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect(
        user="postgres",
        password="Nikitha",
        database="DPR",
        host="127.0.0.1",
        port=5432
    )
    
    rows = await conn.fetch("SELECT activity_object_id, sum(today_value) FROM dpr_daily_progress GROUP BY activity_object_id HAVING sum(today_value) = 5849;")
    print("Activities with sum 5849:")
    for row in rows:
        print(dict(row))
        
    print("\nCheck if there are any activities matching Purlin:")
    rows = await conn.fetch("SELECT * FROM solar_activities WHERE name ILIKE '%Purlin%';")
    for row in rows:
        print(dict(row))

    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
