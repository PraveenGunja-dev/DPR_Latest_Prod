import React from "react";
import { Button } from "@/components/ui/button";
import { Minimize } from "lucide-react";
import { 
  DPQtyTable,
  DPVendorBlockTable,
  ManpowerDetailsTable,
  DPBlockTable,
  DPVendorIdtTable,
  MmsModuleRfiTable
} from "@/modules/supervisor/components";
import { getTodayAndYesterday } from "@/modules/auth/services/dprSupervisorService";

interface PMFullscreenViewProps {
  isFullscreen: boolean;
  activeTab: string;
  expandedEntries: Record<number, boolean>;
  submittedEntries: any[];
  onUpdateEntry: (entryId: number, data: any) => void;
  onSaveEntry: (entryId: number, data: any) => void;
  onClose: () => void;
}

export const PMFullscreenView: React.FC<PMFullscreenViewProps> = ({
  isFullscreen,
  activeTab,
  expandedEntries,
  submittedEntries,
  onUpdateEntry,
  onSaveEntry,
  onClose
}) => {
  if (!isFullscreen) return null;
  
  // Find the currently expanded entry
  const expandedEntryId = Object.keys(expandedEntries).find(id => expandedEntries[Number(id)]);
  if (!expandedEntryId) return null;
  
  const entry = submittedEntries.find(e => e.id === Number(expandedEntryId));
  if (!entry) return null;
  
  const entryData = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
  const { today, yesterday } = getTodayAndYesterday();
  const isLocked = entry.status !== 'submitted_to_pm';
  
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 p-4 md:p-6 overflow-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 p-2 border-b dark:border-gray-700">
        <h3 className="text-lg font-semibold">Fullscreen View - Entry #{entry.id}</h3>
        <Button 
          onClick={onClose}
          variant="outline"
          size="sm"
        >
          <Minimize className="w-4 h-4 mr-1" />
          Exit Fullscreen
        </Button>
      </div>
      
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-4 border dark:border-gray-700">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm font-medium">Entry ID</p>
            <p className="text-sm">#{entry.id}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Submitted By</p>
            <p className="text-sm">{entry.supervisor_name || 'Supervisor'} ({entry.supervisor_email})</p>
          </div>
          <div>
            <p className="text-sm font-medium">Submitted At</p>
            <p className="text-sm">{new Date(entry.submitted_at).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Sheet Type</p>
            <p className="text-sm">{entry.sheet_type.replace(/_/g, ' ')}</p>
          </div>
        </div>
      </div>
      
      {entryData?.staticHeader && (
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-4 border border-blue-100 dark:border-blue-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm font-medium">Project</p>
              <p className="text-sm">{entryData.staticHeader.projectInfo}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Reporting Date</p>
              <p className="text-sm">{entryData.staticHeader.reportingDate}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Progress Date</p>
              <p className="text-sm">{entryData.staticHeader.progressDate}</p>
            </div>
          </div>
        </div>
      )}
      
      {entryData?.rows && entryData.rows.length > 0 && (
        <div className="overflow-auto max-h-[calc(100vh-300px)]">
          {activeTab === 'dp_qty' && (
            <DPQtyTable 
              data={entryData.rows} 
              setData={(data) => onUpdateEntry(entry.id, { ...entryData, rows: data })}
              onSave={() => onSaveEntry(entry.id, entryData)}
              onSubmit={() => onSaveEntry(entry.id, entryData)}
              yesterday={entryData.staticHeader?.progressDate || yesterday}
              today={entryData.staticHeader?.reportingDate || today}
              isLocked={isLocked}
              status={entry.status}

            />
          )}
          
          {activeTab === 'dp_block' && (
            <DPBlockTable 
              data={entryData.rows} 
              setData={(data) => onUpdateEntry(entry.id, { ...entryData, rows: data })}
              onSave={() => onSaveEntry(entry.id, entryData)}
              onSubmit={() => onSaveEntry(entry.id, entryData)}
              yesterday={entryData.staticHeader?.progressDate || yesterday}
              today={entryData.staticHeader?.reportingDate || today}
              isLocked={isLocked}
              status={entry.status}

            />
          )}
          
          {activeTab === 'dp_vendor_idt' && (
            <DPVendorIdtTable 
              data={entryData.rows} 
              setData={(data) => onUpdateEntry(entry.id, { ...entryData, rows: data })}
              onSave={() => onSaveEntry(entry.id, entryData)}
              onSubmit={() => onSaveEntry(entry.id, entryData)}
              yesterday={entryData.staticHeader?.progressDate || yesterday}
              today={entryData.staticHeader?.reportingDate || today}
              isLocked={isLocked}
              status={entry.status}

            />
          )}
          
          {activeTab === 'dp_vendor_block' && (
            <DPVendorBlockTable 
              data={entryData.rows} 
              setData={(data) => onUpdateEntry(entry.id, { ...entryData, rows: data })}
              onSave={() => onSaveEntry(entry.id, entryData)}
              onSubmit={() => onSaveEntry(entry.id, entryData)}
              yesterday={entryData.staticHeader?.progressDate || yesterday}
              today={entryData.staticHeader?.reportingDate || today}
              isLocked={isLocked}
              status={entry.status}

            />
          )}
          
          {activeTab === 'manpower_details' && (
            <ManpowerDetailsTable 
              data={entryData.rows} 
              setData={(data) => onUpdateEntry(entry.id, { ...entryData, rows: data })}
              totalManpower={entryData.totalManpower || 0}
              setTotalManpower={(total) => onUpdateEntry(entry.id, { ...entryData, totalManpower: total })}
              onSave={() => onSaveEntry(entry.id, entryData)}
              onSubmit={() => onSaveEntry(entry.id, entryData)}
              yesterday={entryData.staticHeader?.progressDate || yesterday}
              today={entryData.staticHeader?.reportingDate || today}
              isLocked={isLocked}
              status={entry.status}

            />
          )}
          
          {activeTab === 'mms_module_rfi' && (
            <MmsModuleRfiTable 
              data={entryData.rows} 
              setData={(data) => onUpdateEntry(entry.id, { ...entryData, rows: data })}
              onSave={() => onSaveEntry(entry.id, entryData)}
              onSubmit={() => onSaveEntry(entry.id, entryData)}
              yesterday={entryData.staticHeader?.progressDate || yesterday}
              today={entryData.staticHeader?.reportingDate || today}
              isLocked={isLocked}
              status={entry.status}

            />
          )}
        </div>
      )}
    </div>
  );
};
