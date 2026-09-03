export const applyDraftOverlay = (rows: any[], draftRows: any[]) => {
    if (!draftRows || draftRows.length === 0) return rows;

    // Build a lookup map from draft rows keyed by description, activityId, and composite keys
    const draftByDesc = new Map<string, any>();
    const draftByActId = new Map<string, any>();
    const draftByComposite = new Map<string, any>();
    
    for (const dr of draftRows) {
        const desc = String(dr.description || dr.activities || '').trim();
        const drId = String(dr.activityId || dr.activityObjectId || '').trim();
        const block = String(dr.block || '').trim();

        const mergeDr = (existing: any, newDr: any) => {
            if (!existing) return newDr;
            return {
                ...existing,
                ...newDr,
                todayValue: (newDr.todayValue !== undefined && newDr.todayValue !== '') ? newDr.todayValue : existing.todayValue,
                yesterdayValue: (newDr.yesterdayValue !== undefined && newDr.yesterdayValue !== '') ? newDr.yesterdayValue : existing.yesterdayValue,
                historyValues: { ...(existing.historyValues || {}), ...(newDr.historyValues || {}) },
                _cellStatuses: { ...(existing._cellStatuses || {}), ...(newDr._cellStatuses || {}) }
            };
        };

        if (desc) draftByDesc.set(desc, mergeDr(draftByDesc.get(desc), dr));
        if (drId) draftByActId.set(drId, mergeDr(draftByActId.get(drId), dr));
        
        // Composite key for rows that share activityId but have different descriptions/blocks (e.g., Solar Manpower)
        if (drId) {
            const compKey = `${drId}|${desc}|${block}`;
            draftByComposite.set(compKey, mergeDr(draftByComposite.get(compKey), dr));
        }
    }

    return rows.map(row => {
        const rId = String(row.activityId || row.activityObjectId || '').trim();
        const rName = String(row.name || row.description || row.activities || '').trim();
        const rBlock = String(row.block || '').trim();

        // Strict matching: Try composite first, then ID, then Name to prevent "fan-out"
        let match = null;
        if (rId) {
            match = draftByComposite.get(`${rId}|${rName}|${rBlock}`) || draftByActId.get(rId);
        } else {
            match = draftByDesc.get(rName);
        }
        
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

        // Sync historical daily progress values (for all editable history columns)
        if (match.historyValues !== undefined) {
            merged.historyValues = { ...(merged.historyValues || {}), ...match.historyValues };
        }

        // ── "Completed as on" ──────────────────────────────────────────────
        // The server (yesterday-values API) returns cumulativeValue = P6 baseline + all daily
        // progress up to *yesterday*. It deliberately excludes today because today's value is
        // an in-progress edit that lives in the draft, not yet committed to the history ledger.
        //
        // For custom (DPR) activities there is no P6 baseline, so the draft's stored cumulative
        // is the single source of truth and is restored as-is.
        //
        // For P6-backed activities the server's figure is authoritative for everything up to
        // yesterday. But we must ADD todayValue on top, otherwise "Completed as on" is stale
        // after a submit/rebuild because the draft overlay restores todayValue into its own
        // column but never folds it into actual/cumulative.
        //
        // We do NOT blindly restore the draft's cached cumulative: that caused the old
        // "type 1, it jumps; delete it, it jumps further" compounding bug. Instead we take
        // the server's cumulative (already in row.cumulative from mergeData) and simply add
        // the todayValue we just restored above.
        const isCustomRow = Boolean(match.isCustom || match._isCustomRow || row.isCustom || row._isCustomRow)
            || String(rId).startsWith('DPR-');
        const serverHasCumulative = (v: any) => v !== undefined && v !== null && v !== '';

        if (isCustomRow || !serverHasCumulative(row.cumulative ?? row.actual)) {
            // Custom row or no server cumulative — use the draft's stored values directly
            if (match.cumulative !== undefined && match.cumulative !== '') {
                merged.cumulative = match.cumulative;
                merged.actualQty = match.cumulative;
            }

            if (match.actual !== undefined && match.actual !== '') {
                merged.actual = match.actual;
                merged.actualQty = match.actual;
            }

            if (match.completed !== undefined && match.completed !== '') {
                merged.completed = match.completed;
                merged.cumulative = match.completed;
            }
        } else {
            // P6-backed row: the server's cumulative covers everything up to yesterday.
            // Add today's value so "Completed as on" reflects the current session's edits.
            const todayVal = Number(merged.todayValue) || 0;
            if (todayVal > 0) {
                const baseCum = Number(row.cumulative ?? row.actual ?? 0);
                const newCum = baseCum + todayVal;
                merged.cumulative = String(newCum);
                merged.actual = String(newCum);
                merged.actualQty = String(newCum);
                merged.completed = String(newCum);
            }
        }

        // Sync manpower specific fields
        if (match.actualUnits !== undefined) merged.actualUnits = match.actualUnits;
        if (match.budgetedUnits !== undefined) merged.budgetedUnits = match.budgetedUnits;
        if (match.remainingUnits !== undefined) merged.remainingUnits = match.remainingUnits;
        if (match.hoursPerDay !== undefined) merged.hoursPerDay = match.hoursPerDay;
        if (match.percentComplete !== undefined) merged.percentComplete = match.percentComplete;
        // completionPercentage is the 0-100 mirror of percentComplete. Carry it across too,
        // otherwise a reload restores the edited 0-1 value next to a stale 0-100 one and the P6
        // push picks the stale figure.
        if (match.completionPercentage !== undefined && match.completionPercentage !== '') {
            merged.completionPercentage = match.completionPercentage;
        }

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
        // Note: merged.cumulative already includes todayVal (backend sends cumulative = priorCumulative + todayValue),
        // so it must not be subtracted again here.
        const scope = Number(merged.totalQuantity || merged.scope || 0);
        const cumVal = Number(merged.cumulative || 0);
        merged.balance = String(scope - cumVal);

        // Edit highlights and rejection markers that came back from the server go into
        // _savedCellStatuses, NOT _cellStatuses.
        //
        // _cellStatuses means "edited in this browser session and not yet saved" - it is what
        // decides which rows a save sends. Restoring the server's copy into it made every row that
        // had ever been touched look permanently unsaved. Keeping the two apart lets the sheet go on
        // showing the PM which cells were changed, while the save still sends only what is genuinely
        // pending. Rendering reads both; the delta reads only _cellStatuses.
        if (match._cellStatuses && Object.keys(match._cellStatuses).length > 0) {
            merged._savedCellStatuses = { ...(merged._savedCellStatuses || {}), ...(match._cellStatuses || {}) };
        }

        // Cleanup: If the draft row only had metadata for dates that were never actually changed 
        // (likely from the old hasDateOverrides bug), remove those bits of metadata.
        if (merged._savedCellStatuses) {
            const statusKeys = Object.keys(merged._savedCellStatuses);
            const isDateOnlyEdit = statusKeys.every(k =>
                k.toLowerCase().includes('start') || k.toLowerCase().includes('finish') || k.toLowerCase().includes('date')
            );

            if (isDateOnlyEdit && !merged.todayValue && !merged.remarks) {
                const datesMatched = (merged.actualStart === row.actualStart) &&
                    (merged.actualFinish === row.actualFinish) &&
                    (merged.forecastStart === row.forecastStart) &&
                    (merged.forecastFinish === row.forecastFinish);

                if (datesMatched) {
                    delete merged._savedCellStatuses;
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

        // The backend converts historyValues and actual_YYYY-MM-DD into a 'history' array.
        // We must unpack it back into the row so the UI can read it.
        if (Array.isArray(match.history)) {
            if (!merged.historyValues) merged.historyValues = {};
            match.history.forEach((h: any) => {
                if (h.date && h.actual !== undefined) {
                    merged.historyValues[h.date] = String(h.actual);
                    merged[`actual_${h.date}`] = String(h.actual);
                }
            });
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
