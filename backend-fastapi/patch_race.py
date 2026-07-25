import re

path = r'd:\DPR\Digitalized_DPR_Prod\backend-fastapi\app\routers\dpr_supervisor.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

fix_code = """
    if check["supervisor_id"] != current_user["userId"]:
        logger.error(f"save_draft_entry: Access denied. Entry {entry_id} belongs to supervisor {check['supervisor_id']}, but current user is {current_user['userId']}")
        raise HTTPException(403, detail={"message": "Access denied: This entry belongs to another supervisor"})

    # Prevent race condition where a delayed save-draft reverts a freshly submitted entry
    if current_user.get("role", "").lower() == "supervisor":
        if check["status"] in ('submitted_to_pm', 'approved_by_pm', 'final_approved'):
            logger.warning(f"save_draft_entry: Ignoring save for entry {entry_id} because status is {check['status']}")
            return {"message": "Draft save ignored - entry already submitted", "entry": dict(check)}
"""

content = content.replace("""
    if check["supervisor_id"] != current_user["userId"]:
        logger.error(f"save_draft_entry: Access denied. Entry {entry_id} belongs to supervisor {check['supervisor_id']}, but current user is {current_user['userId']}")
        raise HTTPException(403, detail={"message": "Access denied: This entry belongs to another supervisor"})
""", fix_code)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Race condition fixed")
