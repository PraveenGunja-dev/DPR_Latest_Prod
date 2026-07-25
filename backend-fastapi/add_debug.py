import re

path = r'd:\DPR\Digitalized_DPR_Prod\backend-fastapi\app\routers\dpr_supervisor.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

debug_endpoint = """
@router.get("/pm/debug-entries/{project_id}")
async def debug_entries(
    project_id: str,
    pool: PoolWrapper = Depends(get_db)
):
    try:
        from app.routers.project_utils import resolve_project_id
        resolved = await resolve_project_id(project_id, pool)
        
        # Raw dump from dpr_supervisor_entries
        raw_entries = await pool.fetch(
            "SELECT id, project_id, status, sheet_type, supervisor_id FROM dpr_supervisor_entries WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 10",
            int(resolved) if isinstance(resolved, int) else 0
        )
        
        return {
            "requested_project_id": project_id,
            "resolved_object_id": resolved,
            "raw_db_entries": [dict(r) for r in raw_entries]
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/pm/entries")"""

content = content.replace('@router.get("/pm/entries")', debug_endpoint)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Debug endpoint added")
