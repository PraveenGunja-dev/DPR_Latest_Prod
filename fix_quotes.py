import re

def fix_all(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace literal \'\' with ''
    content = content.replace(r"\'\'", "''")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

fix_all('frontend/src/modules/supervisor/components/wind/WindProgressTable.tsx')
fix_all('frontend/src/modules/supervisor/components/pss/PSSProgressTable.tsx')
print("Fixed all quotes")
