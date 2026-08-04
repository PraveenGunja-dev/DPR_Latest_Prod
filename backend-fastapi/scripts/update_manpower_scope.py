import re

file_path = r"d:\DPR\Digitalized_DPR_Prod\frontend\src\modules\supervisor\components\pss\PSSManpowerTable.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. columns
content = content.replace(
    '"Department",\n    "Completed (Cumulative)",',
    '"Department",\n    "Scope",\n    "Completed (Cumulative)",'
)

# 2. columnWidths
content = content.replace(
    '"Department": 160,\n      "Completed (Cumulative)": 150,',
    '"Department": 160,\n      "Scope": 100,\n      "Completed (Cumulative)": 150,'
)

# 3. columnTypes
content = content.replace(
    '"Department": "text",\n      "Completed (Cumulative)": "number",',
    '"Department": "text",\n      "Scope": "number",\n      "Completed (Cumulative)": "number",'
)

# 4. editableColumns
content = content.replace(
    '"Description", "Areas", "Department", "Completed (Cumulative)",',
    '"Description", "Areas", "Department", "Scope", "Completed (Cumulative)",'
)

# 5. headerStructure
content = content.replace(
    '{ label: "Department", colSpan: 1 },\n      { label: "Completed (Cumulative)", colSpan: 1 },',
    '{ label: "Department", colSpan: 1 },\n      { label: "Scope", colSpan: 1 },\n      { label: "Completed (Cumulative)", colSpan: 1 },'
)

# 6. totalScope declaration
content = content.replace(
    'let totalCumulative = 0;\n    let totalToday = 0;',
    'let totalScope = 0;\n    let totalCumulative = 0;\n    let totalToday = 0;'
)

# 7. categoryRow
content = content.replace(
    'const categoryRow: any[] = ["", currentParentWbs, "", "", "", ...midBlanks, ""];',
    'const categoryRow: any[] = ["", currentParentWbs, "", "", "", "", ...midBlanks, ""];'
)
content = content.replace(
    'const customCatRow: any = ["", "📝 DPR Level Activities", "", "", "", ...midBlanks, ""];',
    'const customCatRow: any = ["", "📝 DPR Level Activities", "", "", "", "", ...midBlanks, ""];'
)

# 8. arr values
content = content.replace(
    '''      totalCumulative += Number(row.completedCumulative || row.actualUnits) || 0;
      totalToday += Number(row.today) || 0;

      const key = String(row.activityId || row.description || '');
      const arr: any = [
        showActivityId ? String(row.activityId || '') : String(sNo++),
        row.description || '',
        row.areas || row.block || '',
        row.department || '',
        row.completedCumulative || row.actualUnits || '',
        ...buildMiddle(key, row.historyValues),
        row.today || '',
      ];''',
    '''      totalScope += Number(row.budgetedUnits || row.scope) || 0;
      totalCumulative += Number(row.completedCumulative || row.actualUnits) || 0;
      totalToday += Number(row.today) || 0;

      const key = String(row.activityId || row.description || '');
      const arr: any = [
        showActivityId ? String(row.activityId || '') : String(sNo++),
        row.description || '',
        row.areas || row.block || '',
        row.department || '',
        row.budgetedUnits || row.scope || '',
        row.completedCumulative || row.actualUnits || '',
        ...buildMiddle(key, row.historyValues),
        row.today || '',
      ];'''
)

# 9. custom arr values
content = content.replace(
    '''      safeCustom.forEach((c) => {
        const cumulative = Number(c.cumulative) || 0;
        const todayVal = Number(c.extraData?.todayValue) || 0;

        totalCumulative += cumulative;
        totalToday += todayVal;

        const key = String(c.activityId || c.description || '');
        const customArr: any = [
          showActivityId ? String(c.activityId || '') : String(sNo++),
          c.description || '',
          c.extraData?.areas || '',
          c.extraData?.department || '',
          String(cumulative),
          ...buildMiddle(key, c.extraData?.historyValues),
          String(todayVal),
        ];''',
    '''      safeCustom.forEach((c) => {
        const cumulative = Number(c.cumulative) || 0;
        const todayVal = Number(c.extraData?.todayValue) || 0;
        const scope = Number(c.extraData?.budgetedUnits || c.scope) || 0;

        totalScope += scope;
        totalCumulative += cumulative;
        totalToday += todayVal;

        const key = String(c.activityId || c.description || '');
        const customArr: any = [
          showActivityId ? String(c.activityId || '') : String(sNo++),
          c.description || '',
          c.extraData?.areas || '',
          c.extraData?.department || '',
          c.extraData?.budgetedUnits || c.scope || '',
          String(cumulative),
          ...buildMiddle(key, c.extraData?.historyValues),
          String(todayVal),
        ];'''
)

