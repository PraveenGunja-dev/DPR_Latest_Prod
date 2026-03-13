import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Check,
  X,
  Edit,
  Clock,
  AlertCircle,
  CheckCircle,
  FileCheck,
  Calendar,
  User,
  Maximize,
  Minimize,
  FileSpreadsheet,
  Grid3X3,
  Wrench,
  Building,
  Package,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DPQtyTable,
  DPVendorBlockTable,
  ManpowerDetailsTable,
  DPBlockTable,
  DPVendorIdtTable,
  MmsModuleRfiTable
} from "@/modules/supervisor/components";
import { getTodayAndYesterday } from "@/modules/auth/services/dprSupervisorService";
import { StyledExcelTable } from "@/components/StyledExcelTable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CommentPopover } from "@/components/cellComments";
import { useCellComments } from "@/hooks/useCellComments";
import { useAuth } from "@/modules/auth/contexts/AuthContext";
import { toast } from "sonner";
import { hasRejectionComments } from "@/services/cellCommentsService";

interface PMSheetEntriesProps {
  submittedEntries: any[];
  loading: boolean;
  onRefresh: () => void;
  onApprove: (entryId: number) => void;
  onReject: (entryId: number, sheetType: string) => void;
  onEditEntry: (entry: any) => void;
  onUpdateEntry: (entryId: number, data: any) => void;
  onSaveEntry: (entryId: number, data: any) => void;
  activeTab: string;
  onTabChange: (value: string) => void;
  expandedEntries: Record<number, boolean>;
  setExpandedEntries: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  isFullscreen: boolean;
  setIsFullscreen: React.Dispatch<React.SetStateAction<boolean>>;
  editingEntry: any;
  setEditingEntry: React.Dispatch<React.SetStateAction<any>>;
  editData: any;
  setEditData: React.Dispatch<React.SetStateAction<any>>;
}

