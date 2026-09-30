import asyncio
import asyncpg
import os

# You may need to adjust the database connection string for your VM's environment
DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:Nikitha@127.0.0.1:5432/DPR")

async def main():
    print(f"Connecting to database: {DB_URL}")
    try:
        conn = await asyncpg.connect(DB_URL)
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        print("Please set the DATABASE_URL environment variable to your production DB.")
        return

    print("Recalculating solar_activities.cumulative from dpr_daily_progress...")
    
    # This query sums up all today_values from dpr_daily_progress for each activity
    # and updates the solar_activities.cumulative to match that exact sum.
    # It ignores any previously inflated values.
    query = """
        UPDATE solar_activities sa
        SET cumulative = COALESCE(sub.total_progress, 0)
        FROM (
            SELECT activity_object_id, SUM(today_value) as total_progress
            FROM dpr_daily_progress
            WHERE activity_source = 'p6'
            GROUP BY activity_object_id
        ) sub
        WHERE sa.object_id = sub.activity_object_id
        AND sa.cumulative != COALESCE(sub.total_progress, 0);
    """
    
    status = await conn.execute(query)
    print(f"Update complete! {status}")
    
    # Also update custom activities just in case
    query_custom = """
        UPDATE dpr_custom_activities ca
        SET cumulative = COALESCE(sub.total_progress, 0)
        FROM (
            SELECT activity_object_id, SUM(today_value) as total_progress
            FROM dpr_daily_progress
            WHERE activity_source = 'dpr'
            GROUP BY activity_object_id
        ) sub
        WHERE ca.id = sub.activity_object_id
        AND ca.cumulative != COALESCE(sub.total_progress, 0);
    """
    
    status_custom = await conn.execute(query_custom)
    print(f"Custom activities update complete! {status_custom}")

    await conn.close()
    print("Done! The cumulative values have been successfully recalculated.")

if __name__ == "__main__":
    asyncio.run(main())
