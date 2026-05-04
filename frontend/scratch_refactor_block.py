import re

def process_dpblock(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Columns
    content = content.replace(
        '"Baseline End",\n    "Actual/Forecast Start",\n    "Actual/Forecast Finish",\n    "Remarks"',
        '"Baseline End",\n    "Actual Start",\n    "Actual Finish",\n    "Forecast Start",\n    "Forecast Finish",\n    "Remarks"'
    )

    # 2. Header Structure
    content = content.replace(
        '{ label: "Baseline End", rowSpan: 2 },\n            { label: "Actual/Forecast", colSpan: 2 },\n            { label: "Remarks", rowSpan: 2 }',
        '{ label: "Baseline End", rowSpan: 2 },\n            { label: "Actual", colSpan: 2 },\n            { label: "Forecast", colSpan: 2 },\n            { label: "Remarks", rowSpan: 2 }'
    )
    content = content.replace(
        '[\n            "Start",\n            "Finish"\n          ]',
        '[\n            "Actual Start",\n            "Actual Finish",\n            "Forecast Start",\n            "Forecast Finish"\n          ]'
    )

    # 3. Column Widths
    content = content.replace(
        '"Baseline End": 90,\n    "Actual/Forecast Start": 110,\n    "Actual/Forecast Finish": 110,\n    "Remarks": 150',
        '"Baseline End": 90,\n    "Actual Start": 110,\n    "Actual Finish": 110,\n    "Forecast Start": 110,\n    "Forecast Finish": 110,\n    "Remarks": 150'
    )

    # 4. tableData
    content = re.sub(
        r'// Fallback logic for dates.*?const finishStatus =.*?\n',
        '',
        content,
        flags=re.DOTALL
    )

    content = content.replace(
        'indianDateFormat(displayStart) || \'\',\n        indianDateFormat(displayFinish) || \'\',\n        row.remarks || \'\'',
        'indianDateFormat(row.actualStartDate) || \'\',\n        indianDateFormat(row.actualFinishDate) || \'\',\n        indianDateFormat(row.forecastStartDate) || \'\',\n        indianDateFormat(row.forecastFinishDate) || \'\',\n        row.remarks || \'\''
    )

    content = re.sub(
        r'arr\._cellStatuses = \{.*?\}\s*\};',
        'arr._cellStatuses = { ...((row as any)._cellStatuses || {}) };',
        content,
        flags=re.DOTALL
    )

    # 5. handleDataChange
    content = content.replace(
        'actualStartDate: row[14] || \'\',\n        actualFinishDate: row[15] || \'\',\n        remarks: row[16] || \'\'',
        'actualStartDate: row[14] || \'\',\n        actualFinishDate: row[15] || \'\',\n        forecastStartDate: row[16] || \'\',\n        forecastFinishDate: row[17] || \'\',\n        remarks: row[18] || \'\''
    )

    # Remove delete cleanedStatuses
    content = re.sub(
        r'delete cleanedStatuses\["Actual/Forecast Start"\];\n\s*delete cleanedStatuses\["Actual/Forecast Finish"\];',
        '',
        content
    )

    # 6. editableColumns
    content = content.replace(
        '"Front",\n    "Actual/Forecast Start",\n    "Actual/Forecast Finish",\n    "Remarks"',
        '"Front",\n    "Actual Start",\n    "Actual Finish",\n    "Forecast Start",\n    "Forecast Finish",\n    "Remarks"'
    )

    # 7. columnTypes
    content = content.replace(
        '"Baseline End": "text",\n          "Actual/Forecast Start": "date",\n          "Actual/Forecast Finish": "date",\n          "Remarks": "text"',
        '"Baseline End": "text",\n          "Actual Start": "date",\n          "Actual Finish": "date",\n          "Forecast Start": "date",\n          "Forecast Finish": "date",\n          "Remarks": "text"'
    )

    # 8. Colors
    content = content.replace(
        'columnFontWeights={{\n          "Actual/Forecast Start": "bold",\n          "Actual/Forecast Finish": "bold"\n        }}',
        'columnTextColors={{\n          "Actual Start": "#00B050",\n          "Actual Finish": "#00B050",\n          "Forecast Start": "#2E86C1",\n          "Forecast Finish": "#2E86C1"\n        }}\n        columnFontWeights={{\n          "Actual Start": "bold",\n          "Actual Finish": "bold",\n          "Forecast Start": "bold",\n          "Forecast Finish": "bold"\n        }}'
    )

    with open(filepath, 'w') as f:
        f.write(content)

    print(f"Processed {filepath}")

process_dpblock('src/modules/supervisor/components/DPBlockTable.tsx')
