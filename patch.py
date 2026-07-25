import os
import re

components_dir = r'd:\DPR\Digitalized_DPR_Prod\frontend\src\modules\supervisor\components'
files_to_check = []
for root, dirs, files in os.walk(components_dir):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            files_to_check.append(os.path.join(root, file))

for filepath in files_to_check:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Skip if already patched (or if it doesn't have the target strings)
    if 'parseDateToIso(sStr)' in content or 'sStr <= parsedYesterdayStr' not in content:
        continue

    print(f'Patching {filepath}...')
    
    # 1. Add import if needed
    if 'parseDateToIso' not in content:
        if 'indianDateFormat' in content:
            content = re.sub(r'(import \{.*?indianDateFormat.*?\} from [\'\"]@/services/dprService[\'\"];?)', 
                             lambda m: m.group(1).replace('indianDateFormat', 'indianDateFormat, parseDateToIso'), 
                             content)
        else:
            # Add it to the top
            content = 'import { parseDateToIso } from "@/services/dprService";\n' + content

    # 2. Replace the comparisons
    content = content.replace('sStr <= parsedYesterdayStr', 'parseDateToIso(sStr) <= parsedYesterdayStr')
    content = content.replace('fStr <= parsedYesterdayStr', 'parseDateToIso(fStr) <= parsedYesterdayStr')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print('Done!')