export const PMSheetEntries: React.FC<PMSheetEntriesProps> = ({
  submittedEntries,
  loading,
  onRefresh,
  onApprove,
  onReject,
  onEditEntry,
  onUpdateEntry,
  onSaveEntry,
  activeTab,
  onTabChange,
  expandedEntries,
  setExpandedEntries,
  isFullscreen,
  setIsFullscreen,
  editingEntry,
  setEditingEntry,
  editData,
  setEditData
}) => {
  // Get current user info for comments
  const { user } = useAuth();

  // Comment popover state
  const [commentPopover, setCommentPopover] = useState<{
    isOpen: boolean;
    sheetId: number;
    rowIndex: number;
    columnKey: string;
    columnLabel: string;
  } | null>(null);

  // Sheet types with counts
  const sheetTypes = [
    { value: 'dp_qty', label: 'DP Qty', icon: FileSpreadsheet },
    { value: 'dp_block', label: 'DP Block', icon: Grid3X3 },
    { value: 'dp_vendor_idt', label: 'DP Vendor IDT', icon: Wrench },
    { value: 'mms_module_rfi', label: 'MMS & Module RFI', icon: Building },
    { value: 'dp_vendor_block', label: 'DP Vendor Block', icon: Package },
    { value: 'manpower_details', label: 'Manpower Details', icon: User },
  ];

  // Open comment popover for a cell
  const openCommentPopover = (sheetId: number, rowIndex: number, columnKey: string, columnLabel: string) => {
    setCommentPopover({ isOpen: true, sheetId, rowIndex, columnKey, columnLabel });
  };

  // Close comment popover
  const closeCommentPopover = () => {
    setCommentPopover(null);
  };

  // Filter entries by sheet type - ONLY SHOW SUBMITTED ENTRIES
  const getEntriesBySheetType = (sheetType: string) => {
    return submittedEntries.filter(entry =>
      entry.sheet_type === sheetType &&
      entry.status === 'submitted_to_pm'
    );
  };

  // Toggle entry expansion
  const toggleEntryExpansion = (entryId: number) => {
    setExpandedEntries(prev => ({
      ...prev,
      [entryId]: !prev[entryId]
    }));
  };

  // Toggle fullscreen mode
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Close fullscreen mode
  const closeFullscreen = () => {
    setIsFullscreen(false);
  };

  // Render sheet entries for a specific sheet type
  const renderSheetEntries = (sheetType: string) => {
    const entries = getEntriesBySheetType(sheetType);

    if (entries.length === 0) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center py-8 text-muted-foreground"
        >
          <FileText className="mx-auto h-12 w-12 opacity-50" />
          <p className="mt-2">No {sheetType.replace(/_/g, ' ')} sheets submitted yet</p>
        </motion.div>
      );
    }

    return (
      <div className="space-y-4">
        {entries.map((entry, entryIndex) => {
          const entryData = typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json;
          const { today, yesterday } = getTodayAndYesterday();

          // Determine if entry is locked (submitted or approved)
          const isLocked = entry.status !== 'submitted_to_pm';

          // Check if entry is expanded
          const isExpanded = expandedEntries[entry.id] || false;

          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: entryIndex * 0.1 }}
              className="border rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 bg-white dark:bg-gray-800"
            >
              {/* Collapsible Entry Header */}
              <motion.div
                className="flex flex-col md:flex-row md:items-center justify-between p-3 cursor-pointer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: entryIndex * 0.1 + 0.1 }}
                onClick={() => toggleEntryExpansion(entry.id)}
              >
                <div className="flex items-start space-x-3 w-full">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold">Entry #{entry.id}</span>
                        <Badge
                          variant={
                            entry.status === "submitted_to_pm" ? "secondary" :
                              entry.status === "approved_by_pm" ? "default" :
                                "destructive"
                          }
                          className="px-2 py-0.5 text-xs font-medium"
                        >
                          {entry.status === "submitted_to_pm" ? "Pending" :
                            entry.status === "approved_by_pm" ? "Approved" :
                              "Rejected"}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground mt-1 md:mt-0">
                        {new Date(entry.submitted_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center md:space-x-4 mt-1">
                      <span className="text-sm text-muted-foreground truncate">
                        {entry.supervisor_name || 'Supervisor'} ({entry.supervisor_email})
                      </span>
                      <span className="text-xs font-medium text-primary hidden md:block">
                        Project ID: {entry.project_id}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1 md:mt-0">
                        {sheetType.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {entry.status === "submitted_to_pm" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditEntry(entry);
                          }}
                          className="transition-colors duration-200 px-3 py-1 h-8 flex items-center gap-1"
                        >
                          <Edit className="w-4 h-4" />
                          <span>Edit</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Open comment popover for first row, ask user to select a cell
                            openCommentPopover(entry.id, 0, 'general', 'Add Rejection Comment');
                          }}
                          className="transition-colors duration-200 px-3 py-1 h-8 flex items-center gap-1 border-orange-300 text-orange-600 hover:bg-orange-50"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span>Comment</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={(e) => {
                            e.stopPropagation();
                            onApprove(entry.id);
                          }}
                          className="bg-green-600 hover:bg-green-700 transition-colors duration-200 px-3 py-1 h-8 flex items-center gap-1"
                        >
                          <Check className="w-4 h-4" />
                          <span>Approve</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={async (e) => {
                            e.stopPropagation();
                            // Check if there are rejection comments before allowing reject
                            try {
                              const result = await hasRejectionComments(entry.id);
                              if (!result.hasRejectionComments) {
                                toast.error('Please add rejection comments on cells before rejecting this sheet');
                                openCommentPopover(entry.id, 0, 'general', 'Add Rejection Comment');
                                return;
                              }
                              onReject(entry.id, sheetType);
                            } catch (error) {
                              // If API fails, proceed with reject (backend will validate)
                              onReject(entry.id, sheetType);
                            }
                          }}
                          className="transition-colors duration-200 px-3 py-1 h-8 flex items-center gap-1"
                        >
                          <X className="w-4 h-4" />
                          <span>Reject</span>
                        </Button>
                      </>
                    )}
                    {entry.status === "approved_by_pm" && (
                      <Badge variant="outline" className="text-green-600 border-green-600 px-3 py-1 text-xs font-medium flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        <span>Sent to PMAG</span>
                      </Badge>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Expanded Content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden border-t border-gray-200 dark:border-gray-700"
                  >
                    <div className="p-3 bg-gray-50 dark:bg-gray-700">
                      {/* Sheet Information */}
                      {entryData?.staticHeader && (
                        <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded mb-3 border border-blue-100 dark:border-blue-800">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <p className="text-sm"><strong>Project:</strong> {entryData.staticHeader.projectInfo}</p>
                            <p className="text-sm"><strong>Reporting Date:</strong> {entryData.staticHeader.reportingDate}</p>
                            <p className="text-sm"><strong>Progress Date:</strong> {entryData.staticHeader.progressDate}</p>
                          </div>
                        </div>
                      )}

                      {/* Data Table - Using the same components as Supervisor Dashboard */}
                      {entryData?.rows && entryData.rows.length > 0 && (
                        <div className="mb-3">
                          <div className={isFullscreen ? 'overflow-auto max-h-[calc(100vh-120px)]' : ''}>
                            {/* Render the appropriate table component based on sheet type */}
                            {sheetType === 'dp_qty' && (
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

                            {sheetType === 'dp_block' && (
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

                            {sheetType === 'dp_vendor_idt' && (
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

                            {sheetType === 'dp_vendor_block' && (
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

                            {sheetType === 'manpower_details' && (
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

                            {sheetType === 'mms_module_rfi' && (
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

                            {/* Fallback for unknown sheet types */}
                            {!['dp_qty', 'dp_block', 'dp_vendor_idt', 'dp_vendor_block', 'manpower_details', 'mms_module_rfi'].includes(sheetType) && (
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse min-w-full">
                                  <thead>
                                    <tr className="bg-gray-100 sticky top-0 z-10">
                                      {Object.keys(entryData.rows[0]).map((key) => (
                                        <th key={key} className="border border-gray-300 p-2 text-left text-xs font-semibold whitespace-nowrap bg-gray-50">
                                          {key.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {entryData.rows.map((row: any, rowIndex: number) => (
                                      <motion.tr
                                        key={rowIndex}
                                        className="hover:bg-gray-50 transition-colors duration-150 border-b border-gray-100"
                                        initial={{ opacity: 0, x: -5 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: entryIndex * 0.1 + 0.4 + rowIndex * 0.05 }}
                                        whileHover={{ backgroundColor: '#f9fafb' }}
                                      >
                                        {Object.values(row).map((value: any, colIndex: number) => (
                                          <td key={`${rowIndex}-${colIndex}`} className="border border-gray-300 p-2 text-sm align-top">
                                            {value || '-'}
                                          </td>
                                        ))}
                                      </motion.tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {entryData.rows.length > 50 && (
                            <div className="mt-2 text-right">
                              <Button
                                onClick={toggleFullscreen}
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-1 text-xs"
                              >
                                <Maximize className="w-3 h-3" />
                                <span>View Fullscreen ({entryData.rows.length} rows)</span>
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Total Manpower (if applicable) */}
                      {entryData?.totalManpower !== undefined && (
                        <div className="p-3 bg-green-50 rounded border border-green-200">
                          <p className="text-sm font-semibold">Total Manpower: {entryData.totalManpower}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="mb-8"
      whileHover={{ y: -2 }}
    >
      <Card className="p-6 shadow-md hover:shadow-lg transition-shadow duration-300 rounded-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h3 className="text-xl font-bold">Submitted Sheets - Review Queue</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Viewing all submissions from all projects
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <motion.div
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
            >
              <Button
                size="sm"
                variant="outline"
                onClick={onRefresh}
                disabled={loading}
                className="transition-all duration-200 px-3 py-1 h-8"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </motion.div>
            <Badge variant="secondary" className="text-xs py-1 px-2">{submittedEntries.filter(e => e.status === 'submitted_to_pm').length} Pending</Badge>
            <Badge variant="outline" className="text-xs py-1 px-2">{submittedEntries.length} Total</Badge>
          </div>
        </div>

        {loading ? (
          <motion.div
            className="text-center py-8 text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="flex justify-center"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <Clock className="h-12 w-12 opacity-50" />
            </motion.div>
            <p className="mt-2">Loading submitted sheets...</p>
          </motion.div>
        ) : submittedEntries.length === 0 ? (
          <motion.div
            className="text-center py-8 text-muted-foreground"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <FileText className="mx-auto h-12 w-12 opacity-50" />
            <p className="mt-2 font-semibold">No sheets submitted yet</p>
            <p className="text-sm mt-1">No submissions from any supervisors yet</p>
            <div className="mt-4 flex flex-col items-center gap-2">
              <motion.div
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
              >
                <Button
                  onClick={onRefresh}
                  size="sm"
                  variant="outline"
                  className="transition-all duration-200 px-3 py-1 h-8"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <div className="w-full">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
            >
              <div>
                <h3 className="text-lg font-semibold">Select Sheet Type</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose the type of sheet to review
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Select value={activeTab} onValueChange={onTabChange}>
                  <SelectTrigger className="w-[200px] sm:w-[250px]">
                    <div className="flex items-center">
                      {sheetTypes.map(sheet => {
                        if (sheet.value === activeTab) {
                          const Icon = sheet.icon;
                          const count = getEntriesBySheetType(sheet.value).length;
                          return (
                            <React.Fragment key={sheet.value}>
                              <Icon className="w-4 h-4 mr-2" />
                              <span>{sheet.label}</span>
                              {count > 0 && (
                                <Badge variant="secondary" className="ml-2 text-xs py-0.5 px-1.5">
                                  {count}
                                </Badge>
                              )}
                            </React.Fragment>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {sheetTypes.map((sheet) => {
                      const Icon = sheet.icon;
                      const count = getEntriesBySheetType(sheet.value).length;
                      return (
                        <SelectItem key={sheet.value} value={sheet.value}>
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center">
                              <Icon className="w-4 h-4 mr-2" />
                              <span>{sheet.label}</span>
                            </div>
                            {count > 0 && (
                              <Badge variant="secondary" className="ml-2 text-xs py-0.5 px-1.5">
                                {count}
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </motion.div>

            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.3,
                  delay: 0.1
                }}
                className="w-full"
                key={activeTab}
                exit={{ opacity: 0, y: -20 }}
              >
                {renderSheetEntries(activeTab)}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </Card>

      {/* Cell Comment Popover */}
      {commentPopover && user && (
        <CommentPopover
          isOpen={commentPopover.isOpen}
          onClose={closeCommentPopover}
          sheetId={commentPopover.sheetId}
          rowIndex={commentPopover.rowIndex}
          columnKey={commentPopover.columnKey}
          columnLabel={commentPopover.columnLabel}
          currentUserRole={user.Role || 'Site PM'}
          currentUserId={user.ObjectId || 0}
          onCommentAdded={() => {
            // Refresh will happen on close
          }}
        />
      )}
    </motion.div>
  );
};