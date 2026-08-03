import re
import os

def update_wind():
    filepath = 'frontend/src/modules/supervisor/components/wind/WindProgressTable.tsx'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add to baseCols
    content = re.sub(
        r'"Scope",\s*"Completed",\s*"Baseline Start"',
        '"Scope",\n      "Completed",\n      "Physical Progress %",\n      "Baseline Start"',
        content
    )

    # 2. Add to columnWidths
    content = re.sub(
        r'"Scope": 70,\s*"Completed": 80,\s*"Baseline Start": 100,',
        '"Scope": 70,\n    "Completed": 80,\n    "Physical Progress %": 100,\n    "Baseline Start": 100,',
        content
    )

    # 3. Add to columnTypes
    content = re.sub(
        r'"Scope": "number" as const,\s*"Completed": "number" as const,\s*"Baseline Start": "text" as const,',
        '"Scope": "number" as const,\n    "Completed": "number" as const,\n    "Physical Progress %": "number" as const,\n    "Baseline Start": "text" as const,',
        content
    )

    # 4. Add to editableColumns
    content = re.sub(
        r'"Resource", "Scope", "Completed", "Actual Start", "Actual Finish"',
        '"Resource", "Scope", "Completed", "Physical Progress %", "Actual Start", "Actual Finish"',
        content
    )

    # 5. Add to headerStructure
    content = re.sub(
        r'\{ label: "Scope", rowSpan: 2, colSpan: 1 \},\s*\{ label: "Completed", rowSpan: 2, colSpan: 1 \}',
        '{ label: "Scope", rowSpan: 2, colSpan: 1 },\n      { label: "Completed", rowSpan: 2, colSpan: 1 },\n      { label: "Physical Progress %", rowSpan: 2, colSpan: 1 }',
        content
    )

    # 6. Add to data row mapper
    content = re.sub(
        r'displayScope,\s*displayCompleted,\s*formatDt\(row\.baselineStart\),',
        "displayScope,\n        displayCompleted,\n        row.percentComplete !== undefined && row.percentComplete !== null ? String(row.percentComplete) : '',\n        formatDt(row.baselineStart),",
        content
    )

    # 7. Refactor handleDataChange P6 Rows
    content = re.sub(
        r'const activityId = row\[1\];',
        'const getIdx = (name: string) => columns.indexOf(name);\n      const activityId = row[getIdx("Activity ID")];',
        content
    )
    content = re.sub(
        r'let newSelectedResourceId = String\(row\[15\] \|\| \'\'\)\.trim\(\);',
        "let newSelectedResourceId = String(row[getIdx('Resource')] || '').trim();",
        content
    )
    content = re.sub(
        r'scope: String\(row\[16\] !== undefined \? row\[16\] : \(original\.scope \|\| \'\'\)\),',
        "scope: String(row[getIdx('Scope')] !== undefined ? row[getIdx('Scope')] : (original.scope || '')),",
        content
    )
    content = re.sub(
        r'completed: String\(row\[17\] !== undefined \? row\[17\] : \(original\.completed \|\| \'\'\)\)',
        "completed: String(row[getIdx('Completed')] !== undefined ? row[getIdx('Completed')] : (original.completed || ''))",
        content
    )
    content = re.sub(
        r'let newScope = row\[16\] !== undefined \? String\(row\[16\]\) : String\(original\.scope \|\| \'\'\);',
        "let newScope = row[getIdx('Scope')] !== undefined ? String(row[getIdx('Scope')]) : String(original.scope || '');",
        content
    )
    content = re.sub(
        r'let newCompleted = row\[17\] !== undefined \? String\(row\[17\]\) : \'\';',
        "let newCompleted = row[getIdx('Completed')] !== undefined ? String(row[getIdx('Completed')]) : '';\n      const newProg = row[getIdx('Physical Progress %')];",
        content
    )
    content = re.sub(
        r'const newActualStart = row\[20\] \|\| \'\';',
        "const newActualStart = row[getIdx('Actual Start')] || '';",
        content
    )
    content = re.sub(
        r'const newActualFinish = row\[21\] \|\| \'\';',
        "const newActualFinish = row[getIdx('Actual Finish')] || '';",
        content
    )
    content = re.sub(
        r'let newForecastStart = row\[22\] \|\| \'\';',
        "let newForecastStart = row[getIdx('Forecast Start')] || '';",
        content
    )
    content = re.sub(
        r'let newForecastFinish = row\[23\] \|\| \'\';',
        "let newForecastFinish = row[getIdx('Forecast Finish')] || '';",
        content
    )
    content = re.sub(
        r'completed: newCompleted,',
        "completed: newCompleted,\n        percentComplete: newProg !== undefined && newProg !== '' ? Number(newProg) : undefined,",
        content
    )

    custom_repl = """const getIdx = (name: string) => columns.indexOf(name);
        const newDesc = row[getIdx('Description')] || '';
        let newStatus = row[getIdx('Status')] || 'Not Started';
        const newSub = row[getIdx('Substation')] || '';
        const newSpv = row[getIdx('SPV')] || '';
        const newLoc = row[getIdx('Location')] || '';
        const newGroup = row[getIdx('Activity Group')] || '';

        const newFeeder = row[getIdx('Feeder')] || '';
        const newVendor = row[getIdx('WTG FDN Vendor')] || '';
        const newDate = row[getIdx('FDN Allotment Date')] || '';
        const newContractor = row[getIdx('Stone Column Contractor')] || '';
        const newSoil = row[getIdx('Soil Test Status')] || '';
        const newE = row[getIdx('Coord E')] || '';
        const newN = row[getIdx('Coord N')] || '';

        const newScope = row[getIdx('Scope')] || '0';
        const newCum = row[getIdx('Completed')] || '0';
        const newProg = row[getIdx('Physical Progress %')] || '';
        const newActStart = row[getIdx('Actual Start')] || '';
        const newActFinish = row[getIdx('Actual Finish')] || '';
        const newFcstStart = row[getIdx('Forecast Start')] || '';
        const newFcstFinish = row[getIdx('Forecast Finish')] || '';"""
        
    content = re.sub(
        r'const newDesc = row\[2\] \|\| \'\';.*?const newFcstFinish = row\[23\] \|\| \'\';',
        custom_repl,
        content,
        flags=re.DOTALL
    )

    content = re.sub(
        r'cumulative: Number\(newCum\) \|\| 0,',
        "cumulative: Number(newCum) || 0,\n            percentComplete: newProg !== '' ? Number(newProg) : undefined,",
        content
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

def update_pss():
    filepath = 'frontend/src/modules/supervisor/components/pss/PSSProgressTable.tsx'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Columns
    content = re.sub(
        r'"Scope": 80,\s*"Completed": 90,\s*"Balance": 80,',
        '"Scope": 80,\n    "Completed": 90,\n    "Physical Progress %": 100,\n    "Balance": 80,',
        content
    )
    content = re.sub(
        r'"Scope": "number" as const,\s*"Completed": "number" as const,\s*"Balance": "number" as const,',
        '"Scope": "number" as const,\n    "Completed": "number" as const,\n    "Physical Progress %": "number" as const,\n    "Balance": "number" as const,',
        content
    )
    content = re.sub(
        r'"SO Vendor Name", "UOM", "Scope", "Completed", "Remarks"',
        '"SO Vendor Name", "UOM", "Scope", "Completed", "Physical Progress %", "Remarks"',
        content
    )
    content = re.sub(
        r'\{ label: "Scope", rowSpan: 2, colSpan: 1 \},\s*\{ label: "Completed", rowSpan: 2, colSpan: 1 \},\s*\{ label: "Balance", rowSpan: 2, colSpan: 1 \},',
        '{ label: "Scope", rowSpan: 2, colSpan: 1 },\n      { label: "Completed", rowSpan: 2, colSpan: 1 },\n      { label: "Physical Progress %", rowSpan: 2, colSpan: 1 },\n      { label: "Balance", rowSpan: 2, colSpan: 1 },',
        content
    )

    # Data row mapping (rows.push(arr)) - Note: PSS pushes an array
    content = re.sub(
        r'row\.scope \|\| \'\',\s*row\.completed \|\| \'\',\s*row\.balance \|\| \'\',',
        "row.scope || '',\n        row.completed || '',\n        row.percentComplete !== undefined && row.percentComplete !== null ? String(row.percentComplete) : '',\n        row.balance || '',",
        content
    )

    # Custom row mapping (customArr)
    content = re.sub(
        r'String\(c\.scope \|\| 0\),\s*String\(c\.cumulative \|\| 0\),\s*String\(Math\.max\(0, \(c\.scope \|\| 0\) - \(c\.cumulative \|\| 0\)\)\),',
        "String(c.scope || 0),\n          String(c.cumulative || 0),\n          c.percentComplete !== undefined && c.percentComplete !== null ? String(c.percentComplete) : '',\n          String(Math.max(0, (c.scope || 0) - (c.cumulative || 0))),",
        content
    )

    # Total row mapping (totalRow)
    content = re.sub(
        r'String\(totalScope \|\| \'\'\),\s*String\(totalCompleted \|\| \'\'\),\s*String\(totalBalance \|\| \'\'\),',
        "String(totalScope || ''),\n        String(totalCompleted || ''),\n        '',\n        String(totalBalance || ''),",
        content
    )

    # handleDataChange P6 Rows
    content = re.sub(
        r'const desc = String\(row\[1\] \|\| \'\'\);',
        'const getIdx = (name: string) => editableColumns.indexOf(name) !== -1 ? editableColumns.indexOf(name) : -1;\n      const desc = String(row[1] || "");',
        content
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

update_wind()
update_pss()
print("Updated successfully")
