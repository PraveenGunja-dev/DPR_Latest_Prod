import asyncio
from app.database import get_pool

async def main():
    pool = await get_pool()
    
    keywords = [
        '%bop civil%',
        '%bop %',
        '%acdc%',
        '%ac/dc%',
        '%ac / dc%',
        '%ac dc%',
        '%structural%',
        '%peb%'
    ]
    
    query = f"""
    SELECT DISTINCT name, wbs_name 
    FROM solar_activities 
    WHERE wbs_name ILIKE ANY($1) 
       OR name ILIKE ANY($1)
    LIMIT 100
    """
    
    rows = await pool.fetch(query, keywords)
    
    print("Found", len(rows), "activities matching BOP Civil, AC/DC, or Structural/PEB:")
    for r in rows:
        print(f"- {r['name']} (WBS: {r['wbs_name']})")
        
    await pool.close()

if __name__ == "__main__":
    asyncio.run(main())
