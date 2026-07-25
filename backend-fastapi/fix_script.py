import re

file_path = r'd:\DPR\Digitalized_DPR_Prod\backend-fastapi\app\routers\dpr_supervisor.py'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# Fix 1: pmag-history
old1 = '''    if projectId:
        project_object_id = await resolve_project_id(projectId, pool)
        conditions.append(f"dse.project_id = ${idx}")'''
new1 = '''    if projectId:
        project_object_id = await resolve_project_id(projectId, pool)
        if isinstance(project_object_id, list):
            conditions.append(f"dse.project_id = ANY(${idx}::int[])")
        else:
            conditions.append(f"dse.project_id = ${idx}")'''
code = code.replace(old1, new1)

# Fix 2: push-history
old2 = '''    project_oid = await resolve_project_id(project_id, pool)
    rows = await pool.fetch("""
        SELECT e.id as entry_id, e.sheet_type, e.entry_date, e.pushed_at,
               e.status, u_push.name as pushed_by_name, u_sup.name as supervisor_name,
               COALESCE(pa.success_count, 0) as activities_pushed,
               COALESCE(pa.failed_count, 0) as activities_failed,
               COALESCE(pa.skipped_count, 0) as activities_skipped
        FROM dpr_supervisor_entries e
        LEFT JOIN users u_push ON e.pushed_by = u_push.user_id
        LEFT JOIN users u_sup ON e.supervisor_id = u_sup.user_id
        LEFT JOIN LATERAL (
            SELECT 
                COUNT(*) FILTER (WHERE push_status = 'success') as success_count,
                COUNT(*) FILTER (WHERE push_status = 'failed') as failed_count,
                COUNT(*) FILTER (WHERE push_status = 'skipped') as skipped_count
            FROM push_audit WHERE entry_id = e.id
        ) pa ON true
        WHERE e.project_id = $1 AND e.status = 'final_approved' AND e.pushed_at IS NOT NULL
        ORDER BY e.pushed_at DESC
        LIMIT 200
    """, project_oid)'''
new2 = '''    project_oid = await resolve_project_id(project_id, pool)
    if isinstance(project_oid, list):
        where_cond = "e.project_id = ANY($1::int[])"
    else:
        where_cond = "e.project_id = $1"
        
    rows = await pool.fetch(f"""
        SELECT e.id as entry_id, e.sheet_type, e.entry_date, e.pushed_at,
               e.status, u_push.name as pushed_by_name, u_sup.name as supervisor_name,
               COALESCE(pa.success_count, 0) as activities_pushed,
               COALESCE(pa.failed_count, 0) as activities_failed,
               COALESCE(pa.skipped_count, 0) as activities_skipped
        FROM dpr_supervisor_entries e
        LEFT JOIN users u_push ON e.pushed_by = u_push.user_id
        LEFT JOIN users u_sup ON e.supervisor_id = u_sup.user_id
        LEFT JOIN LATERAL (
            SELECT 
                COUNT(*) FILTER (WHERE push_status = 'success') as success_count,
                COUNT(*) FILTER (WHERE push_status = 'failed') as failed_count,
                COUNT(*) FILTER (WHERE push_status = 'skipped') as skipped_count
            FROM push_audit WHERE entry_id = e.id
        ) pa ON true
        WHERE {where_cond} AND e.status = 'final_approved' AND e.pushed_at IS NOT NULL
        ORDER BY e.pushed_at DESC
        LIMIT 200
    """, project_oid)'''
code = code.replace(old2, new2)

# Fix 3: push-comparison
old3 = '''    base_filter = "sa.project_object_id = $1"
    params_from = [project_oid, d_from]
    params_to = [project_oid, d_to]'''
new3 = '''    if isinstance(project_oid, list):
        base_filter = "sa.project_object_id = ANY($1::int[])"
    else:
        base_filter = "sa.project_object_id = $1"
    params_from = [project_oid, d_from]
    params_to = [project_oid, d_to]'''
code = code.replace(old3, new3)

# Fix 4: push-analytics
old4 = '''    project_oid = await resolve_project_id(project_id, pool)

    rows = await pool.fetch("""
        SELECT e.id as entry_id, e.sheet_type, e.entry_date, e.pushed_at,
               COALESCE(pa.success_count, 0) as activities_pushed,
               COALESCE(pa.failed_count, 0) as activities_failed,
               COALESCE(pa.skipped_count, 0) as activities_skipped
        FROM dpr_supervisor_entries e
        LEFT JOIN LATERAL (
            SELECT 
                COUNT(*) FILTER (WHERE push_status = 'success') as success_count,
                COUNT(*) FILTER (WHERE push_status = 'failed') as failed_count,
                COUNT(*) FILTER (WHERE push_status = 'skipped') as skipped_count
            FROM push_audit WHERE entry_id = e.id
        ) pa ON true
        WHERE project_id = $1 AND pushed_at IS NOT NULL
        ORDER BY pushed_at DESC
        LIMIT 100
    """, project_oid)'''
new4 = '''    project_oid = await resolve_project_id(project_id, pool)

    if isinstance(project_oid, list):
        where_cond = "project_id = ANY($1::int[])"
    else:
        where_cond = "project_id = $1"
        
    rows = await pool.fetch(f"""
        SELECT e.id as entry_id, e.sheet_type, e.entry_date, e.pushed_at,
               COALESCE(pa.success_count, 0) as activities_pushed,
               COALESCE(pa.failed_count, 0) as activities_failed,
               COALESCE(pa.skipped_count, 0) as activities_skipped
        FROM dpr_supervisor_entries e
        LEFT JOIN LATERAL (
            SELECT 
                COUNT(*) FILTER (WHERE push_status = 'success') as success_count,
                COUNT(*) FILTER (WHERE push_status = 'failed') as failed_count,
                COUNT(*) FILTER (WHERE push_status = 'skipped') as skipped_count
            FROM push_audit WHERE entry_id = e.id
        ) pa ON true
        WHERE {where_cond} AND pushed_at IS NOT NULL
        ORDER BY pushed_at DESC
        LIMIT 100
    """, project_oid)'''
code = code.replace(old4, new4)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Fix applied.")
