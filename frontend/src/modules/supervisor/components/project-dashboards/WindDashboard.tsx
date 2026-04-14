import React, { useState, useEffect, useCallback, useMemo } from "react";
import { AlertCircle, Package } from "lucide-react";
import { toast } from "sonner";
import { 
  WindSummaryTable, 
  WindProgressTable, 
  WindManpowerTable 
} from "../index";
import { getWindProgressActivities, getManpowerDetailsData } from "@/services/p6ActivityService";
import { saveDraftEntry, submitEntry, getDraftEntry, pushEntryToP6 } from "@/services/dprService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/modules/auth/contexts/AuthContext";

interface WindDashboardProps {
  projectId: number;
  targetDate: string;
  targetYesterday: string;
  activeTab: string;
  currentDraftEntry: any;
  onDraftUpdate: (draft: any) => void;
  isEntryReadOnly: boolean;
  projectName: string;
  selectedSubstation: string;
  selectedLocation: string;
  selectedActivityGroup: string;
  onFiltersLoaded?: (filters: { locations: string[]; substations: string[]; activityGroups: string[]; }) => void;
}

export const WindDashboard: React.FC<WindDashboardProps> = ({
  projectId,
  targetDate,
  targetYesterday,
  activeTab,
  currentDraftEntry,
  onDraftUpdate,
  isEntryReadOnly,
  projectName,
  selectedSubstation,
  selectedLocation,
  selectedActivityGroup,
  onFiltersLoaded
}) => {
  const [windProgressData, setWindProgressData] = useState<any[]>([]);
  const [windSummaryData, setWindSummaryData] = useState<any[]>([]);
  const [windManpowerData, setWindManpowerData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState("ALL");

  const extractActivityBaseWind = useCallback((desc: string) => {
    if (!desc) return "";
    // Matches patterns like "WTG1-CW-Stone Column" -> "Stone Column"
    const match = desc.match(/^(?:WTG\d+|[A-Z\d]+)-(?:CW|EL|TC|ER|PSS|USS|TC|ELE|ERE|ERECTION|COMM)[-_](.+)$/i) ||
                  desc.match(/^(?:WTG\d+|[A-Z\d]+)[-_](.+)$/i);
    return (match ? match[1] : desc).replace(/_/g, ' ').trim();
  }, []);

  const fetchWindActivities = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const response = await getWindProgressActivities(projectId, targetDate);
      let dataArray = Array.isArray(response.data) ? response.data : [];
      
      // Enhance data with SPV, Location, and Feeder
      const spv = projectName.match(/^[A-Z0-9]+/i)?.[0] || "";
      
      // First pass: Identify all rows that explicitly mention a WTG or Substation
      const explicitWtgs: string[] = [];
      const explicitSubstations: string[] = [];

      dataArray.forEach((row: any) => {
        // WTG Detection
        const wtgMatch = row.description?.match(/(WTG\d+)/i);
        explicitWtgs.push(wtgMatch ? wtgMatch[1].toUpperCase() : "");

        // Substation Detection (PSS-XX pattern)
        const pssMatch = (row.description + " " + row.activityId + " " + (row.wbsName || "")).match(/(PSS-?\d+)/i);
        explicitSubstations.push(pssMatch ? pssMatch[1].toUpperCase() : "");
      });

      // Bi-directional propagation to fill gaps
      const rowWtgs = [...explicitWtgs];
      const rowSubstations = [...explicitSubstations];

      // 1. Forward fill
      let lastWtg = "";
      let lastPss = "";
      for (let i = 0; i < dataArray.length; i++) {
        if (explicitWtgs[i]) lastWtg = explicitWtgs[i];
        else rowWtgs[i] = lastWtg;

        if (explicitSubstations[i]) lastPss = explicitSubstations[i];
        else rowSubstations[i] = lastPss;
      }
      // 2. Backward fill
      let nextWtg = "";
      let nextPss = "";
      for (let i = dataArray.length - 1; i >= 0; i--) {
        if (explicitWtgs[i]) nextWtg = explicitWtgs[i];
        else if (!rowWtgs[i]) rowWtgs[i] = nextWtg;

        if (explicitSubstations[i]) nextPss = explicitSubstations[i];
        else if (!rowSubstations[i]) rowSubstations[i] = nextPss;
      }

      // Second pass: Find feeders per WTG group
      const wtgFeeders: Record<string, string> = {};
      dataArray.forEach((row: any, idx: number) => {
        const wtg = rowWtgs[idx];
        if (wtg) {
          const desc = (row.description || "").toUpperCase();
          if (desc.includes("FEEDER CHARGING") || desc.includes("(F-")) {
            const feederMatch = row.description?.match(/\((F-?[^)]+)\)/i);
            if (feederMatch) {
              wtgFeeders[wtg] = feederMatch[1].toUpperCase();
            }
          }
        }
      });

      // Third pass: Apply enhancements to every row
      const enhancedData = dataArray.map((row: any, idx: number) => {
        const newRow = { ...row };
        const wtg = rowWtgs[idx];
        const pss = rowSubstations[idx];
        
        newRow.spv = spv;

        if (wtg) {
          newRow.locations = wtg;
          newRow.feeder = wtgFeeders[wtg] || "";
        }
        
        if (pss) {
          newRow.substation = pss;
        }

        if (newRow.isCategoryRow) {
           newRow.locations = newRow.description;
        }

        return newRow;
      });

      setWindProgressData(enhancedData);
      
      const manpowerData = await getManpowerDetailsData(projectId);
      setWindManpowerData(manpowerData);
    } catch (error) {
      console.error("Failed to load wind activities:", error);
      toast.error("Failed to load wind activities");
    } finally {
      setLoading(false);
    }
  }, [projectId, targetDate, projectName]);

  useEffect(() => {
    fetchWindActivities();
  }, [fetchWindActivities]);

  // Sync available filters back up to parent
  useEffect(() => {
    if (onFiltersLoaded && windProgressData.length > 0) {
      const locs = new Set<string>();
      const subs = new Set<string>();
      const grps = new Set<string>();
      
      locs.add("ALL");
      subs.add("ALL");
      grps.add("ALL");

      windProgressData.forEach(row => {
        if (row.locations && !row.isCategoryRow) locs.add(row.locations.toUpperCase());
        if (row.substation) subs.add(row.substation.toUpperCase());
        if (row.activityGroup) grps.add(row.activityGroup.toUpperCase());
      });

      onFiltersLoaded({
        locations: Array.from(locs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        substations: Array.from(subs).sort(),
        activityGroups: Array.from(grps).sort()
      });
    }
  }, [windProgressData, onFiltersLoaded]);

  const derivedWindSummaryData = useMemo(() => {
    if (!Array.isArray(windProgressData) || windProgressData.length === 0) return [];

    const masterGroups = [
      {
        name: 'CIVIL WORKS',
        color: '#D1E9FF',
        activities: [
          'Stone column', 'Approach Road', 'Excavation', 'PCC', 'Steel Binding',
          'Raft Casting', 'Grouting', 'WTG earthing', 'Curing', 'Ready for Excavation',
          'USS precast Installation', 'Road Construction ( For WTG Erection)', 'Crane pad Construction'
        ]
      },
      {
        name: 'WTG ERECTION WORKS',
        color: '#F0D1FF',
        activities: ['WTG Erection', 'WTG MCC', 'WTG Pre-commissioning']
      },
      {
        name: 'ELECTRICAL WORKS',
        color: '#FFF4D1',
        activities: ['HT Cable Laying & Termination', 'USS Erection', 'USS Earthing', 'USS Testing', 'USS CFT']
      },
      {
        name: 'TESTING & COMMISSIONING',
        color: '#D1FFD7',
        activities: [
          'CEIG Approval', 'FTC Approval', 'Feeder charging', 'USS charging',
          'WTG Commissioning', 'WTG Trial Run', 'WTG SCOD'
        ]
      }
    ];

    const stats: Record<string, any> = {};

    const parseDateHelper = (dStr: string) => {
      if (!dStr || dStr === '-' || dStr === '0') return null;
      const parts = dStr.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) return new Date(dStr);
        const day = parseInt(parts[0]);
        const mStr = parts[1];
        const yrShort = parseInt(parts[2]);
        const mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const mIdx = mNames.indexOf(mStr);
        if (mIdx !== -1) {
          const yr = yrShort + (yrShort < 70 ? 2000 : 1900);
          return new Date(yr, mIdx, day);
        }
      }
      return null;
    };

    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    windProgressData.forEach(p => {
      const baseRaw = extractActivityBaseWind(p.description);
      const base = baseRaw.toLowerCase().trim().replace(/[-_]/g, ' ');

      let matchedName = '';
      for (const group of masterGroups) {
        const found = group.activities.find(act => {
          const m = act.toLowerCase().trim();
          return base === m || base.includes(m) || m.includes(base);
        });
        if (found) {
          matchedName = found;
          break;
        }
      }

      if (matchedName) {
        if (!stats[matchedName]) {
          stats[matchedName] = { scope: 0, achieved: 0, weeklyPlan: 0, weeklyAchieved: 0, monthlyPlan: 0, monthlyAchieved: 0 };
        }
        const s = stats[matchedName];
        s.scope += 1;
        const isDone = p.status === 'Completed' || p.completionPercentage === '100' || Number(p.completed) >= Number(p.scope);
        if (isDone) s.achieved += 1;
        
        const fDate = parseDateHelper(p.forecastFinish || p.baselineFinish);
        const aDate = parseDateHelper(p.actualFinish);

        if (fDate && fDate >= startOfWeek && fDate <= endOfWeek) s.weeklyPlan += 1;
        if (aDate && aDate >= startOfWeek && aDate <= endOfWeek) s.weeklyAchieved += 1;
        if (fDate && fDate >= startOfMonth) s.monthlyPlan += 1;
        if (aDate && aDate >= startOfMonth) s.monthlyAchieved += 1;
      }
    });

    const finalResult: any[] = [];
    masterGroups.forEach(g => {
      finalResult.push({ isCategoryRow: true, description: g.name, backgroundColor: g.color });
      g.activities.forEach(actName => {
        const s = stats[actName] || { scope: 0, achieved: 0, weeklyPlan: 0, weeklyAchieved: 0, monthlyPlan: 0, monthlyAchieved: 0 };
        finalResult.push({
          description: actName,
          scope: String(s.scope),
          achieved: String(s.achieved),
          balance: String(Math.max(0, s.scope - s.achieved)),
          weeklyPlan: String(s.weeklyPlan),
          weeklyAchieved: String(s.weeklyAchieved),
          weeklyBalance: String(Math.max(0, s.weeklyPlan - s.weeklyAchieved)),
          cumulativePlan: String(s.monthlyPlan),
          cumulativeAchieved: String(s.monthlyAchieved),
          cumulativeBalance: String(Math.max(0, s.monthlyPlan - s.monthlyAchieved)),
        });
      });
    });
    return finalResult;
  }, [windProgressData, extractActivityBaseWind]);

  // Sync summary data with derived data if empty
  useEffect(() => {
    if (activeTab === 'wind_summary' && windSummaryData.length === 0 && derivedWindSummaryData.length > 0) {
      setWindSummaryData(derivedWindSummaryData);
    }
  }, [activeTab, windSummaryData.length, derivedWindSummaryData]);

  const handleSaveEntry = async () => {
    if (!currentDraftEntry) return;
    try {
      let currentData: any[] = [];
      switch (activeTab) {
        case 'wind_summary': currentData = windSummaryData; break;
        case 'wind_progress': currentData = windProgressData; break;
        case 'wind_manpower': currentData = windManpowerData; break;
        default: return;
      }

      const deltaRows = currentData.filter((row: any) => {
        if (row.isCategoryRow) return false;
        
        // Use cell metadata (highlights/edits) as the primary indicator for delta tracking
        const hasMetadata = row._cellStatuses && Object.keys(row._cellStatuses).length > 0;
        if (hasMetadata) return true;
        
        // Manual override for specific fields if needed
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
      case 'wind_summary':
        return (
          <WindSummaryTable
            data={windSummaryData}
            setData={setWindSummaryData}
            onSave={isEntryReadOnly ? undefined : handleSaveEntry}
            onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
            isLocked={isEntryReadOnly}
            status={entryStatus}
            projectId={projectId}
          />
        );
      case 'wind_progress':
        return (
          <>
            <RejectedAlert />
            <WindProgressTable
              data={windProgressData}
              setData={setWindProgressData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
              yesterday={targetYesterday}
              today={targetDate}
              isLocked={isEntryReadOnly}
              status={entryStatus}
              projectId={projectId}
              selectedSubstation={selectedSubstation}
              selectedLocation={selectedLocation}
              selectedActivityGroup={selectedActivityGroup}
              selectedActivity={selectedActivity}
            />
          </>
        );
      case 'wind_manpower':
        return (
          <>
            <RejectedAlert />
            <WindManpowerTable
              data={windManpowerData}
              setData={setWindManpowerData}
              onSave={isEntryReadOnly ? undefined : handleSaveEntry}
              onSubmit={isEntryReadOnly ? undefined : handleSubmitEntry}
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
        {loading && !windProgressData.length ? (
          <div className="flex flex-col items-center justify-center p-12">
            <Package className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <p className="text-muted-foreground">Loading Wind Progress...</p>
          </div>
        ) : (
          renderActiveTable()
        )}
      </div>
    </div>
  );
};
