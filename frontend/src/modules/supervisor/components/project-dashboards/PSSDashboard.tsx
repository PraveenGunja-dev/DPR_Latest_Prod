import React, { useState, useEffect, useCallback } from "react";
import { AlertCircle, Package } from "lucide-react";
import { toast } from "sonner";
import { PSSSummaryTable } from "../pss/PSSSummaryTable";
import { PSSProgressTable } from "../pss/PSSProgressTable";
import { PSSManpowerTable } from "../pss/PSSManpowerTable";
import { PSSTransmissionVisualTable } from "../pss/PSSTransmissionVisualTable";
import { PSSTransmissionTable } from "../pss/PSSTransmissionTable";
import { ManpowerTimephasedTable } from "../ManpowerTimephasedTable";
import {
  getManpowerDetailsData, getManpowerTimephasedData, aggregateManpowerByActivityName,
  getPSSCivilPebData, getPSSElectricalData, getPSSTransmissionVisualData
} from "@/services/p6ActivityService";
import { saveDraftEntry, submitEntry, getDraftEntry, pushEntryToP6 } from "@/services/dprService";
import { getCustomActivities, updateCustomActivity } from "@/services/customActivityService";
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
  // Data states
  const [pssSummaryData, setPssSummaryData] = useState<any[]>([]);
  const [civilPebData, setCivilPebData] = useState<any[]>([]);
  const [electricalData, setElectricalData] = useState<any[]>([]);
  const [transmissionVisualData, setTransmissionVisualData] = useState<any[]>([]);
  const [stringingData, setStringingData] = useState<any[]>([]);
  const [erectionData, setErectionData] = useState<any[]>([]);
  const [foundationData, setFoundationData] = useState<any[]>([]);
  const [pssManpowerData, setPssManpowerData] = useState<any[]>([]);
  const [manpowerTimephasedData, setManpowerTimephasedData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSubSheet, setActiveSubSheet] = useState<'stringing' | 'erection' | 'foundation'>('stringing');

  // Map P6 response to table format
  const mapPSSActivities = (acts: any[]) => acts.map((act: any) => ({
    ...act,
    sNo: '',
    description: act.description || act.name || '',
    priority: act.priority || '',
    duration: act.duration ? String(act.duration) : '',
    planStart: act.baselineStart || act.forecastStart || '',
    planFinish: act.baselineFinish || act.forecastFinish || '',
    actualStart: act.actualStart || '',
    actualFinish: act.actualFinish || '',
    forecastStart: act.forecastStart || '',
    forecastFinish: act.forecastFinish || '',
    soVendorName: act.vendorName || '',
    uom: act.uom || '',
    scope: act.scope ? String(act.scope) : '',
    completed: act.completed ? String(act.completed) : '',
    balance: act.balance ? String(act.balance) : '',
    remarks: '',
    mainHeading: act.mainHeading || '',
    subHeading: act.subHeading || '',
  }));

  const handleSubmitEntry = async () => {
    if (!currentDraftEntry) return;

    let currentData: any[] = [];
    switch (activeTab) {
      case 'pss_civil_peb': currentData = civilPebData; break;
      case 'pss_electrical': currentData = electricalData; break;
      case 'pss_tl_visual': currentData = transmissionVisualData; break;
      case 'pss_summary': currentData = pssSummaryData; break;
    }

    for (const activity of currentData) {
      const actStart = activity.actualStart || activity.actualStartDate;
      const actFinish = activity.actualFinish || activity.actualFinishDate;
      if (actStart && actFinish) {
        const start = new Date(actStart);
        const finish = new Date(actFinish);
        if (finish < start) {
          const actName = activity.description || activity.activities || activity.activityId || 'Unknown Activity';
          toast.error(`Validation Error: Actual Finish cannot be earlier than Actual Start for "${actName}"`);
          return;
        }
      }
    }

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

  // Fetch all PSS data on mount
  useEffect(() => {
    const fetchPssData = async () => {
      if (!projectId) return;
      setLoading(true);
      try {
        // Civil & PEB data
        const civilResp = await getPSSCivilPebData(projectId);
        if (civilResp.data?.length > 0) setCivilPebData(mapPSSActivities(civilResp.data));

        // Electrical data
        const elecResp = await getPSSElectricalData(projectId);
        if (elecResp.data?.length > 0) setElectricalData(mapPSSActivities(elecResp.data));

        // Transmission Visual data
        const tlData = await getPSSTransmissionVisualData(projectId);
        if (tlData.length > 0) setTransmissionVisualData(tlData);

        // Manpower
        const manpowerData = await getManpowerDetailsData(projectId);
        setPssManpowerData(manpowerData);

        const timephasedData = await getManpowerTimephasedData(projectId, targetDate);
        setManpowerTimephasedData(aggregateManpowerByActivityName(timephasedData));
      } catch (error) {
        toast.error("Failed to load PSS data");
      } finally {
        setLoading(false);
      }
    };
    fetchPssData();
  }, [projectId, targetDate]);

  // Load saved transmission sub-sheet data from the DB
  useEffect(() => {
    const loadTransmissionData = async () => {
      if (!projectId) return;
      try {
        const stringingResp = await getCustomActivities(projectId, 'pss_tl_stringing');
        setStringingData(stringingResp || []);
        
        const erectionResp = await getCustomActivities(projectId, 'pss_tl_erection');
        setErectionData(erectionResp || []);
        
        const foundationResp = await getCustomActivities(projectId, 'pss_tl_foundation');
        setFoundationData(foundationResp || []);
      } catch (error) {
        console.error("Error loading transmission data:", error);
      }
    };
    loadTransmissionData();
  }, [projectId]);

  const handleSaveEntry = async () => {
    if (!currentDraftEntry) return;
    try {
      let currentData: any[] = [];
      let sheetType = activeTab;

      // Handle Transmission DB updates directly without using drafts
      if (activeTab === 'pss_transmission') {
        let subData: any[] = [];
        if (activeSubSheet === 'stringing') subData = stringingData;
        else if (activeSubSheet === 'erection') subData = erectionData;
        else subData = foundationData;

        // Find rows that were edited
        const deltaRows = subData.filter((row: any) => {
          if (row.isCategoryRow) return false;
          const hasMetadata = row._cellStatuses && Object.keys(row._cellStatuses).length > 0;
          return hasMetadata;
        });

        if (deltaRows.length === 0) {
          toast.warning("No changes detected.");
          return;
        }

        // Update each row individually (you'd probably batch this in a real scenario, but loop works for now)
        for (const row of deltaRows) {
          if (row.id) {
            // Pack everything back into extraData if needed, or just send the row.
            // Our custom_activities API expects { description, cumulative, extraData: {...} }
            const payload = {
              description: row.description || 'Transmission Row',
              cumulative: row.completed ? Number(row.completed) : undefined,
              extraData: { ...row } // Just dump the whole row into extraData
            };
            await updateCustomActivity(row.id, payload);
          }
        }
        
        toast.success(`Updated ${deltaRows.length} rows successfully!`);
        return;
      }

      switch (activeTab) {
        case 'pss_summary': currentData = pssSummaryData; break;
        case 'pss_civil_peb': currentData = civilPebData; break;
        case 'pss_electrical': currentData = electricalData; break;
        case 'pss_tl_visual': currentData = transmissionVisualData; break;
        case 'pss_manpower': currentData = pssManpowerData; break;
        case 'manpower_details_2': currentData = manpowerTimephasedData; break;
        default: return;
      }

      const deltaRows = currentData.filter((row: any) => {
        if (row.isCategoryRow) return false;
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

    const renderRejectedAlert = () => isRejected && rejectionReason ? (
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
      case 'pss_civil_peb':
        return (
          <>
            {renderRejectedAlert()}
            <PSSProgressTable
              data={civilPebData}
              setData={setCivilPebData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              title="PSS - Civil and PEB Sheet"
              sheetType="pss_civil_peb"
            />
          </>
        );
      case 'pss_electrical':
        return (
          <>
            {renderRejectedAlert()}
            <PSSProgressTable
              data={electricalData}
              setData={setElectricalData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              title="PSS - Electrical Sheet"
              sheetType="pss_electrical"
            />
          </>
        );
      case 'pss_tl_visual':
        return (
          <>
            {renderRejectedAlert()}
            <PSSTransmissionVisualTable
              data={transmissionVisualData}
              setData={setTransmissionVisualData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
            />
          </>
        );
      case 'pss_transmission':
        return (
          <>
            {renderRejectedAlert()}
            <PSSTransmissionTable
              stringingData={stringingData}
              setStringingData={setStringingData}
              erectionData={erectionData}
              setErectionData={setErectionData}
              foundationData={foundationData}
              setFoundationData={setFoundationData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              activeSubSheet={activeSubSheet}
              onSubSheetChange={setActiveSubSheet}
            />
          </>
        );
      case 'pss_manpower':
        return (
          <>
            {renderRejectedAlert()}
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
            {renderRejectedAlert()}
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
