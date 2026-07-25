import pandas as pd

file_path = r'd:\DPR\Digitalized_DPR_Prod\data\DPR BESS _11 (1).xlsx'
try:
    xls = pd.ExcelFile(file_path)
    for sheet in xls.sheet_names:
        try:
            df = pd.read_excel(file_path, sheet_name=sheet, nrows=50)
            # Find the header row by looking for the first row with at least 3 non-null values
            header_row = -1
            for idx, row in df.iterrows():
                if row.notna().sum() > 3:
                    header_row = idx
                    break
            
            if header_row != -1:
                headers = df.iloc[header_row].dropna().tolist()
                print(f'\n--- Sheet: {sheet} ---')
                print(f'Headers (Row {header_row}):', headers[:15])
            else:
                print(f'\n--- Sheet: {sheet} ---')
                print('Could not determine headers in first 50 rows')
        except Exception as sheet_e:
            print(f'\n--- Sheet: {sheet} --- Error: {sheet_e}')
except Exception as e:
    print('Error:', e)
