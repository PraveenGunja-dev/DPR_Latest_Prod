export const applyDraftOverlay = (rows: any[], draftRows: any[]) => {
    if (!draftRows || draftRows.length === 0) return rows;

    // Build a lookup map from draft rows keyed by description and activityId
    const draftByDesc = new Map<string, any>();
    const draftByActId = new Map<string, any>();
    for (const dr of draftRows) {
        if (dr.description) draftByDesc.set(String(dr.description).trim(), dr);
        if (dr.activities) draftByDesc.set(String(dr.activities).trim(), dr);
        const drId = dr.activityId || dr.activityObjectId;
        if (drId) draftByActId.set(String(drId).trim(), dr);
    }

    return rows.map(row => {
        const rId = String(row.activityId || row.activityObjectId || '').trim();
        const rName = String(row.name || row.description || row.activities || '').trim();

        // Strict ID-first matching to prevent "fan-out" (one draft row affecting multiple blocks by name)
        const match = draftByActId.get(rId) || (rId ? null : draftByDesc.get(rName));
        if (!match) return row;

        const merged = { ...row };

        // Sync today progress + aliases
        if (match.todayValue !== undefined && match.todayValue !== '') {
            merged.todayValue = match.todayValue;
            merged.today = match.todayValue;
        }

        // Sync yesterday progress + aliases
        if (match.yesterdayValue !== undefined && match.yesterdayValue !== '') {
            merged.yesterdayValue = match.yesterdayValue;
            merged.yesterday = match.yesterdayValue;
        }

        // Sync cumulative + aliases
        if (match.cumulative !== undefined && match.cumulative !== '') {
            merged.cumulative = match.cumulative;
            merged.actualQty = match.cumulative;
        }

        // Sync actual + aliases (vendor block style)
        if (match.actual !== undefined && match.actual !== '') {
            merged.actual = match.actual;
            merged.actualQty = match.actual;
        }

        if (match.completed !== undefined && match.completed !== '') {
            merged.completed = match.completed;
            merged.cumulative = match.completed;
        }

        // Sync manpower specific fields
        if (match.actualUnits !== undefined) merged.actualUnits = match.actualUnits;
        if (match.budgetedUnits !== undefined) merged.budgetedUnits = match.budgetedUnits;
        if (match.remainingUnits !== undefined) merged.remainingUnits = match.remainingUnits;
        if (match.hoursPerDay !== undefined) merged.hoursPerDay = match.hoursPerDay;
        if (match.percentComplete !== undefined) merged.percentComplete = match.percentComplete;

        // Preserve Scope from draft if the user manually edited it
        if (match.scope !== undefined && match.scope !== '') {
            merged.scope = match.scope;
            merged.targetQty = match.scope;
            merged.totalQuantity = match.scope;
        } else if (match.totalQuantity !== undefined && match.totalQuantity !== '') {
            merged.scope = match.totalQuantity;
            merged.targetQty = match.totalQuantity;
            merged.totalQuantity = match.totalQuantity;
        }

        // Recalculate balance for master activity consistency
        const scope = Number(merged.totalQuantity || merged.scope || 0);
        const cumVal = Number(merged.cumulative || 0);
        const todayVal = Number(merged.todayValue || 0);
        merged.balance = String(scope - cumVal - todayVal);

        // Preserve _cellStatuses (edit highlights, rejection markers)
        if (match._cellStatuses && Object.keys(match._cellStatuses).length > 0) {
            merged._cellStatuses = { ...(merged._cellStatuses || {}), ...(match._cellStatuses || {}) };
        }

        // Cleanup: If the draft row only had metadata for dates that were never actually changed 
        // (likely from the old hasDateOverrides bug), remove those bits of metadata.
        if (merged._cellStatuses) {
            const statusKeys = Object.keys(merged._cellStatuses);
            const isDateOnlyEdit = statusKeys.every(k =>
                k.toLowerCase().includes('start') || k.toLowerCase().includes('finish') || k.toLowerCase().includes('date')
            );

            if (isDateOnlyEdit && !merged.todayValue && !merged.remarks) {
                const datesMatched = (merged.actualStart === row.actualStart) &&
                    (merged.actualFinish === row.actualFinish) &&
                    (merged.forecastStart === row.forecastStart) &&
                    (merged.forecastFinish === row.forecastFinish);

                if (datesMatched) {
                    delete merged._cellStatuses;
                }
            }
        }

        if (match.remarks) merged.remarks = match.remarks;
        if (match.actualStart) { merged.actualStart = match.actualStart; merged.actualStartDate = match.actualStart; }
        if (match.actualFinish) { merged.actualFinish = match.actualFinish; merged.actualFinishDate = match.actualFinish; }
        if (match.forecastStart) { merged.forecastStart = match.forecastStart; merged.forecastStartDate = match.forecastStart; }
        if (match.forecastFinish) { merged.forecastFinish = match.forecastFinish; merged.forecastFinishDate = match.forecastFinish; }
        if (match.uom) { merged.uom = match.uom; merged.unitOfMeasure = match.uom; }
        if (match.status) merged.status = match.status;
        if (match.selectedResourceId !== undefined) merged.selectedResourceId = match.selectedResourceId;
        if (match.resourceId !== undefined) merged.resourceId = match.resourceId;
        if (match.historyValues !== undefined) {
            merged.historyValues = match.historyValues;
        }

        // Sync dynamic date columns for Resource Table (e.g. 12-Jul-26) and Manpower (e.g. actual_2026-07-20)
        Object.keys(match).forEach(k => {
            if (/^\d{2}-[a-zA-Z]{3}-\d{2}$/.test(k) || k.startsWith('actual_')) {
                merged[k] = match[k];
            }
        });

        return merged;
    });
};
