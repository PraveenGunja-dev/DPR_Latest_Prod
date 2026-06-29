import json

with open(r'd:\DPR Latest\frontend\src\modules\supervisor\components\ManpowerDetailsTable.tsx', 'r', encoding='utf8') as f:
    code = f.read()
    
print("Has universalFilter bug in else block:", "setData(newP6Data)" in code)
