import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import { 
    DPQtyTable, 
    ACSheetTable, 
    ManpowerDetailsTable, 
    DCSheetTable, 
    TestingCommTable,
    WindSummaryTable,
    WindProgressTable,
    WindManpowerTable,
    PSSSummaryTable,
    PSSProgressTable,
    PSSManpowerTable
} from "@/modules/supervisor/components";
import { getTodayAndYesterday } from "@/services/dprService";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { getActivityMaterialResources } from "@/services/p6ActivityService";

interface PMAGEditEntryModalProps {
  editingEntry: any;
  editData: any;
  setEditData: React.Dispatch<React.SetStateAction<any>>;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onSaveAndPush?: () => void;
  onReject?: (entryId: number, sheetType: string) => void;
  onPushToP6?: (entry: any) => void;
}

export const PMAGEditEntryModal: React.FC<PMAGEditEntryModalProps> = ({
  editingEntry,
  editData,
  setEditData,
  isOpen,
  onClose,
  onSave,
  onSaveAndPush,
  onReject,
  onPushToP6
}) => {
  const [isSubmitModalOpen, setIsSubmitModalOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<'save' | 'push' | null>(null);
  const [resourcesByActivity, setResourcesByActivity] = React.useState<Record<string, any[]>>({});

  React.useEffect(() => {
    if (isOpen && editingEntry?.project_id) {
      getActivityMaterialResources(editingEntry.project_id)
        .then(res => setResourcesByActivity(res))
        .catch(err => console.error("Failed to fetch resources in PMAG edit", err));
    } else {
      setResourcesByActivity({});
    }
  }, [isOpen, editingEntry]);

  const handleSaveEdit = () => {
    setPendingAction('save');
    setIsSubmitModalOpen(true);
  };

  const handlePush = () => {
    setPendingAction('push');
    setIsSubmitModalOpen(true);
  };

  return (
    <Dialog open={!!editingEntry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-full flex flex-col p-0 gap-0 rounded-2xl overflow-hidden bg-slate-50/50">
        {editingEntry && editData && (
            <>
              {(() => {
                const normalizedSheetType = (editingEntry.sheet_type || '').replace(/ /g, '_');
                return (
                  <>
                    <DialogHeader className="px-6 py-4 border-b border-white/10 gradient-adani flex flex-row items-center justify-between space-y-0 shrink-0 sticky top-0 z-10 w-full">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-white/10 rounded-xl">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </div>
                        <div>
                          <DialogTitle className="text-xl font-bold leading-none text-white">
                            Edit / Reject Entry
                          </DialogTitle>
                          <p className="text-sm text-white/80 mt-1">
                            {editingEntry?.sheet_type?.replace(/_/g, ' ').toUpperCase()} • {editingEntry?.supervisor_name || 'Supervisor'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex-1 flex justify-center px-4">
                          <div className="text-sm text-white bg-black/20 px-3 py-1.5 rounded-md border border-white/10 shadow-sm">
                            <strong>Tip:</strong> Hover over any cell (or tap it on mobile) and click the red <span className="inline-flex items-center justify-center border border-red-300 bg-red-500 rounded px-1 text-white rounded-full text-[10px] w-4 h-4 shadow-sm">!</span> icon to mark it for rejection.
                          </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={onClose} className="h-9 px-4 font-medium border-white/20 bg-white/10 text-white hover:bg-white/20">
                          Cancel
                        </Button>
                        {onReject && (
                          <Button variant="destructive" onClick={() => onReject(editingEntry.id, editingEntry.sheet_type)} className="h-9 px-4 font-medium bg-red-600 hover:bg-red-700 text-white border-none">
                            Reject Entry
                          </Button>
                        )}
                        <Button onClick={handleSaveEdit} className="h-9 px-6 bg-white text-primary hover:bg-slate-100 font-semibold shadow-md transition-all active:scale-95">
                          Save Changes
                        </Button>
                        {onSaveAndPush && (
                          <Button onClick={handlePush} className="h-9 px-6 bg-green-600 hover:bg-green-700 text-white font-semibold shadow-md transition-all active:scale-95 border-none">
                            Approve & Push to P6
                          </Button>
                        )}
                      </div>
                    </DialogHeader>

                    <div className="p-6 space-y-6 flex-1 flex flex-col min-h-0 overflow-y-auto">
                      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                        <div className="space-y-1.5 xl:border-r border-slate-100 pr-4">
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Project Information</p>
                          <p className="text-sm font-semibold text-slate-800 truncate">{editData.staticHeader?.projectInfo || 'N/A'}</p>
                        </div>
                        <div className="space-y-1.5 xl:border-r border-slate-100 pr-4">
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Reporting Date</p>
                          <p className="text-sm font-semibold text-slate-800">{editData.staticHeader?.reportingDate || 'N/A'}</p>
                        </div>
                        <div className="space-y-1.5 xl:border-r border-slate-100 pr-4">
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Progress Date</p>
                          <p className="text-sm font-semibold text-slate-800">{editData.staticHeader?.progressDate || 'N/A'}</p>
                        </div>
                        <div className="space-y-1.5 xl:border-r border-slate-100 pr-4">
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Submitted By</p>
                          <p className="text-sm font-semibold text-slate-800 truncate">{editingEntry.supervisor_name || 'N/A'}</p>
                        </div>
                        <div className="space-y-1.5 xl:border-r border-slate-100 pr-4">
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Approved By (PM)</p>
                          <p className="text-sm font-semibold text-slate-800 truncate">{editingEntry.pm_name || 'N/A'}</p>
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Submission Date</p>
                          <p className="text-sm font-semibold text-slate-800">{new Date(editingEntry.submitted_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                        </div>
                      </div>
                      
                      {editData.rows && editData.rows.length > 0 && (
                        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-2">
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
                            {normalizedSheetType === 'dp_qty' && (
                                <DPQtyTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} yesterday={editData.staticHeader?.progressDate || getTodayAndYesterday().yesterday} today={editData.staticHeader?.reportingDate || getTodayAndYesterday().today} isLocked={false} status={editingEntry.status} />
                            )}
                            {(normalizedSheetType === 'dp_vendor_idt' || normalizedSheetType === 'dc_sheet') && (
                                <DCSheetTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} yesterday={editData.staticHeader?.progressDate || getTodayAndYesterday().yesterday} today={editData.staticHeader?.reportingDate || getTodayAndYesterday().today} isLocked={false} status={editingEntry.status} />
                            )}
                            {(normalizedSheetType === 'dp_vendor_block' || normalizedSheetType === 'ac_sheet') && (
                                <ACSheetTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} yesterday={editData.staticHeader?.progressDate || getTodayAndYesterday().yesterday} today={editData.staticHeader?.reportingDate || getTodayAndYesterday().today} isLocked={false} status={editingEntry.status} />
                            )}
                            {normalizedSheetType === 'testing_commissioning' && (
                                <TestingCommTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} yesterday={editData.staticHeader?.progressDate || getTodayAndYesterday().yesterday} today={editData.staticHeader?.reportingDate || getTodayAndYesterday().today} isLocked={false} status={editingEntry.status} />
                            )}
                            {normalizedSheetType === 'wind_progress' && (
                                <WindProgressTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} yesterday={editData.staticHeader?.progressDate || getTodayAndYesterday().yesterday} today={editData.staticHeader?.reportingDate || getTodayAndYesterday().today} isLocked={false} status={editingEntry.status} />
                            )}
                            {normalizedSheetType === 'wind_summary' && (
                                <WindSummaryTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} isLocked={false} status={editingEntry.status} />
                            )}
                            {normalizedSheetType === 'wind_manpower' && (
                                <WindManpowerTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} isLocked={false} status={editingEntry.status} today={editData.staticHeader?.reportingDate || getTodayAndYesterday().today} yesterday={editData.staticHeader?.progressDate || getTodayAndYesterday().yesterday} />
                            )}
                            {normalizedSheetType === 'pss_progress' && (
                                <PSSProgressTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} yesterday={editData.staticHeader?.progressDate || getTodayAndYesterday().yesterday} today={editData.staticHeader?.reportingDate || getTodayAndYesterday().today} isLocked={false} status={editingEntry.status} />
                            )}
                            {normalizedSheetType === 'pss_summary' && (
                                <PSSSummaryTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} isLocked={false} status={editingEntry.status} />
                            )}
                            {normalizedSheetType === 'pss_manpower' && (
                                <PSSManpowerTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} onSave={() => {}} onSubmit={handleSaveEdit} isLocked={false} status={editingEntry.status} todayDate={editData.staticHeader?.reportingDate || getTodayAndYesterday().today} />
                            )}
                            {normalizedSheetType === 'manpower_details' && (
                                <ManpowerDetailsTable data={editData.rows} setData={(newRows) => setEditData({ ...editData, rows: newRows })} totalManpower={editData.totalManpower} setTotalManpower={(tm) => setEditData({ ...editData, totalManpower: tm })} onSave={() => {}} onSubmit={handleSaveEdit} yesterday={editData.staticHeader?.progressDate || getTodayAndYesterday().yesterday} today={editData.staticHeader?.reportingDate || getTodayAndYesterday().today} isLocked={false} status={editingEntry.status} />
                            )}

                            {![
                              'dp_qty', 'dp_vendor_idt', 'dc_sheet', 'dp_vendor_block', 'ac_sheet', 'manpower_details', 'manpower_details_2', 
                              'testing_commissioning', 'wind_summary', 'wind_progress', 'wind_manpower', 'pss_summary', 'pss_progress', 'pss_manpower'
                            ].includes(normalizedSheetType) && (
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
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </>
        )}
      </DialogContent>
      <ConfirmationModal 
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onConfirm={() => {
          setIsSubmitModalOpen(false);
          if (pendingAction === 'push' && onSaveAndPush) {
              onSaveAndPush();
          } else {
              onSave();
          }
        }}
        title={pendingAction === 'push' ? "Approve & Push to P6" : "Save Changes"}
        description={pendingAction === 'push' ? "Are you sure you want to save these changes and push this entry directly to P6?" : "Are you sure you want to save these changes? You can push to P6 after saving."}
        confirmLabel={pendingAction === 'push' ? "Approve & Push" : "Save Changes"}
      />
    </Dialog>
  );
};

