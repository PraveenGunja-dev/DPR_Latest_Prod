"""
Cleanup script: Find and remove duplicate dpr_supervisor_entries.
Keeps the LATEST entry (by updated_at) per (supervisor_id, project_id, sheet_type, entry_date).
Older duplicates are soft-deleted by changing status to 'superseded'.

Run with: python cleanup_duplicates.py
"""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/adani_flow")

def main():
    # Connect using psycopg3
    conn = psycopg.connect(DATABASE_URL)
    
    try:
        # 1. Find all duplicate groups
        print("=" * 80)
        print("STEP 1: Finding duplicate groups...")
        print("=" * 80)
        
        # We use a cursor to execute the query
        with conn.cursor() as cur:
            cur.execute("""
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
            dupes = cur.fetchall()
            
            if not dupes:
                print("No duplicates found! Database is clean.")
                return
            
            print(f"\nFound {len(dupes)} groups with duplicates:\n")
            
            total_to_remove = 0
            entries_to_supersede = []
            
            for row in dupes:
                supervisor_id, project_id, sheet_type, entry_date, cnt, entry_ids, statuses = row
                
                keep_id = entry_ids[0]
                remove_ids = entry_ids[1:]
                total_to_remove += len(remove_ids)
                
                print(f"  Project={project_id} | Sheet={sheet_type} | Date={entry_date}")
                print(f"    IDs: {entry_ids} | Statuses: {statuses}")
                print(f"    KEEP: #{keep_id} | REMOVE: {remove_ids}")
                print()
                
                entries_to_supersede.extend(remove_ids)
            
            print(f"\nSummary: {len(dupes)} groups, {total_to_remove} duplicate entries to clean up")
            
            confirm = input(f"\nProceed to mark {len(entries_to_supersede)} entries as 'superseded'? (yes/no): ")
            if confirm.strip().lower() != "yes":
                print("Aborted.")
                return
            
            # Execute the update query
            cur.execute("""
                UPDATE dpr_supervisor_entries 
                SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
                WHERE id = ANY(%s)
            """, (entries_to_supersede,))
            
            # Commit the transaction explicitly
            conn.commit()
            print(f"\nDone! {cur.rowcount} entries marked as 'superseded'.")
    
    finally:
        conn.close()

if __name__ == "__main__":
    main()
