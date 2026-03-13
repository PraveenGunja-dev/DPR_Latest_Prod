import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Users, Activity, FolderPlus, FileText } from 'lucide-react';
import { ChartsSection } from '@/modules/charts';

interface SuperAdminAnalyticsProps {
  analyticsData: {
    totalUsers: number;
    activeUsers: number;
    totalProjects: number;
    totalSheets: number;
  };
}

export const SuperAdminAnalytics: React.FC<SuperAdminAnalyticsProps> = ({ analyticsData }) => {
  return (
    <div className="space-y-6">
      {/* Analytics Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-5 bg-card hover:shadow-lg transition-all duration-300 border border-border group hover:border-blue-400/60 dark:hover:border-blue-500/60">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Total Users</p>
              <p className="text-3xl font-bold tracking-tight">{analyticsData.totalUsers}</p>
            </div>
            <div className="w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-300 bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 group-hover:bg-blue-500 group-hover:text-white">
              <Users className="h-7 w-7" />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-card hover:shadow-lg transition-all duration-300 border border-border group hover:border-emerald-400/60 dark:hover:border-emerald-500/60">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Active Users</p>
              <p className="text-3xl font-bold tracking-tight">{analyticsData.activeUsers}</p>
            </div>
            <div className="w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-300 bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white">
              <Activity className="h-7 w-7" />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-card hover:shadow-lg transition-all duration-300 border border-border group hover:border-purple-400/60 dark:hover:border-purple-500/60">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Total Projects</p>
              <p className="text-3xl font-bold tracking-tight">{analyticsData.totalProjects}</p>
            </div>
            <div className="w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-300 bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400 group-hover:bg-purple-500 group-hover:text-white">
              <FolderPlus className="h-7 w-7" />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-card hover:shadow-lg transition-all duration-300 border border-border group hover:border-orange-400/60 dark:hover:border-orange-500/60">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Total Sheets</p>
              <p className="text-3xl font-bold tracking-tight">{analyticsData.totalSheets}</p>
            </div>
            <div className="w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-300 bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400 group-hover:bg-orange-500 group-hover:text-white">
              <FileText className="h-7 w-7" />
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="mb-8">
        <ChartsSection context="SUPER_ADMIN_DASHBOARD" />
      </div>
    </div>
  );
};