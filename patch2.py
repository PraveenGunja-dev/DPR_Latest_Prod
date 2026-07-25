import os
import re

files = [
    r'd:\DPR\Digitalized_DPR_Prod\frontend\src\modules\supervisor\components\DCSheetTable.tsx',
    r'd:\DPR\Digitalized_DPR_Prod\frontend\src\modules\supervisor\components\ACSheetTable.tsx',
    r'd:\DPR\Digitalized_DPR_Prod\frontend\src\modules\supervisor\components\ManpowerDetailsTable.tsx',
    r'd:\DPR\Digitalized_DPR_Prod\frontend\src\modules\supervisor\components\TestingCommTable.tsx',
    r'd:\DPR\Digitalized_DPR_Prod\frontend\src\modules\supervisor\components\DPQtyTable.tsx'
]

for filepath in files:
    if not os.path.exists(filepath): continue
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Skip if already patched
    if 'parseDateToIso(sStr)' in content or 'parseDateToIso(fStr)' in content:
        continue

    print(f'Patching {filepath}...')

    # 1. Add import if needed
    if 'parseDateToIso' not in content:
        if 'indianDateFormat' in content:
            content = re.sub(r'(import \{.*?indianDateFormat.*?\} from [\'\"]@/services/dprService[\'\"];?)', 
                             lambda m: m.group(1).replace('indianDateFormat', 'indianDateFormat, parseDateToIso'), 
                             content)
        else:
            content = 'import { parseDateToIso } from "@/services/dprService";\n' + content

    content = content.replace('sStr <= referenceDateStr', 'parseDateToIso(sStr) <= referenceDateStr')
    content = content.replace('fStr <= referenceDateStr', 'parseDateToIso(fStr) <= referenceDateStr')
    content = content.replace('sStr <= parsedYesterdayStr', 'parseDateToIso(sStr) <= parsedYesterdayStr')
    content = content.replace('fStr <= parsedYesterdayStr', 'parseDateToIso(fStr) <= parsedYesterdayStr')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print('Done!')
