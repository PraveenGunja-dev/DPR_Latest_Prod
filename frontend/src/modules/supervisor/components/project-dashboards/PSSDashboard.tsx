import React, { useState, useEffect, useCallback } from "react";
import { AlertCircle, Package } from "lucide-react";
import { toast } from "sonner";
import { 
  PSSSummaryTable, 
  PSSProgressTable, 
  PSSManpowerTable,
  ManpowerTimephasedTable
} from "../index";
import { getManpowerDetailsData, getManpowerTimephasedData, aggregateManpowerByActivityName } from "@/services/p6ActivityService";
import { saveDraftEntry, submitEntry, getDraftEntry, pushEntryToP6 } from "@/services/dprService";
import { useAuth } from "@/modules/auth/contexts/AuthContext";

interface PSSDashboardProps {
  projectId: number;
  targetDate: string;
  targetYesterday: string;
  activeTab: string;
  currentDraftEntry: any;
  onDraftUpdate: (draft: any) => void;
  isEntryReadOnly: boolean;
}

export const PSSDashboard: React.FC<PSSDashboardProps> = ({
  projectId,
  targetDate,
  targetYesterday,
  activeTab,
  currentDraftEntry,
  onDraftUpdate,
  isEntryReadOnly
}) => {
  const [pssProgressData, setPssProgressData] = useState<any[]>([]);
  const [pssSummaryData, setPssSummaryData] = useState<any[]>([]);
  const [pssManpowerData, setPssManpowerData] = useState<any[]>([]);
  const [manpowerTimephasedData, setManpowerTimephasedData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSubmitEntry = async () => {
    if (!currentDraftEntry) return;
    try {
      await handleSaveEntry();
      await submitEntry(currentDraftEntry.id);
      toast.success("Entry submitted!");
      
      const updatedDraft = await getDraftEntry(projectId, activeTab, targetDate);
      if (updatedDraft) onDraftUpdate(updatedDraft);
    } catch (error) {
      toast.error("Submission failed");
    }
  };

  const handlePushToP6 = async () => {
    if (!currentDraftEntry) return;
    try {
      const resp = await pushEntryToP6(currentDraftEntry.id);
      if (resp.message) {
        toast.success(resp.message);
        const updatedDraft = await getDraftEntry(projectId, activeTab, targetDate);
        if (updatedDraft) onDraftUpdate(updatedDraft);
      }
    } catch (error) {
      toast.error("P6 Push failed");
    }
  };

  // PSS specific fetching can be added here
  useEffect(() => {
    const fetchPssManpower = async () => {
      if (!projectId) return;
      setLoading(true);
      try {
        const manpowerData = await getManpowerDetailsData(projectId);
        setPssManpowerData(manpowerData);
        
        const timephasedData = await getManpowerTimephasedData(projectId, targetDate);
        setManpowerTimephasedData(aggregateManpowerByActivityName(timephasedData));
      } catch (error) {
        toast.error("Failed to load PSS manpower");
      } finally {
        setLoading(false);
      }
    };
    fetchPssManpower();
  }, [projectId, targetDate]);

  const handleSaveEntry = async () => {
    if (!currentDraftEntry) return;
    try {
      let currentData: any[] = [];
      switch (activeTab) {
        case 'pss_summary': currentData = pssSummaryData; break;
        case 'pss_progress': currentData = pssProgressData; break;
        case 'pss_manpower': currentData = pssManpowerData; break;
        case 'manpower_details_2': currentData = manpowerTimephasedData; break;
        default: return;
      }

      const deltaRows = currentData.filter((row: any) => {
        if (row.isCategoryRow) return false;
        
        // Prioritize explicit edit metadata for delta detection
        const hasMetadata = row._cellStatuses && Object.keys(row._cellStatuses).length > 0;
        if (hasMetadata) return true;
        
        return false;
      });

      if (deltaRows.length === 0) {
        toast.warning("No new changes detected.");
        return;
      }

      await saveDraftEntry(currentDraftEntry.id, { rows: deltaRows }, true);
      toast.success(`Updated ${deltaRows.length} activities successfully!`);
    } catch (error) {
      toast.error("Failed to save entry");
    }
  };

  const renderActiveTable = () => {
    const entryStatus = currentDraftEntry?.status || 'draft';
    const isRejected = currentDraftEntry?.isRejected;
    const rejectionReason = currentDraftEntry?.rejectionReason;

    const RejectedAlert = () => isRejected && rejectionReason ? (
      <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
          <div>
            <h4 className="text-red-800 font-medium">Entry Rejected by PM</h4>
            <p className="text-red-700 mt-1">Reason: {rejectionReason}</p>
          </div>
        </div>
      </div>
    ) : null;

    const { user } = useAuth();
    const userRoleLower = (user?.role || user?.Role || '').toLowerCase();
    const canPush = userRoleLower === 'site pm' || userRoleLower === 'pmag' || userRoleLower === 'super admin';

    switch (activeTab) {
      case 'pss_summary':
        return (
          <PSSSummaryTable
            data={pssSummaryData}
            setData={setPssSummaryData}
            onSave={isEntryReadOnly ? undefined : handleSaveEntry}
            onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
            isLocked={isEntryReadOnly}
            status={entryStatus}
            projectId={projectId}
          />
        );
      case 'pss_progress':
        return (
          <>
            <RejectedAlert />
            <PSSProgressTable
              data={pssProgressData}
              setData={setPssProgressData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
            />
          </>
        );
      case 'pss_manpower':
        return (
          <>
            <RejectedAlert />
            <PSSManpowerTable
              data={pssManpowerData}
              setData={setPssManpowerData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              todayDate={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
            />
          </>
        );
      case 'manpower_details_2':
        return (
          <>
            <RejectedAlert />
            <ManpowerTimephasedTable
              data={manpowerTimephasedData}
              setData={setManpowerTimephasedData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12">
            <Package className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <p className="text-muted-foreground">Loading PSS Progress...</p>
          </div>
        ) : (
          renderActiveTable()
        )}
      </div>
    </div>
  );
};
