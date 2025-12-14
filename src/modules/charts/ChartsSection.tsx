import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, BarChart3, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';
import { getAllChartsData } from '@/modules/auth/services/chartService';

// Define types
interface ChartData {
  name: string;
  value?: number;
  [key: string]: any;
}

interface WorkflowScatterData extends ChartData {
  date: string;
  status: string;
  count: number;
  role: string;
  size: number;
}

interface ChartProps {
  data: ChartData[];
  title: string;
  type: 'bar' | 'line' | 'area' | 'pie' | 'scatter';
  dataKey: string;
  color?: string;
}

// Generic Chart Component
const ChartComponent: React.FC<ChartProps> = ({ data, title, type, dataKey, color = '#3b82f6' }) => {
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  const chartRef = useRef<HTMLDivElement>(null);

  // Custom tooltip component for better dark mode support
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-background p-2 shadow-md">
          <p className="font-medium">{label}</p>
          <p className="text-sm">
            {`${dataKey}: ${payload[0].value}`}
          </p>
        </div>
      );
    }

    return null;
  };

  // Export chart as PNG
  const exportAsPng = () => {
    // In a real implementation, we would use a library like html2canvas
    // For now, we'll just show an alert
    alert(`Exporting ${title} as PNG`);
    console.log('Export as PNG clicked for:', title);
  };

  // Export chart data as CSV
  const exportAsCsv = () => {
    if (!data || data.length === 0) {
      alert('No data to export');
      return;
    }

    // Create CSV content
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
      Object.values(row).map(value => 
        typeof value === 'string' ? `"${value}"` : value
      ).join(',')
    ).join('\n');
    
    const csvContent = `${headers}\n${rows}`;
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${title.replace(/\s+/g, '_')}_data.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="name" 
                className="text-xs fill-muted-foreground"
                tick={{ fill: 'currentColor' }}
              />
              <YAxis 
                className="text-xs fill-muted-foreground"
                tick={{ fill: 'currentColor' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey={dataKey} fill={color} />
            </BarChart>
          </ResponsiveContainer>
        );
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="name" 
                className="text-xs fill-muted-foreground"
                tick={{ fill: 'currentColor' }}
              />
              <YAxis 
                className="text-xs fill-muted-foreground"
                tick={{ fill: 'currentColor' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        );
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="name" 
                className="text-xs fill-muted-foreground"
                tick={{ fill: 'currentColor' }}
              />
              <YAxis 
                className="text-xs fill-muted-foreground"
                tick={{ fill: 'currentColor' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        );
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={true}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        );
      case 'scatter':
        // Custom tooltip for scatter chart with more detailed information
        const ScatterTooltip = ({ active, payload, label }: any) => {
          if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
              <div className="rounded-lg border bg-popover p-4 shadow-lg border-border">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-popover-foreground">{data.date}</p>
                  <div className={`w-3 h-3 rounded-full ${
                    data.status === 'submitted' ? 'bg-blue-500' :
                    data.status === 'approved' ? 'bg-green-500' :
                    data.status === 'rejected' ? 'bg-red-500' :
                    data.status === 'pushed' ? 'bg-orange-500' : 'bg-gray-500'
                  }`} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <span className={`text-sm font-medium ${
                      data.status === 'submitted' ? 'text-blue-500' :
                      data.status === 'approved' ? 'text-green-500' :
                      data.status === 'rejected' ? 'text-red-500' :
                      data.status === 'pushed' ? 'text-orange-500' : 'text-foreground'
                    }`}>
                      {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Count</span>
                    <span className="text-sm font-medium text-foreground">{data.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Role</span>
                    <span className="text-sm text-foreground">{data.role}</span>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        };

        // Color mapping for different statuses
        const statusColors: Record<string, string> = {
          submitted: '#3b82f6', // blue
          approved: '#10b981',  // green
          rejected: '#ef4444',  // red
          pushed: '#f59e0b'     // orange
        };

        // Status labels for legend
        const statusLabels = [
          { value: 'submitted', color: '#3b82f6', label: 'Submitted' },
          { value: 'approved', color: '#10b981', label: 'Approved' },
          { value: 'rejected', color: '#ef4444', label: 'Rejected' },
          { value: 'pushed', color: '#f59e0b', label: 'Pushed/Forwarded' }
        ];

        return (
          <div className="w-full h-full flex flex-col">
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="2 2" className="stroke-muted" strokeOpacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  className="text-xs fill-muted-foreground"
                  tick={{ fill: 'currentColor' }}
                  tickMargin={10}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                />
                <YAxis 
                  dataKey="count"
                  className="text-xs fill-muted-foreground"
                  tick={{ fill: 'currentColor' }}
                  tickMargin={10}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                />
                <ZAxis 
                  dataKey="size" 
                  range={[100, 1000]} 
                />
                <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter 
                  data={data} 
                  fill="#8884d8"
                  animationDuration={800}
                  animationBegin={200}
                  isAnimationActive={true}
                >
                  {data.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={statusColors[entry.status] || COLORS[index % COLORS.length]} 
                      stroke="rgba(255, 255, 255, 0.3)"
                      strokeWidth={1.5}
                      opacity={0.9}
                      onMouseEnter={(e) => {
                        (e.target as HTMLElement).style.filter = 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.5))';
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLElement).style.filter = 'none';
                      }}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-4 mt-3 pt-3 border-t border-border">
              {statusLabels.map((item, index) => (
                <div key={index} className="flex items-center gap-2 group cursor-pointer">
                  <div 
                    className="w-3 h-3 rounded-full shadow-sm group-hover:scale-125 transition-transform duration-200" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="shadow-sm border border-border bg-card hover:shadow-md transition-all duration-300" ref={chartRef}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold text-foreground tracking-tight">{title}</CardTitle>
        <div className="flex space-x-1">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 p-0 hover:bg-muted transition-colors duration-200" 
            onClick={exportAsCsv}
            aria-label="Export as CSV"
          >
            <span className="text-xs font-medium">CSV</span>
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 p-0 hover:bg-muted transition-colors duration-200" 
            onClick={exportAsPng}
            aria-label="Export as PNG"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {renderChart()}
      </CardContent>
    </Card>
  );
};

// Main ChartsSection component
interface ChartsSectionProps {
  context?: 'SUPERVISOR_DASHBOARD' | 'PM_DASHBOARD' | 'PMRG_DASHBOARD' | 'SUPER_ADMIN_DASHBOARD';
}

export const ChartsSection: React.FC<ChartsSectionProps> = ({ context }) => {
  const { user } = useAuth();
  const location = useLocation();
  // Get user role and project ID
  const userRole = user?.Role || 'supervisor';
  const projectId = location.state?.projectId || null;

  // Check if user has permission to view charts
  const canViewCharts = () => {
    // Supervisors should not see charts
    if (userRole === 'supervisor') {
      return false;
    }
    
    // All other roles can view charts
    return true;
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for chart data
  const [chartData, setChartData] = useState<Record<string, ChartData[]>>({
    plannedVsActual: [],
    completionDelay: [],
    approvalFlow: [],
    submissionTrends: [],
    rejectionDistribution: [],
    bottlenecks: [],
    healthComparison: [],
    workflowScatter: [] as WorkflowScatterData[],
  });

  // Fetch chart data
  useEffect(() => {
    const fetchChartData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const data = await getAllChartsData(userRole, projectId);
        
        setChartData({
          plannedVsActual: data.plannedVsActual || [],
          completionDelay: data.completionDelay || [],
          approvalFlow: data.approvalFlow || [],
          submissionTrends: data.submissionTrends || [],
          rejectionDistribution: data.rejectionDistribution || [],
          bottlenecks: data.bottlenecks || [],
          healthComparison: data.healthComparison || [],
          workflowScatter: data.workflowScatter || [],
        });
      } catch (err) {
        setError('Failed to load chart data');
        console.error('Error fetching chart data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (userRole && userRole !== 'supervisor') {
      fetchChartData();
    }
  }, [userRole, projectId]);

  // Determine which charts to show based on role and context
  const getChartsToShow = () => {
    // Check if user can view charts
    if (!canViewCharts()) {
      return [];
    }
    
    switch (userRole) {
      case 'supervisor':
        // Supervisors should not see analytics-heavy charts
        return [];
      
      case 'Site PM':
        return [
          { id: 'planned-vs-actual', title: 'Planned vs Actual Progress', data: chartData.plannedVsActual, type: 'bar' as const, dataKey: 'actual' },
          { id: 'completion-delay', title: 'Activity Completion & Delay', data: chartData.completionDelay, type: 'bar' as const, dataKey: 'delay' },
          { id: 'approval-flow', title: 'Approval Flow Status', data: chartData.approvalFlow, type: 'line' as const, dataKey: 'approved' },
        ];
      
      case 'PMAG':
        if (context === 'PMRG_DASHBOARD') {
          return [
            { id: 'planned-vs-actual', title: 'Planned vs Actual Progress', data: chartData.plannedVsActual, type: 'bar' as const, dataKey: 'actual' },
            { id: 'completion-delay', title: 'Activity Completion & Delay', data: chartData.completionDelay, type: 'bar' as const, dataKey: 'delay' },
            { id: 'approval-flow', title: 'Approval Flow Status', data: chartData.approvalFlow, type: 'line' as const, dataKey: 'approved' },
            { id: 'submission-trends', title: 'Submission Trends Over Time', data: chartData.submissionTrends, type: 'area' as const, dataKey: 'submissions' },
            { id: 'rejection-distribution', title: 'Rejections vs Approvals Distribution', data: chartData.rejectionDistribution, type: 'pie' as const, dataKey: 'value' },
          ];
        }
        return [
          { id: 'planned-vs-actual', title: 'Planned vs Actual Progress', data: chartData.plannedVsActual, type: 'bar' as const, dataKey: 'actual' },
          { id: 'completion-delay', title: 'Activity Completion & Delay', data: chartData.completionDelay, type: 'bar' as const, dataKey: 'delay' },
        ];
      
      case 'Super Admin':
        return [
          { id: 'planned-vs-actual', title: 'Planned vs Actual Progress', data: chartData.plannedVsActual, type: 'bar' as const, dataKey: 'actual' },
          { id: 'completion-delay', title: 'Activity Completion & Delay', data: chartData.completionDelay, type: 'bar' as const, dataKey: 'delay' },
          { id: 'approval-flow', title: 'Approval Flow Status', data: chartData.approvalFlow, type: 'line' as const, dataKey: 'approved' },
          { id: 'submission-trends', title: 'Submission Trends Over Time', data: chartData.submissionTrends, type: 'area' as const, dataKey: 'submissions' },
          { id: 'rejection-distribution', title: 'Rejections vs Approvals Distribution', data: chartData.rejectionDistribution, type: 'pie' as const, dataKey: 'value' },
          { id: 'bottleneck', title: 'Bottleneck Identification', data: chartData.bottlenecks, type: 'bar' as const, dataKey: 'delay' },
          { id: 'health-comparison', title: 'Cross-Project Health Comparison', data: chartData.healthComparison, type: 'bar' as const, dataKey: 'health' },
          { id: 'workflow-scatter', title: 'Workflow Scatter Analysis', data: chartData.workflowScatter || [], type: 'scatter' as const, dataKey: 'count' },
        ];
      
      default:
        return [];
    }
  };

  const charts = getChartsToShow();

  if (charts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 bg-card rounded-lg border border-border">
        <BarChart3 className="h-16 w-16 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-medium text-foreground">No Charts Available</h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-md text-center px-4">
          Charts are not available for your role or context. Please contact your administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(Math.min(charts.length || 3, 6))].map((_, i) => (
          <Card key={i} className="shadow-sm border border-border bg-card">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-1/2 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center p-8">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
      {charts.map((chart) => (
        <ChartComponent
          key={chart.id}
          data={chart.data}
          title={chart.title}
          type={chart.type}
          dataKey={chart.dataKey}
        />
      ))}
    </div>
  );
};