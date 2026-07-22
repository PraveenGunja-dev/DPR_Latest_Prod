"""
Cleanup script: Find and remove duplicate dpr_supervisor_entries.
Keeps the LATEST entry (by updated_at) per (supervisor_id, project_id, sheet_type, entry_date).
Older duplicates are soft-deleted by changing status to 'superseded'.

Run with: python cleanup_duplicates.py
"""
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/adani_flow")

async def main():
    conn = await asyncpg.connect(DATABASE_URL)
    
    # 1. Find all duplicate groups
    print("=" * 80)
    print("STEP 1: Finding duplicate groups...")
    print("=" * 80)
    
    dupes = await conn.fetch("""
        SELECT supervisor_id, project_id, sheet_type, entry_date, 
               COUNT(*) as cnt,
               array_agg(id ORDER BY updated_at DESC) as entry_ids,
               array_agg(status ORDER BY updated_at DESC) as statuses
        FROM dpr_supervisor_entries
        WHERE status IN ('submitted_to_pm', 'approved_by_pm', 'final_approved', 'draft')
        GROUP BY supervisor_id, project_id, sheet_type, entry_date
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC
    """)
    
    if not dupes:
        print("No duplicates found! Database is clean.")
        await conn.close()
        return
    
    print(f"\nFound {len(dupes)} groups with duplicates:\n")
    
    total_to_remove = 0
    entries_to_supersede = []
    
    for d in dupes:
        ids = list(d["entry_ids"])
        statuses = list(d["statuses"])
        keep_id = ids[0]
        remove_ids = ids[1:]
        total_to_remove += len(remove_ids)
        
        print(f"  Project={d['project_id']} | Sheet={d['sheet_type']} | Date={d['entry_date']}")
        print(f"    IDs: {ids} | Statuses: {statuses}")
        print(f"    KEEP: #{keep_id} | REMOVE: {remove_ids}")
        print()
        
        entries_to_supersede.extend(remove_ids)
    
    print(f"\nSummary: {len(dupes)} groups, {total_to_remove} duplicate entries to clean up")
    
    confirm = input(f"\nProceed to mark {len(entries_to_supersede)} entries as 'superseded'? (yes/no): ")
    if confirm.strip().lower() != "yes":
        print("Aborted.")
        await conn.close()
        return
    
    updated = await conn.execute("""
        UPDATE dpr_supervisor_entries 
        SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1::int[])
    """, entries_to_supersede)
    
    print(f"\nDone! {updated} entries marked as 'superseded'.")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
