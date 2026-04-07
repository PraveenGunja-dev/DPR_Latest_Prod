import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StyledExcelTable } from "@/components/StyledExcelTable";

interface PMAGEditEntryModalProps {
  editingEntry: any;
  editData: any;
  setEditData: React.Dispatch<React.SetStateAction<any>>;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onReject?: (entryId: number, sheetType: string) => void;
}

export const PMAGEditEntryModal: React.FC<PMAGEditEntryModalProps> = ({
  editingEntry,
  editData,
  setEditData,
  isOpen,
  onClose,
  onSave,
  onReject
}) => {
  const handleSaveEdit = () => {
    const confirmed = window.confirm("Are you sure you want to save these changes? You can push to P6 after saving.");
    if (confirmed) {
      onSave();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[100vw] w-screen h-screen max-h-screen p-0 m-0 border-none rounded-none shadow-none flex flex-col bg-background">
        <DialogHeader className="px-6 py-4 border-b flex flex-row items-center justify-between space-y-0 shrink-0 bg-background sticky top-0 z-10 w-full">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </div>
            <div>
              <DialogTitle className="text-xl font-bold leading-none">
                Edit / Reject Entry
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {editingEntry?.sheet_type?.replace(/_/g, ' ').toUpperCase()} • {editingEntry?.supervisor_name || 'Supervisor'}
              </p>
            </div>
          </div>
          
          <div className="flex-1 flex justify-center px-4">
              <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-md border border-amber-200 dark:border-amber-800">
                <strong>Tip:</strong> Hover over any cell (or tap it on mobile) and click the red <span className="inline-flex items-center justify-center border border-red-300 bg-red-100 dark:bg-red-900 rounded px-1 text-red-600 rounded-full text-[10px] w-4 h-4">!</span> icon to mark it for rejection.
              </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose} className="h-9 px-4 font-medium border-border hover:bg-muted text-muted-foreground">
              Cancel
            </Button>
            {onReject && (
              <Button variant="destructive" onClick={() => onReject(editingEntry.id, editingEntry.sheet_type)} className="h-9 px-4 font-medium">
                Reject Entry
              </Button>
            )}
            <Button onClick={handleSaveEdit} className="h-9 px-6 bg-primary hover:bg-primary/90 text-white font-semibold shadow-md shadow-primary/10 transition-all active:scale-95">
              Save Changes
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-slate-50/50 flex flex-col">
          {editingEntry && editData && (
            <div className="p-6 space-y-6 flex-1 flex flex-col min-h-0">
              {/* Info Bar */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                <div className="space-y-1.5 border-r border-slate-100 pr-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Project Information</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{editData.staticHeader?.projectInfo || 'N/A'}</p>
                </div>
                <div className="space-y-1.5 border-r border-slate-100 pr-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Reporting Date</p>
                  <p className="text-sm font-semibold text-slate-800">{editData.staticHeader?.reportingDate || 'N/A'}</p>
                </div>
                <div className="space-y-1.5 border-r border-slate-100 pr-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Progress Date</p>
                  <p className="text-sm font-semibold text-slate-800">{editData.staticHeader?.progressDate || 'N/A'}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Submission Date</p>
                  <p className="text-sm font-semibold text-slate-800">{new Date(editingEntry.submitted_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
              </div>
              
              {editData.rows && editData.rows.length > 0 && (
                <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  {editData.totalManpower !== undefined && (
                    <div className="bg-indigo-50/50 px-5 py-2.5 border-b border-indigo-100/50 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                        <p className="text-sm font-bold text-indigo-900 leading-none">
                          Total Unit/Manpower Resources
                        </p>
                      </div>
                      <span className="bg-indigo-500 text-white px-3 py-0.5 rounded-full text-xs font-bold shadow-sm">
                        {editData.totalManpower} Units
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-h-0 relative">
                    <StyledExcelTable
                        title={`Edit ${editingEntry.sheet_type.replace(/_/g, ' ')}`}
                        columns={Object.keys(editData.rows[0])}
                        data={editData.rows.map((row: any) => Object.values(row))}
                        onDataChange={(newData) => {
                            const updatedRows = newData.map((row: any[]) => {
                                const rowObj: any = {};
                                Object.keys(editData.rows[0]).forEach((key, index) => {
                                    rowObj[key] = row[index] || '';
                                });
                                return rowObj;
                            });
                            setEditData({ ...editData, rows: updatedRows });
                        }}
                        onSave={onSave}
                        onSubmit={handleSaveEdit}
                        isReadOnly={false}
                        status={editingEntry?.status || 'draft'}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
