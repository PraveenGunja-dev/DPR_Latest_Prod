import re

files = [
    r"d:\DPR\Digitalized_DPR_Prod - Copy\frontend\src\modules\supervisor\components\bess\BESSChargingScheduleTable.tsx",
    r"d:\DPR\Digitalized_DPR_Prod - Copy\frontend\src\modules\supervisor\components\bess\BESSDailyRequirementTable.tsx"
]

replacements = [
    (r'bg-\[#c7ccd1\]', r'bg-[#c7ccd1] dark:bg-[#2B2B2B]'),
    (r'text-slate-800', r'text-slate-800 dark:text-[#E8E8E8]'),
    (r'text-slate-700', r'text-slate-700 dark:text-slate-200'),
    (r'border-\[#999999\]', r'border-[#999999] dark:border-[#3A3A3A]'),
    (r'\bbg-white\b', r'bg-white dark:bg-[#1E1E1E]'),
    (r'bg-\[#e0f2e9\]', r'bg-[#e0f2e9] dark:bg-[#113322]'),
    (r'text-\[#065f46\]', r'text-[#065f46] dark:text-[#A7F3D0]'),
    (r'bg-\[#FEF9C3\]', r'bg-[#FEF9C3] dark:bg-yellow-900/30'),
    (r'hover:bg-\[#FEF08A\]', r'hover:bg-[#FEF08A] dark:hover:bg-yellow-900/50'),
    (r'hover:bg-slate-50', r'hover:bg-slate-50 dark:hover:bg-[#2E3238]'),
    (r'\bbg-slate-50/50\b', r'bg-slate-50/50 dark:bg-[#252525]'),
    (r'\bbg-slate-50\b(?!/)', r'bg-slate-50 dark:bg-[#252525]'),
    (r'focus:text-black', r'focus:text-black dark:focus:text-white'),
    (r'\btext-black\b', r'text-black dark:text-white'),
    (r'text-slate-600', r'text-slate-600 dark:text-[#CCCCCC]'),
    (r'text-blue-700', r'text-blue-700 dark:text-blue-400'),
    (r'text-green-600', r'text-green-600 dark:text-green-400'),
    (r'text-blue-600', r'text-blue-600 dark:text-blue-400'),
    (r'bg-slate-100', r'bg-slate-100 dark:bg-[#252525]'),
    (r'bg-emerald-100', r'bg-emerald-100 dark:bg-emerald-900/50'),
    (r'text-emerald-700', r'text-emerald-700 dark:text-emerald-400'),
    (r'bg-amber-100', r'bg-amber-100 dark:bg-amber-900/50'),
    (r'text-amber-700', r'text-amber-700 dark:text-amber-400'),
    (r'shadow-\[inset_-1px_0_0_0_#999999\]', r'shadow-[inset_-1px_0_0_0_#999999] dark:shadow-[inset_-1px_0_0_0_#3A3A3A]'),
    (r'bg-yellow-300', r'bg-yellow-300 dark:bg-yellow-700/50'),
    (r'text-slate-500', r'text-slate-500 dark:text-slate-400'),
    (r'bg-slate-200', r'bg-slate-200 dark:bg-slate-700'),
    (r'hover:bg-slate-200', r'hover:bg-slate-200 dark:hover:bg-slate-700'),
    (r'hover:bg-slate-300', r'hover:bg-slate-300 dark:hover:bg-slate-600'),
    (r'text-slate-400', r'text-slate-400 dark:text-slate-500'),
    (r'border-slate-200', r'border-slate-200 dark:border-slate-600'),
    (r'bg-blue-50', r'bg-blue-50 dark:bg-blue-900/30'),
    (r'border-blue-100', r'border-blue-100 dark:border-blue-800/50'),
    (r'text-blue-800', r'text-blue-800 dark:text-blue-300'),
    (r'text-blue-500', r'text-blue-500 dark:text-blue-400'),
    (r'hover:text-blue-700', r'hover:text-blue-700 dark:hover:text-blue-300'),
    (r'hover:text-slate-600', r'hover:text-slate-600 dark:hover:text-slate-300'),
]

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for search, replace in replacements:
        content = re.sub(search + r'(?! dark:)', replace, content)
        
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Processed {file}")
