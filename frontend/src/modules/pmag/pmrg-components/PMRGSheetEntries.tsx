import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileCheck,
  Maximize,
  Minimize,
  Check,
  X
} from 'lucide-react';
import { TabbedEntries } from '@/components/shared/TabbedEntries';

interface PMRGSheetEntriesProps {
  approvedEntries: any[];
  activeTab: string;
  handleTabChange: (value: string) => void;
  handleFinalApprove: (entryId: number) => void;
  handleRejectToPM: (entryId: number) => void;
  loadingEntries: boolean;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
}

export const PMRGSheetEntries: React.FC<PMRGSheetEntriesProps> = ({
  approvedEntries,
  activeTab,
  handleTabChange,
  handleFinalApprove,
  handleRejectToPM,
  loadingEntries,
  isFullscreen,
  toggleFullscreen
}) => {
  // Sheet types for tabs
  const sheetTypes = [
    { value: 'dp_qty', label: 'DP Qty', icon: FileCheck },
    { value: 'dp_block', label: 'DP Block', icon: FileCheck },
    { value: 'dp_vendor_idt', label: 'DP Vendor IDT', icon: FileCheck },
    { value: 'mms_module_rfi', label: 'MMS & Module RFI', icon: FileCheck },
    { value: 'dp_vendor_block', label: 'DP Vendor Block', icon: FileCheck },
    { value: 'manpower_details', label: 'Manpower Details', icon: FileCheck },
  ];

  // Filter entries by sheet type
  const getEntriesBySheetType = (sheetType: string) => {
    if (!Array.isArray(approvedEntries)) return [];
    return approvedEntries.filter(entry => entry && entry.sheet_type === sheetType);
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
          <FileCheck className="mx-auto h-12 w-12 opacity-50" />
          <p className="mt-2">No {sheetType.replace(/_/g, ' ')} sheets awaiting final approval</p>
        </motion.div>
      );
    }

    return (
      <div className="space-y-6">
        {entries.map((entry, entryIndex) => {
          const entryData = entry?.data_json
            ? (typeof entry.data_json === 'string' ? JSON.parse(entry.data_json) : entry.data_json)
            : { rows: [] };

          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: entryIndex * 0.1 }}
              className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200 bg-white"
            >
              {/* Entry Header */}
              <motion.div
                className="flex flex-col md:flex-row md:items-center justify-between mb-4 pb-3 border-b border-gray-200 bg-gray-50 rounded-t-lg p-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: entryIndex * 0.1 + 0.1 }}
              >
                <div className="flex flex-col mb-3 md:mb-0">
                  <span className="font-semibold text-lg">Entry #{entry.id}</span>
                  <span className="text-sm text-muted-foreground">
                    Submitted by: {entry.supervisor_name || 'Supervisor'} ({entry.supervisor_email})
                  </span>
                  <span className="text-xs text-muted-foreground">
                    PM Approved: {new Date(entry.updated_at).toLocaleString()}
                  </span>
                  <span className="text-xs font-medium text-primary mt-1">
                    Project ID: {entry.project_id}
                  </span>
                </div>
                <div className="flex items-center space-x-2 flex-wrap">
                  <Badge variant="default" className="bg-blue-500 px-3 py-1 text-xs font-medium">
                    PM Approved
                  </Badge>
                  <motion.div
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ scale: 1.05 }}
                  >
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleFinalApprove(entry.id)}
                      className="bg-green-600 hover:bg-green-700 transition-all duration-200 px-3 py-1 h-8"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Final Approve
                    </Button>
                  </motion.div>
                  <motion.div
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ scale: 1.05 }}
                  >
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleRejectToPM(entry.id)}
                      className="transition-all duration-200 px-3 py-1 h-8"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Reject to PM
                    </Button>
                  </motion.div>
                </div>
              </motion.div>

              {/* Sheet Information */}
              {entryData?.staticHeader && (
                <motion.div
                  className="bg-blue-50 p-3 rounded mb-4 border border-blue-100"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: entryIndex * 0.1 + 0.2 }}
                  whileHover={{ scale: 1.01 }}
                >
                  <p className="text-sm"><strong>Project:</strong> {entryData.staticHeader.projectInfo}</p>
                  <p className="text-sm"><strong>Reporting Date:</strong> {entryData.staticHeader.reportingDate}</p>
                  <p className="text-sm"><strong>Progress Date:</strong> {entryData.staticHeader.progressDate}</p>
                </motion.div>
              )}

              {/* Data Table */}
              {entryData?.rows && (Array.isArray(entryData.rows) && entryData.rows.length > 0) && (
                <motion.div
                  className={`overflow-x-auto mb-4 rounded-lg border border-gray-200 ${isFullscreen ? 'fixed inset-0 z-50 bg-white p-4 overflow-auto' : ''}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: entryIndex * 0.1 + 0.3 }}
                >
                  {isFullscreen && (
                    <div className="flex justify-between items-center mb-4 p-2 border-b">
                      <h3 className="text-lg font-semibold">Fullscreen View - {entryData.rows.length} Rows</h3>
                      <Button
                        onClick={toggleFullscreen}
                        variant="outline"
                        size="sm"
                      >
                        <Minimize className="w-4 h-4 mr-1" />
                        Exit Fullscreen
                      </Button>
                    </div>
                  )}
                  <div className={isFullscreen ? 'overflow-auto max-h-[calc(100vh-120px)]' : 'max-h-96 overflow-y-auto'}>
                    <table className="w-full border-collapse min-w-full">
                      <thead>
                        <tr className="bg-gray-100 sticky top-0 z-10">
                          {Object.keys((Array.isArray(entryData?.rows) ? entryData.rows[0] : null) || {}).map((key) => (
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
                            {Object.values(row || {}).map((value: any, colIndex: number) => (
                              <td key={`${rowIndex}-${colIndex}`} className="border border-gray-300 p-2 text-sm align-top">
                                {value || '-'}
                              </td>
                            ))}
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!isFullscreen && entryData.rows.length > 50 && (
                    <div className="mt-2 text-right">
                      <Button
                        onClick={toggleFullscreen}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                      >
                        <Maximize className="w-3 h-3 mr-1" />
                        View Fullscreen ({entryData.rows.length} rows)
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Total Manpower (if applicable) */}
              {entryData?.totalManpower !== undefined && (
                <motion.div
                  className="mt-4 p-3 bg-green-50 rounded border border-green-200"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: entryIndex * 0.1 + 0.5 }}
                  whileHover={{ scale: 1.01 }}
                >
                  <p className="text-sm font-semibold">Total Manpower: {entryData.totalManpower}</p>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold">PM Approved Sheets - Awaiting Final Review</h3>
        <Badge variant="secondary">{(Array.isArray(approvedEntries) ? approvedEntries.length : 0)} Pending</Badge>
      </div>

      <TabbedEntries
        sheetTypes={sheetTypes}
        activeTab={activeTab}
        handleTabChange={handleTabChange}
        renderSheetEntries={renderSheetEntries}
        getEntriesBySheetType={getEntriesBySheetType}
        loadingEntries={loadingEntries}
      />
    </Card>
  );
};