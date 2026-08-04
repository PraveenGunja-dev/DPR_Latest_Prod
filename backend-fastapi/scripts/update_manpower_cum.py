import re

file_path = r"d:\DPR\Digitalized_DPR_Prod\frontend\src\modules\supervisor\components\pss\PSSManpowerTable.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Remove Completed (Cumulative) from editableColumns
content = content.replace(
    '"Description", "Areas", "Department", "Scope", "Completed (Cumulative)",',
    '"Description", "Areas", "Department", "Scope",'
)

# Update the safeData.forEach logic for regular rows
old_logic = """      totalScope += Number(row.budgetedUnits || row.scope) || 0;
      totalCumulative += Number(row.completedCumulative || row.actualUnits) || 0;
      totalToday += Number(row.today) || 0;

      const key = String(row.activityId || row.description || '');
      const arr: any = [
        showActivityId ? String(row.activityId || '') : String(sNo++),
        row.description || '',
        row.areas || row.block || '',
        row.department || '',
        fmtVal(row.budgetedUnits || row.scope),
        fmtVal(row.completedCumulative || row.actualUnits),
        ...buildMiddle(key, row.historyValues),
        fmtVal(row.today),
      ];"""

new_logic = """      const key = String(row.activityId || row.description || '');

      let sumDaily = Number(row.today) || 0;
      if (showHistory) {
        historyDates.forEach(hd => {
          sumDaily += Number(row.historyValues?.[hd.iso] !== undefined ? row.historyValues[hd.iso] : dailyHistory[key]?.[hd.iso]) || 0;
        });
        sumDaily += Number(row.historyValues?.[yesterdayIso] !== undefined ? row.historyValues[yesterdayIso] : dailyHistory[key]?.[yesterdayIso]) || 0;
      }
      const computedCumulative = (Number(row.actualUnits) || 0) + sumDaily;

      totalScope += Number(row.budgetedUnits || row.scope) || 0;
      totalCumulative += computedCumulative;
      totalToday += Number(row.today) || 0;

      const arr: any = [
        showActivityId ? String(row.activityId || '') : String(sNo++),
        row.description || '',
        row.areas || row.block || '',
        row.department || '',
        fmtVal(row.budgetedUnits || row.scope),
        fmtVal(computedCumulative),
        ...buildMiddle(key, row.historyValues),
        fmtVal(row.today),
      ];"""
content = content.replace(old_logic, new_logic)

# Update the custom activities logic
old_custom_logic = """      safeCustom.forEach((c) => {
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
          fmtVal(c.extraData?.budgetedUnits || c.scope),
          fmtVal(cumulative),
          ...buildMiddle(key, c.extraData?.historyValues),
          fmtVal(todayVal),
        ];"""

new_custom_logic = """      safeCustom.forEach((c) => {
        const key = String(c.activityId || c.description || '');

        let sumDaily = Number(c.extraData?.todayValue) || 0;
        if (showHistory) {
          historyDates.forEach(hd => {
            sumDaily += Number(c.extraData?.historyValues?.[hd.iso] !== undefined ? c.extraData.historyValues[hd.iso] : dailyHistory[key]?.[hd.iso]) || 0;
          });
          sumDaily += Number(c.extraData?.historyValues?.[yesterdayIso] !== undefined ? c.extraData.historyValues[yesterdayIso] : dailyHistory[key]?.[yesterdayIso]) || 0;
        }
        const computedCumulative = (Number(c.cumulative) || 0) + sumDaily;

        const scope = Number(c.extraData?.budgetedUnits || c.scope) || 0;
        const todayVal = Number(c.extraData?.todayValue) || 0;

        totalScope += scope;
        totalCumulative += computedCumulative;
        totalToday += todayVal;

        const customArr: any = [
          showActivityId ? String(c.activityId || '') : String(sNo++),
          c.description || '',
          c.extraData?.areas || '',
          c.extraData?.department || '',
          fmtVal(c.extraData?.budgetedUnits || c.scope),
          fmtVal(computedCumulative),
          ...buildMiddle(key, c.extraData?.historyValues),
          fmtVal(todayVal),
        ];"""
content = content.replace(old_custom_logic, new_custom_logic)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Manpower logic updated")
