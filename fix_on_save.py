import os
import re

target_dir = r"d:\DPR\Digitalized_DPR_Prod - Copy\frontend\src"
pattern = re.compile(r"onSave\??\s*:\s*\(\)\s*=>\s*void\s*;")

# For 'onSave: () => void;' we want 'onSave?: (isAuto?: boolean) => void | Promise<void>;'
# For 'onSave?: () => void;' we want 'onSave?: (isAuto?: boolean) => void | Promise<void>;'

for root, dirs, files in os.walk(target_dir):
    for file in files:
        if file.endswith(".tsx") or file.endswith(".ts"):
            file_path = os.path.join(root, file)
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            if pattern.search(content):
                # We also need to be careful with onSave: () => void; vs onSave?: () => void;
                # Let's just replace both forms to onSave?: (isAuto?: boolean) => void | Promise<void>;
                new_content = re.sub(r"onSave\??\s*:\s*\(\)\s*=>\s*void\s*;", r"onSave?: (isAuto?: boolean) => void | Promise<void>;", content)
                
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(new_content)
                print(f"Updated {file_path}")
