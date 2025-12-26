import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  FileSpreadsheet,
  Grid3X3,
  Wrench,
  Building,
  Package,
  User,
  Upload
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { EntryCard } from "@/components/shared/EntryCard";
import { toast } from "sonner";

interface PMAGSheetEntriesProps {
  approvedEntries: any[];
  loadingEntries: boolean;
  onRefresh: () => void;
  onFinalApprove: (entryId: number) => void;
  onReject: (entryId: number) => void;
  expandedEntries: Record<number, boolean>;
  setExpandedEntries: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  onPushToP6?: (entry: any) => void;
}

export const PMAGSheetEntries: React.FC<PMAGSheetEntriesProps> = ({
  approvedEntries,
  loadingEntries,
  onRefresh,
  onFinalApprove,
  onReject,
  expandedEntries,
  setExpandedEntries,
  onPushToP6
}) => {
  const [activeTab, setActiveTab] = useState('dp_qty');

  // Sheet types for tabs
  const sheetTypes = [
    { value: 'dp_qty', label: 'DP Qty', icon: FileSpreadsheet },
    { value: 'dp_block', label: 'DP Block', icon: Grid3X3 },
    { value: 'dp_vendor_idt', label: 'DP Vendor IDT', icon: Wrench },
    { value: 'mms_module_rfi', label: 'MMS & Module RFI', icon: Building },
    { value: 'dp_vendor_block', label: 'DP Vendor Block', icon: Package },
    { value: 'manpower_details', label: 'Manpower Details', icon: User },
  ];

  // Filter entries by sheet type
  const getEntriesBySheetType = (sheetType: string) => {
    return approvedEntries.filter(entry => entry.sheet_type === sheetType);
  };

  // Toggle entry expansion
  const toggleEntryExpansion = (entryId: number) => {
    setExpandedEntries(prev => ({
      ...prev,
      [entryId]: !prev[entryId]
    }));
  };

  // Handle Push to P6
  const handlePushToP6 = (entry: any) => {
    if (onPushToP6) {
      onPushToP6(entry);
    } else {
      toast.info("Push to P6 functionality coming soon");
    }
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
          <FileSpreadsheet className="mx-auto h-12 w-12 opacity-50" />
          <p className="mt-2">No {sheetType.replace(/_/g, ' ')} sheets approved yet</p>
        </motion.div>
      );
    }

    return (
      <div className="space-y-4">
        {entries.map((entry) => {
          const isExpanded = expandedEntries[entry.id] || false;

          return (
            <EntryCard
              key={entry.id}
              entry={entry}
              isExpanded={isExpanded}
              onToggleExpand={() => toggleEntryExpansion(entry.id)}
              onApprove={() => onFinalApprove(entry.id)}
              onReject={() => onReject(entry.id)}
              onPushToP6={() => handlePushToP6(entry)}
              sheetType={sheetType}
              showPushToP6={true}
            />
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
    >
      <Card className="p-6 bg-card dark:bg-gray-800">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">PM Approved Sheets - Awaiting Final Review</h3>
          <div className="flex items-center space-x-2">
            <motion.div
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
            >
              <Button
                size="sm"
                variant="outline"
                onClick={onRefresh}
                disabled={loadingEntries}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingEntries ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </motion.div>
            <Badge variant="secondary">{approvedEntries.length} Pending</Badge>
          </div>
        </div>

        {loadingEntries ? (
          <motion.div
            className="text-center py-8 text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="flex justify-center"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <RefreshCw className="h-12 w-12 opacity-50" />
            </motion.div>
            <p className="mt-2">Loading approved sheets...</p>
          </motion.div>
        ) : approvedEntries.length === 0 ? (
          <motion.div
            className="text-center py-8 text-muted-foreground"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <FileSpreadsheet className="mx-auto h-12 w-12 opacity-50" />
            <p className="mt-2 font-semibold">No sheets approved by PM yet</p>
            <p className="text-sm mt-1">No approvals from Project Managers received yet</p>
            <div className="mt-4">
              <motion.div
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
              >
                <Button
                  onClick={onRefresh}
                  size="sm"
                  variant="outline"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {/* Sheet Type Tabs - Improved alignment */}
            <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-4">
              {sheetTypes.map((sheet) => {
                const Icon = sheet.icon;
                const count = getEntriesBySheetType(sheet.value).length;
                const isActive = activeTab === sheet.value;
                return (
                  <Button
                    key={sheet.value}
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveTab(sheet.value)}
                    className={`flex items-center gap-2 ${isActive
                        ? 'shadow-md'
                        : 'hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors'
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{sheet.label}</span>
                    {count > 0 && (
                      <Badge
                        variant={isActive ? "secondary" : "outline"}
                        className={`ml-1 ${isActive ? 'bg-white/20 text-white' : ''}`}
                      >
                        {count}
                      </Badge>
                    )}
                  </Button>
                );
              })}
            </div>

            {/* Sheet Entries */}
            <div className="mt-4">
              {renderSheetEntries(activeTab)}
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
};