# 10. totalRow
content = content.replace(
    '''    if (rows.length > 0) {
      const totalRow: any = [
        "TOTAL", "", "", "",
        String(totalCumulative || ''),''',
    '''    if (rows.length > 0) {
      const totalRow: any = [
        "TOTAL", "", "", "",
        String(totalScope || ''),
        String(totalCumulative || ''),'''
)

# 11. TODAY_IDX
content = content.replace(
    'const TODAY_IDX = showHistory ? 5 + historyDates.length + 1 : 5;',
    'const TODAY_IDX = showHistory ? 6 + historyDates.length + 1 : 6;'
)

# 12. readHistoryValues
content = content.replace(
    '''    historyDates.forEach((hd, i) => {
      const v = row[5 + i];
      hv[hd.iso] = (v === undefined || v === null) ? '' : String(v);
    });
    const yv = row[5 + historyDates.length];''',
    '''    historyDates.forEach((hd, i) => {
      const v = row[6 + i];
      hv[hd.iso] = (v === undefined || v === null) ? '' : String(v);
    });
    const yv = row[6 + historyDates.length];'''
)

# 13. handleDataChange inside p6RowChanges
content = content.replace(
    '''            original.completedCumulative !== row[4] ||
            original.today !== row[TODAY_IDX] ||
            original._cellStatuses !== (row as any)._cellStatuses
          ) {
            p6RowChanges.push({
              index: p6Index,
              data: {
                ...original,
                _cellStatuses: (row as any)._cellStatuses,
                description: row[1] || '',
                areas: row[2] || '',
                department: row[3] || '',
                completedCumulative: row[4] || '',''',
    '''            original.budgetedUnits !== row[4] ||
            original.completedCumulative !== row[5] ||
            original.today !== row[TODAY_IDX] ||
            original._cellStatuses !== (row as any)._cellStatuses
          ) {
            p6RowChanges.push({
              index: p6Index,
              data: {
                ...original,
                _cellStatuses: (row as any)._cellStatuses,
                description: row[1] || '',
                areas: row[2] || '',
                department: row[3] || '',
                budgetedUnits: row[4] || '',
                completedCumulative: row[5] || '','''
)

# 14. handleDataChange inside customRowChanges
content = content.replace(
    '''        const newDesc = row[1] || '';
        const newAreas = row[2] || '';
        const newDept = row[3] || '';
        const newCum = row[4] || '0';
        const newToday = row[TODAY_IDX] || '0';
        const newHistory = readHistoryValues(row, c.extraData?.historyValues);

        const hasCustomChanges =
          newDesc !== (c.description || '') ||
          newAreas !== (c.extraData?.areas || '') ||
          newDept !== (c.extraData?.department || '') ||
          newCum !== String(c.cumulative || 0) ||''',
    '''        const newDesc = row[1] || '';
        const newAreas = row[2] || '';
        const newDept = row[3] || '';
        const newScope = row[4] || '';
        const newCum = row[5] || '0';
        const newToday = row[TODAY_IDX] || '0';
        const newHistory = readHistoryValues(row, c.extraData?.historyValues);

        const hasCustomChanges =
          newDesc !== (c.description || '') ||
          newAreas !== (c.extraData?.areas || '') ||
          newDept !== (c.extraData?.department || '') ||
          newScope !== String(c.extraData?.budgetedUnits || c.scope || '') ||
          newCum !== String(c.cumulative || 0) ||'''
)

# 15. handleDataChange update custom row
content = content.replace(
    '''            extraData: {
              ...c.extraData,
              areas: newAreas,
              department: newDept,
              todayValue: newToday,
              historyValues: newHistory,
            }''',
    '''            extraData: {
              ...c.extraData,
              areas: newAreas,
              department: newDept,
              budgetedUnits: newScope,
              todayValue: newToday,
              historyValues: newHistory,
            }'''
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated successfully")
