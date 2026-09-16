import React, { useEffect, useMemo } from "react";
import { getAssignableSheetGroups } from "@/config/sheetConfig";

interface SheetPermissionPickerProps {
  /** The project objects currently selected in the modal (with projectType / parentEps / name). */
  projects: any[];
  selected: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

/**
 * "Permitted Sheets" checklist for the assignment modals, driven by the selected projects rather
 * than a fixed solar list. Sheets are grouped by project type so a mixed selection (say a solar and
 * a wind project) shows both sets under their own heading. A selection that no longer applies -
 * the user switched from a wind project to a solar one - is dropped, so stale ids are never saved.
 */
export const SheetPermissionPicker: React.FC<SheetPermissionPickerProps> = ({ projects, selected, onChange, className }) => {
  const groups = useMemo(() => getAssignableSheetGroups(projects), [projects]);
  const availableIds = useMemo(() => new Set(groups.flatMap(g => g.sheets.map(s => s.id))), [groups]);

  useEffect(() => {
    const pruned = (selected || []).filter(id => availableIds.has(id));
    if (pruned.length !== (selected || []).length) onChange(pruned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIds]);

  const toggle = (id: string) => {
    const current = selected || [];
    onChange(current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  };

  if (groups.length === 0) {
    return (
      <div className={className}>
        <p className="text-xs text-muted-foreground p-2">Select a project first - the sheets offered depend on the project type.</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {groups.map(group => (
        <div key={group.key} className="mb-1">
          {groups.length > 1 && (
            <div className="px-2 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.typeLabel}
            </div>
          )}
          {group.sheets.map(sheet => (
            <div
              key={sheet.id}
              className="flex items-center space-x-2 p-2 hover:bg-muted cursor-pointer rounded"
              onClick={() => toggle(sheet.id)}
            >
              <input
                type="checkbox"
                checked={(selected || []).includes(sheet.id)}
                onChange={() => { }} // handled by the row click
                className="h-4 w-4 flex-shrink-0 rounded border-border"
              />
              <span className="flex-1 text-sm">{sheet.label}</span>
            </div>
          ))}
        </div>
      ))}
      <p className="text-xs text-muted-foreground mt-1 px-1">
        If no sheets are selected, the user will have access to all sheets by default.
      </p>
    </div>
  );
};
