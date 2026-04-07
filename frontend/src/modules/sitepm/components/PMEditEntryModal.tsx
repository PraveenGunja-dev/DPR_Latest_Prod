import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StyledExcelTable } from "@/components/StyledExcelTable";

interface PMEditEntryModalProps {
  editingEntry: any;
  editData: any;
  setEditData: React.Dispatch<React.SetStateAction<any>>;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onReject?: (entryId: number, sheetType: string) => void;
}

export const PMEditEntryModal: React.FC<PMEditEntryModalProps> = ({
  editingEntry,
  editData,
  setEditData,
  isOpen,
  onClose,
  onSave,
  onReject
}) => {
  const handleSaveEdit = () => {
    const confirmed = window.confirm("Are you sure you want to submit these changes? This action cannot be undone.");
    if (confirmed) {
      onSave();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Edit Entry - {editingEntry?.sheet_type?.replace(/_/g, ' ').toUpperCase()}</DialogTitle>
        </DialogHeader>
        {editingEntry && editData && (
          <div className="space-y-4">
            <div className="bg-muted p-3 rounded-lg dark:bg-gray-800">
              <p className="text-sm"><strong>Supervisor:</strong> {editingEntry.supervisor_name || 'Unknown'}</p>
              <p className="text-sm"><strong>Submitted:</strong> {new Date(editingEntry.submitted_at).toLocaleString()}</p>
              <p className="text-sm"><strong>Status:</strong> {editingEntry.status}</p>
            </div>
            
            {editData.rows && editData.rows.length > 0 && (
              <div>
                {editData.staticHeader && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded mb-4 border border-blue-100 dark:border-blue-800">
                    <p className="text-sm"><strong>Project:</strong> {editData.staticHeader.projectInfo}</p>
                    <p className="text-sm"><strong>Reporting Date:</strong> {editData.staticHeader.reportingDate}</p>
                    <p className="text-sm"><strong>Progress Date:</strong> {editData.staticHeader.progressDate}</p>
                  </div>
                )}
                {editData.totalManpower !== undefined && (
                  <div className="bg-muted p-3 rounded mb-4 dark:bg-gray-800">
                    <p className="text-sm"><strong>Total Manpower:</strong> {editData.totalManpower}</p>
                  </div>
                )}
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
            )}
            
            <div className="flex justify-between items-center w-full mt-6">
              <div className="text-sm text-amber-600 dark:text-amber-400 max-w-[60%]">
                <strong>Tip:</strong> Hover over any cell (or tap it on mobile) and click the red <span className="inline-flex items-center justify-center border border-red-300 bg-red-100 dark:bg-red-900 rounded px-1 text-red-600 rounded-full text-[10px] w-4 h-4">!</span> icon to mark it for rejection.
              </div>
              <div className="flex space-x-2">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                {onReject && (
                  <Button variant="destructive" onClick={() => onReject(editingEntry.id, editingEntry.sheet_type)}>
                    Reject Entry
                  </Button>
                )}
                <Button onClick={handleSaveEdit}>
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};