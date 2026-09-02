with open('backend-fastapi/app/routers/dpr_supervisor.py', 'r') as f:
    content = f.read()

content = content.replace('current_user.get("role", "").lower()', 'current_user.get("role", "").strip().lower()')
content = content.replace('user_role_lower = user_role.lower() if user_role else ""', 'user_role_lower = user_role.strip().lower() if user_role else ""')

with open('backend-fastapi/app/routers/dpr_supervisor.py', 'w') as f:
    f.write(content)

print("Fixed user_role parsing!")
