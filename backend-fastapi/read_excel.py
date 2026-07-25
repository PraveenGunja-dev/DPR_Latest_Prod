import pandas as pd
import sys

file_path = r'd:\DPR\Digitalized_DPR_Prod\data\DPR BESS _11 (1).xlsx'
try:
    xls = pd.ExcelFile(file_path)
    print('Sheets:', xls.sheet_names)
    for sheet in xls.sheet_names:
        print(f'\n--- Sheet: {sheet} ---')
        df = pd.read_excel(file_path, sheet_name=sheet, nrows=5)
        print('Columns:', df.columns.tolist())
        print(df.head(2))
except Exception as e:
    print('Error reading excel:', e)
