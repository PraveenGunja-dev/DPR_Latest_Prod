import asyncio, asyncpg, sys, json

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

async def run():
    conn = await asyncpg.connect('postgresql://postgres:Nikitha@localhost/DPR')
    
    e = await conn.fetchrow("""
        SELECT id, sheet_type, status, entry_date
        FROM dpr_supervisor_entries 
        WHERE id = 555
    """)
    if e:
        print(f"ID={e['id']} Sheet={e['sheet_type']} Status={e['status']} Date={e['entry_date']}")
        
    await conn.close()

if __name__ == '__main__':
    asyncio.run(run())
