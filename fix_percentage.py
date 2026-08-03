import re

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Display logic for base row
    content = re.sub(
        r'row\.percentComplete !== undefined && row\.percentComplete !== null \? String\(row\.percentComplete\) : \'\'',
        r'row.percentComplete !== undefined && row.percentComplete !== null ? String(Math.round(Number(row.percentComplete) * 100)) : \'\'',
        content
    )

    # 2. Display logic for custom row
    content = re.sub(
        r'c\.percentComplete !== undefined && c\.percentComplete !== null \? String\(c\.percentComplete\) : \'\'',
        r'c.percentComplete !== undefined && c.percentComplete !== null ? String(Math.round(Number(c.percentComplete) * 100)) : \'\'',
        content
    )

    # 3. Save logic for P6 rows
    content = re.sub(
        r'percentComplete: newProg !== undefined && newProg !== \'\' \? Number\(newProg\) : undefined,',
        r'percentComplete: newProg !== undefined && newProg !== \'\' ? Number(newProg) / 100 : undefined,',
        content
    )

    # 4. Save logic for Custom rows
    content = re.sub(
        r'percentComplete: newProg !== \'\' \? Number\(newProg\) : undefined,',
        r'percentComplete: newProg !== \'\' ? Number(newProg) / 100 : undefined,',
        content
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

fix_file('frontend/src/modules/supervisor/components/wind/WindProgressTable.tsx')
fix_file('frontend/src/modules/supervisor/components/pss/PSSProgressTable.tsx')
print("Fixed percentages")
