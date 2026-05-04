import re

def process_file(filepath, title_fix=None):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Columns
    content = content.replace(
        '"Baseline Finish",\n    "Actual/Forecast Start",\n    "Actual/Forecast Finish",\n    "Resource",',
        '"Baseline Finish",\n    "Actual Start",\n    "Actual Finish",\n    "Forecast Start",\n    "Forecast Finish",\n    "Resource",'
    )

    # 2. Header Structure Row 0
    content = content.replace(
        '{ label: "Baseline Finish", rowSpan: 2 },\n      { label: "Actual/Forecast", colSpan: 2 },\n      { label: "Resource", rowSpan: 2 },',
        '{ label: "Baseline Finish", rowSpan: 2 },\n      { label: "Actual", colSpan: 2 },\n      { label: "Forecast", colSpan: 2 },\n      { label: "Resource", rowSpan: 2 },'
    )

    # 3. Header Structure Row 1
    content = content.replace(
        '[\n      "Start",\n      "Finish"\n    ]',
        '[\n      "Actual Start",\n      "Actual Finish",\n      "Forecast Start",\n      "Forecast Finish"\n    ]'
    )
    content = content.replace(
        '[\n      { label: "Start", colSpan: 1 },\n      { label: "Finish", colSpan: 1 }\n    ]',
        '[\n      { label: "Actual Start", colSpan: 1 },\n      { label: "Actual Finish", colSpan: 1 },\n      { label: "Forecast Start", colSpan: 1 },\n      { label: "Forecast Finish", colSpan: 1 }\n    ]'
    )

    # 4. Column Widths
    content = content.replace(
        '"Baseline Finish": 100,\n    "Actual/Forecast Start": 110,\n    "Actual/Forecast Finish": 110,\n    "Resource": 140,',
        '"Baseline Finish": 100,\n    "Actual Start": 110,\n    "Actual Finish": 110,\n    "Forecast Start": 110,\n    "Forecast Finish": 110,\n    "Resource": 140,'
    )

    # 5. Category row arr
    content = content.replace(
        'baselineFinish, \n          "", // Start (Actual/Forecast)\n          "", // Finish (Actual/Forecast)\n          "", // Resource',
        'baselineFinish, \n          "", // Actual Start\n          "", // Actual Finish\n          "", // Forecast Start\n          "", // Forecast Finish\n          "", // Resource'
    )

    # 6. Activity row arr & fallback logic
    content = re.sub(
        r'// Fallback Logic: Actual \|\| Forecast.*?const finishStatus =.*?\n',
        '',
        content,
        flags=re.DOTALL
    )

    content = content.replace(
        'baselineFinish,\n          indianDateFormat(displayStart) || \'\',\n          indianDateFormat(displayFinish) || \'\',\n          finalResourceId,',
        'baselineFinish,\n          indianDateFormat(effectiveActualStart) || \'\',\n          indianDateFormat(effectiveActualFinish) || \'\',\n          indianDateFormat(row.forecastStart) || \'\',\n          indianDateFormat(row.forecastFinish) || \'\',\n          finalResourceId,'
    )

    content = re.sub(
        r'arr\._cellStatuses = \{.*?\}\s*\};',
        'arr._cellStatuses = { ...((row as any)._cellStatuses || {}) };',
        content,
        flags=re.DOTALL
    )

    # 7. handleDataChange array
    content = content.replace(
        'const newActualStart = row[9] || \'\';\n        const newActualFinish = row[10] || \'\';\n        const newSelectedResourceId = row[11] || \'\';\n        const newYesterday = Number(row[12]) || 0;\n        const newToday = Number(row[13]) || 0;',
        'const newActualStart = row[9] || \'\';\n        const newActualFinish = row[10] || \'\';\n        const newForecastStart = row[11] || \'\';\n        const newForecastFinish = row[12] || \'\';\n        const newSelectedResourceId = row[13] || \'\';\n        const newYesterday = Number(row[14]) || 0;\n        const newToday = Number(row[15]) || 0;'
    )

    content = content.replace(
        'actualStart: newActualStart,\n          actualFinish: newActualFinish, \n          selectedResourceId: newSelectedResourceId,',
        'actualStart: newActualStart,\n          actualFinish: newActualFinish, \n          forecastStart: newForecastStart,\n          forecastFinish: newForecastFinish,\n          selectedResourceId: newSelectedResourceId,'
    )

    # remove delete statements
    content = re.sub(
        r'delete cleanedStatuses\["Actual/Forecast Start"\];\n\s*delete cleanedStatuses\["Actual/Forecast Finish"\];',
        '',
        content
    )

    # 8. editableColumns
    content = content.replace(
        '"Scope",\n    "Actual/Forecast Start",\n    "Actual/Forecast Finish",\n    "Resource",',
        '"Scope",\n    "Actual Start",\n    "Actual Finish",\n    "Forecast Start",\n    "Forecast Finish",\n    "Resource",'
    )

    # 9. columnTypes
    content = content.replace(
        '"Baseline Finish": "text",\n    "Actual/Forecast Start": "date",\n    "Actual/Forecast Finish": "date",\n    "Resource": "select",',
        '"Baseline Finish": "text",\n    "Actual Start": "date",\n    "Actual Finish": "date",\n    "Forecast Start": "date",\n    "Forecast Finish": "date",\n    "Resource": "select",'
    )

    # 10. StyledExcelTable Colors
    content = content.replace(
        'columnTextColors={{\n          "Resource": "#4f46e5"\n        }}',
        'columnTextColors={{\n          "Actual Start": "#00B050",\n          "Actual Finish": "#00B050",\n          "Forecast Start": "#2E86C1",\n          "Forecast Finish": "#2E86C1",\n          "Resource": "#4f46e5"\n        }}'
    )

    content = content.replace(
        'columnFontWeights={{\n          "Actual/Forecast Start": "bold",\n          "Actual/Forecast Finish": "bold",\n          "Resource": "bold"\n        }}',
        'columnFontWeights={{\n          "Actual Start": "bold",\n          "Actual Finish": "bold",\n          "Forecast Start": "bold",\n          "Forecast Finish": "bold",\n          "Resource": "bold"\n        }}'
    )
    
    # Optional Title fix
    if title_fix:
        content = content.replace('title="DC Side"', f'title="{title_fix}"')

    with open(filepath, 'w') as f:
        f.write(content)

    print(f"Processed {filepath}")

process_file('src/modules/supervisor/components/DPVendorIdtTable.tsx', 'AC Side')
process_file('src/modules/supervisor/components/DPVendorBlockTable.tsx', 'DC Side')
process_file('src/modules/supervisor/components/DPQtyTable.tsx')
