from app.database import get_pool
import asyncio

async def main():
    pool = await get_pool()
    
    categories = {
        "BOP Civil Works": ['%bop civil%', '%bop %'],
        "AC/DC Works": ['%acdc%', '%ac/dc%', '%ac / dc%', '%ac dc%'],
        "Structural / PEB Works": ['%structural%', '%peb%']
    }
    
    for cat_name, keywords in categories.items():
        query = f"""
        SELECT DISTINCT name, wbs_name 
        FROM solar_activities 
        WHERE {" OR ".join([f"wbs_name ILIKE '{k}' OR name ILIKE '{k}'" for k in keywords])}
        LIMIT 10
        """
        rows = await pool.fetch(query)
        print(f"\n--- {cat_name} ({len(rows)} samples) ---")
        for r in rows:
            print(f"- {r['name']} (WBS: {r['wbs_name']})")
            
    await pool.close()

if __name__ == "__main__":
    asyncio.run(main())
