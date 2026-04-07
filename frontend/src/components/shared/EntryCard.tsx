import React from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import {
  Edit,
  Check,
  X,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Upload,
  Send
} from "lucide-react";

interface EntryCardProps {
  entry: any;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onViewDetails?: () => void;
  onPushToP6?: () => void;
  onSendToPMAG?: () => void;
  sheetType: string;
  showPushToP6?: boolean;
  showSendToPMAG?: boolean;
  projects?: any[];
}

export const EntryCard: React.FC<EntryCardProps> = ({
  entry,
  isExpanded,
  onToggleExpand,
  onEdit,
  onApprove,
  onReject,
  onViewDetails,
  onPushToP6,
  onSendToPMAG,
  sheetType,
  showPushToP6 = false,
  showSendToPMAG = false,
  projects = []
}) => {
  const getStatusVariant = (status: string) => {
    switch (status) {
      case "submitted_to_pm": return "secondary";
      case "approved_by_pm": return "default";
      case "rejected_by_pm": return "destructive";
      case "final_approved": return "default";
      default: return "secondary";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "submitted_to_pm": return "Pending";
      case "approved_by_pm": return "PM Approved";
      case "rejected_by_pm": return "Rejected";
      case "final_approved": return "Pushed";
      default: return status?.replace(/_/g, ' ');
    }
  };

  // Parse entry data
  const entryData = entry.data_json
    ? (typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json)
    : null;

  // Prepare data for StyledExcelTable with proper columns for each sheet type
  const prepareTableData = () => {
    const rows = Array.isArray(entryData?.rows) ? entryData.rows : [];
    if (rows.length === 0 || !rows[0]) {
      return { columns: [], data: [] };
    }

    let columns: string[] = [];
    let fieldMap: string[] = [];

    const formatDateStr = (dateStr: string) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
      }
      return dateStr;
    };

    let todayLabel = "Today";
    let yesterdayLabel = "Yesterday";
    if (entryData?.staticHeader?.progressDate) {
      const td = new Date(entryData.staticHeader.progressDate);
      const yd = new Date(td.getTime() - 86400000);
      todayLabel = formatDateStr(entryData.staticHeader.progressDate);
      yesterdayLabel = formatDateStr(yd.toISOString().split('T')[0]);
    }

    // Define columns based on sheetType to match Supervisor/SitePM view
    switch (sheetType) {
      case 'dp_qty':
        columns = ["Sl No", "Activity ID", "Description", "UOM", "Scope", "Completed", "Balance", "Baseline Start", "Baseline Finish", "Forecast Start", "Forecast Finish", yesterdayLabel, todayLabel];
        fieldMap = ["slNo", "activityId", "description", "uom", "totalQuantity", "cumulative", "balance", "basePlanStart", "basePlanFinish", "forecastStart", "forecastFinish", "yesterdayValue", "todayValue"];
        break;
      case 'dp_vendor_block':
      case 'dp_vendor_idt':
      case 'testing_commissioning':
        columns = ["Activity ID", "Description", "Block", "Priority", "Contractor Name", "UOM", "Scope", "Completed", "Balance", "Baseline Start", "Baseline Finish", "Actual/Forecast Start", "Actual/Forecast Finish", yesterdayLabel, todayLabel];
        fieldMap = ["activityId", "description", "block", "priority", "contractorName", "uom", "scope", "actual", "balance", "basePlanStart", "basePlanFinish", "actualStart", "actualFinish", "yesterdayValue", "todayValue"];
        break;
      case 'dp_block':
        columns = ["Sl No", "Activity ID", "Description", "Block", "Phase", "SPV Number", "Scope", "Completed", "Balance", "Baseline Start", "Baseline Finish", "Actual Start", "Actual Finish"];
        fieldMap = ["slNo", "activityId", "description", "block", "phase", "spvNumber", "totalQuantity", "cumulative", "balance", "basePlanStart", "basePlanFinish", "actualStart", "actualFinish"];
        break;
      case 'manpower_details':
        columns = ["Sl No", "Activity ID", "Activity", "Block", "Contractor Name", yesterdayLabel, todayLabel];
        fieldMap = ["slNo", "activityId", "activity", "block", "contractorName", "yesterdayValue", "todayValue"];
        break;
      default:
        // Fallback to automatic column discovery if type is unknown
        columns = Object.keys(rows[0]);
        fieldMap = columns;
    }

    // Convert rows to array format for StyledExcelTable
    const data = rows.map((row: any) =>
      fieldMap.map((field) => {
        if (!row) return '';
        
        // Handle fallback logic identically to the Supervisor tables
        if (field === 'actualStart') return row.actualStart || row.forecastStart || '';
        if (field === 'actualFinish') return row.actualFinish || row.forecastFinish || '';
        if (field === 'basePlanStart') return row.bl4Start || row.bl3Start || row.bl2Start || row.bl1Start || row.basePlanStart || '';
        if (field === 'basePlanFinish') return row.bl4Finish || row.bl3Finish || row.bl2Finish || row.bl1Finish || row.basePlanFinish || '';
        if (field === 'block') return row.newBlockNom || row.block || '';
        
        const val = row[field];
        return val !== undefined && val !== null ? String(val) : '';
      })
    );

    return { columns, data };
  };

  const { columns: tableColumns, data: tableData } = prepareTableData();

  return (
    <motion.div
      key={entry.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 bg-white dark:bg-gray-800"
    >
      {/* Collapsible Entry Header */}
      <motion.div
        className="flex flex-col md:flex-row md:items-center justify-between p-4 cursor-pointer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        onClick={onToggleExpand}
      >
        <div className="flex items-start space-x-3 w-full">
          <div className="flex-1 min-w-0">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div className="flex items-center space-x-2">
                <span className="font-semibold">Entry #{entry.id}</span>
                <Badge
                  variant={getStatusVariant(entry.status)}
                  className="px-2 py-0.5 text-xs font-medium"
                >
                  {getStatusText(entry.status)}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground mt-1 md:mt-0">
                {new Date(entry.submitted_at || entry.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:space-x-4 mt-1">
              <span className="text-sm text-muted-foreground truncate">
                {entry.supervisor_name || 'Supervisor'} ({entry.supervisor_email || entry.user_email || 'N/A'})
              </span>
              <span className="text-xs font-medium text-primary hidden md:block">
                Project: {projects?.find(p => String(p.id) === String(entry.project_id) || String(p.ObjectId) === String(entry.project_id))?.name || `ID: ${entry.project_id}`}
              </span>
              <span className="text-xs text-muted-foreground mt-1 md:mt-0">
                {sheetType.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            {/* Action buttons based on status */}
            {entry.status === "submitted_to_pm" && (
              <>
                {onEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                    className="transition-colors duration-200 px-2 py-1 h-7"
                  >
                    <Edit className="w-3 h-3" />
                  </Button>
                )}
                {onApprove && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={(e) => {
                      e.stopPropagation();
                      onApprove();
                    }}
                    className="bg-green-600 hover:bg-green-700 transition-colors duration-200 px-2 py-1 h-7"
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                )}
                {onReject && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReject();
                    }}
                    className="transition-colors duration-200 px-2 py-1 h-7"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </>
            )}

            {/* Push to P6 button - Only button needed for PMAG */}
            {showPushToP6 && onPushToP6 && (entry.status === "final_approved" || entry.status === "approved_by_pm") && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onPushToP6();
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200 px-3 py-1 h-7"
              >
                <Upload className="w-3 h-3 mr-1" />
                Push to P6
              </Button>
            )}

            {isExpanded ? (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </motion.div>

      {/* Expanded Content with StyledExcelTable */}
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden border-t border-gray-200 dark:border-gray-700"
        >
          <div className="p-4 bg-gray-50 dark:bg-gray-700">
            {/* Entry Metadata */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
              <div>
                <p className="text-muted-foreground">Submitted</p>
                <p className="font-medium">{new Date(entry.submitted_at || entry.created_at).toLocaleString()}</p>
              </div>
              {entry.approved_at && (
                <div>
                  <p className="text-muted-foreground">Approved</p>
                  <p className="font-medium">{new Date(entry.approved_at).toLocaleString()}</p>
                </div>
              )}
              {entry.project_name && (
                <div>
                  <p className="text-muted-foreground">Project</p>
                  <p className="font-medium">{entry.project_name}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Sheet Type</p>
                <p className="font-medium">{sheetType.replace(/_/g, ' ')}</p>
              </div>
            </div>

            {/* Static Header */}
            {entryData?.staticHeader && (
              <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded mb-4 border border-blue-200 dark:border-blue-800">
                <h4 className="font-semibold mb-2 text-sm">Header Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                  {entryData.staticHeader.projectInfo && (
                    <p><strong>Project:</strong> {entryData.staticHeader.projectInfo}</p>
                  )}
                  {entryData.staticHeader.reportingDate && (
                    <p><strong>Reporting Date:</strong> {entryData.staticHeader.reportingDate}</p>
                  )}
                  {entryData.staticHeader.progressDate && (
                    <p><strong>Progress Date:</strong> {entryData.staticHeader.progressDate}</p>
                  )}
                </div>
              </div>
            )}

            {/* Data Table using StyledExcelTable */}
            {tableColumns.length > 0 && tableData.length > 0 && (
              <div className="mb-4">
                <StyledExcelTable
                  title={`${sheetType.replace(/_/g, ' ')} - Entry #${entry.id}`}
                  columns={tableColumns}
                  data={tableData}
                  onDataChange={() => { } } // No-op since it's read-only
                  isReadOnly={true}
                  hideAddRow={true}
                  status={entry.status} onSave={undefined} onSubmit={undefined} onExportAll={undefined} totalRows={undefined} onFullscreenToggle={undefined} />
              </div>
            )}

            {/* Total Manpower (if applicable) */}
            {entryData?.totalManpower !== undefined && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/30 rounded border border-green-200 dark:border-green-800">
                <p className="text-sm font-semibold">Total Manpower: {entryData.totalManpower}</p>
              </div>
            )}

            {/* No Data Message */}
            {(!entryData?.rows || entryData.rows.length === 0) && !entryData?.staticHeader && (
              <div className="text-center py-4 text-muted-foreground">
                <p>No detailed data available for this entry</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
              {onViewDetails && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onViewDetails}
                >
                  View Full Details
                </Button>
              )}
              {showPushToP6 && onPushToP6 && (entry.status === "final_approved" || entry.status === "approved_by_pm") && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={onPushToP6}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Push to P6
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};