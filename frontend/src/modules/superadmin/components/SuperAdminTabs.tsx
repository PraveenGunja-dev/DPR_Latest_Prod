import React, { useState, useEffect } from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, FolderPlus, Settings, FileText, BarChart3, ShieldCheck } from 'lucide-react';
import { getAccessRequestCount } from '@/modules/auth/services/authService';

interface SuperAdminTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const SuperAdminTabs: React.FC<SuperAdminTabsProps> = ({
  activeTab,
  onTabChange
}) => {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const count = await getAccessRequestCount();
        setPendingCount(count);
      } catch (e) {
        // silently ignore
      }
    };
    fetchCount();
    // Refresh count every 30 seconds
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <TabsList className="grid w-full grid-cols-8">
      <TabsTrigger
        value="users"
        className="flex items-center gap-2"
        onClick={() => onTabChange("users")}
      >
        <Users className="w-4 h-4" />
        Users
      </TabsTrigger>
      <TabsTrigger
        value="access-requests"
        className="flex items-center gap-2 relative"
        onClick={() => { onTabChange("access-requests"); setPendingCount(0); }}
      >
        <ShieldCheck className="w-4 h-4" />
        Access Requests
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
            {pendingCount}
          </span>
        )}
      </TabsTrigger>
      <TabsTrigger
        value="projects"
        className="flex items-center gap-2"
        onClick={() => onTabChange("projects")}
      >
        <FolderPlus className="w-4 h-4" />
        Projects
      </TabsTrigger>
      <TabsTrigger
        value="sheet-entries"
        className="flex items-center gap-2"
        onClick={() => onTabChange("sheet-entries")}
      >
        <FileText className="w-4 h-4" />
        Sheet Entries
      </TabsTrigger>
      <TabsTrigger
        value="roles"
        className="flex items-center gap-2"
        onClick={() => onTabChange("roles")}
      >
        <Settings className="w-4 h-4" />
        Role Management
      </TabsTrigger>
      <TabsTrigger
        value="workflow"
        className="flex items-center gap-2"
        onClick={() => onTabChange("workflow")}
      >
        <FileText className="w-4 h-4" />
        Workflow Overrides
      </TabsTrigger>
      <TabsTrigger
        value="analytics"
        className="flex items-center gap-2"
        onClick={() => onTabChange("analytics")}
      >
        <BarChart3 className="w-4 h-4" />
        Analytics
      </TabsTrigger>
      <TabsTrigger
        value="logs"
        className="flex items-center gap-2"
        onClick={() => onTabChange("logs")}
      >
        <BarChart3 className="w-4 h-4" />
        System Logs
      </TabsTrigger>
    </TabsList>
  );
};


