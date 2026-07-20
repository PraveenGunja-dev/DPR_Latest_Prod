"""
Run this script on the VM to check why Productivity shows 26 instead of 29.
Usage: python check_vm_foundations.py
It will read DB credentials from backend-fastapi/.env automatically.
"""
import os, re, sys

# Try to load .env from backend-fastapi
env_path = os.path.join(os.path.dirname(__file__), "backend-fastapi", ".env")
db_config = {}
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                key, val = line.split("=", 1)
                db_config[key.strip()] = val.strip()

host = db_config.get("DB_HOST", "localhost")
port = db_config.get("DB_PORT", "5432")
dbname = db_config.get("DB_NAME", "DPR")
user = db_config.get("DB_USER", "postgres")
password = db_config.get("DB_PASSWORD", "")

print(f"Connecting to: {host}:{port}/{dbname} as {user}")

import psycopg2
conn = psycopg2.connect(host=host, port=port, dbname=dbname, user=user, password=password)
cur = conn.cursor()

# 1. List all Mandvi projects
print("\n" + "="*80)
print("STEP 1: All Mandvi projects in DB")
print("="*80)
cur.execute("SELECT id, object_id, name, app_status, last_sync_at, data_date FROM projects WHERE name ILIKE '%mandvi%' ORDER BY name")
projects = cur.fetchall()
for p in projects:
    print(f"  id={p[0]:<18} object_id={p[1]:<8} name={p[2]:<30} status={p[3] or '':<8} synced={str(p[4] or '')[:19]} data_date={str(p[5] or '')[:10]}")

# 2. For each project, check foundation data
print("\n" + "="*80)
print("STEP 2: WTG Foundation activities per project")
print("="*80)
for p in projects:
    obj_id = p[1]
    proj_name = p[2]
    proj_id = p[0]
    
    # Get all activities
    cur.execute("""
        SELECT name, actual_start, actual_finish, planned_start, planned_finish
        FROM solar_activities WHERE project_object_id = %s
    """, (obj_id,))
    all_acts = cur.fetchall()
    
    # Filter like the backend does
    fd_with_finish = []
    fd_without_finish = []
    for a in all_acts:
        name = (a[0] or "").lower()
        if not re.match(r'^wtg\s*\d+', name):
            continue
        if "raft casting" in name or "wtg foundation" in name:
            if a[2]:  # actual_finish
                fd_with_finish.append(a)
            else:
                fd_without_finish.append(a)
    
    print(f"\n  Project: {proj_name} (id={proj_id}, object_id={obj_id})")
    print(f"    Total activities: {len(all_acts)}")
    print(f"    WTG Foundations WITH actual_finish: {len(fd_with_finish)}")
    print(f"    WTG Foundations WITHOUT actual_finish: {len(fd_without_finish)}")
    
    if fd_with_finish:
        print(f"\n    Foundations with actual_finish (sorted by month):")
        monthly = {}
        for a in fd_with_finish:
            month_key = a[2].strftime("%b-%y")
            monthly[month_key] = monthly.get(month_key, 0) + 1
        for m, c in sorted(monthly.items(), key=lambda x: x[1]):
            print(f"      {m}: {c} completed")
        print(f"    CUMULATIVE TOTAL: {len(fd_with_finish)}")

# 3. Check what the API returns
print("\n" + "="*80)
print("STEP 3: Checking resolve_project_id for 'MDW'")
print("="*80)

# Check if MDW resolves as EPS
cur.execute("SELECT EXISTS(SELECT 1 FROM projects WHERE parent_eps = 'MDW')")
is_eps = cur.fetchone()[0]
print(f"  Is 'MDW' a parent_eps? {is_eps}")

# Check direct project id match
cur.execute("SELECT id, object_id, name FROM projects WHERE id = 'MDW'")
row = cur.fetchone()
if row:
    print(f"  Resolved 'MDW' -> id={row[0]}, object_id={row[1]}, name={row[2]}")
else:
    print("  'MDW' NOT FOUND as project id!")
    # Try fuzzy
    cur.execute("SELECT id, object_id, name FROM projects WHERE id ILIKE '%mdw%'")
    rows = cur.fetchall()
    for r in rows:
        print(f"    Similar: id={r[0]}, object_id={r[1]}, name={r[2]}")

conn.close()
print("\nDone!")
