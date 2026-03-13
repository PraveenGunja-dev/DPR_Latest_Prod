import React, { useState, useEffect } from 'react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, BarChart3, TrendingUp, PieChart as PieChartIcon, Activity, RefreshCw } from 'lucide-react';
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
  Legend,
  ComposedChart
} from 'recharts';
import { getAllChartsData } from '@/modules/auth/services/chartService';

// Theme-aware colors
const CHART_COLORS = {
  primary: 'hsl(200, 90%, 37%)',      // Adani Blue
  secondary: 'hsl(270, 36%, 44%)',    // Adani Purple
  accent: 'hsl(340, 53%, 37%)',       // Adani Maroon
  success: 'hsl(142, 76%, 36%)',      // Green
  warning: 'hsl(38, 92%, 50%)',       // Orange
  danger: 'hsl(0, 84%, 60%)',         // Red
  muted: 'hsl(220, 10%, 60%)',        // Gray
};

const PIE_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.accent,
  CHART_COLORS.success,
  CHART_COLORS.warning,
];

// Number formatter for compact display (e.g. 1.2M, 500k)
const formatNumber = (num: number) => {
  if (num === 0) return '0';
  return new Intl.NumberFormat('en-US', {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(num);
};

// Custom Tooltip with theme support
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-border bg-popover p-3 shadow-lg">
        <p className="font-medium text-foreground mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Common chart axis props for theming
const axisProps = {
  tick: { fill: 'hsl(var(--muted-foreground))' },
  tickLine: { stroke: 'hsl(var(--muted-foreground))' },
  axisLine: { stroke: 'hsl(var(--border))' },
};

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  isEmpty?: boolean;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, description, children, icon, isEmpty }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <Card className="shadow-sm border-border bg-card h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-base font-medium text-foreground">{title}</CardTitle>
          </div>
        </div>
        {description && (
          <CardDescription className="text-muted-foreground">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="h-[280px] flex flex-col items-center justify-center text-muted-foreground">
            <BarChart3 className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">No data available</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  </motion.div>
);

// Planned vs Actual Chart - Grouped Bar Chart
const PlannedVsActualChart: React.FC<{ data: any[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={280}>
    <ComposedChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="name" {...axisProps} fontSize={11} />
      <YAxis {...axisProps} fontSize={11} tickFormatter={formatNumber} />
      <Tooltip content={<CustomTooltip />} />
      <Legend wrapperStyle={{ fontSize: '12px' }} />
      <Bar dataKey="planned" name="Planned" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
      <Bar dataKey="actual" name="Actual" fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} />
    </ComposedChart>
  </ResponsiveContainer>
);

// Completion Delay Chart - Horizontal Bar Chart
const CompletionDelayChart: React.FC<{ data: any[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={280}>
    <BarChart data={data.slice(0, 8)} layout="vertical">
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis type="number" {...axisProps} fontSize={11} tickFormatter={formatNumber} />
      <YAxis type="category" dataKey="name" {...axisProps} fontSize={10} width={150} />
      <Tooltip content={<CustomTooltip />} />
      <Legend wrapperStyle={{ fontSize: '12px' }} />
      <Bar dataKey="delay" name="Delay (days)" fill={CHART_COLORS.danger} radius={[0, 4, 4, 0]} />
    </BarChart>
  </ResponsiveContainer>
);

// Approval Flow Chart - Stacked Area Chart
const ApprovalFlowChart: React.FC<{ data: any[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={280}>
    <AreaChart data={data}>
      <defs>
        <linearGradient id="colorSubmitted" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.8} />
          <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0.1} />
        </linearGradient>
        <linearGradient id="colorApproved" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.8} />
          <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0.1} />
        </linearGradient>
        <linearGradient id="colorRejected" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={CHART_COLORS.danger} stopOpacity={0.8} />
          <stop offset="95%" stopColor={CHART_COLORS.danger} stopOpacity={0.1} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="name" {...axisProps} fontSize={11} />
      <YAxis {...axisProps} fontSize={11} />
      <Tooltip content={<CustomTooltip />} />
      <Legend wrapperStyle={{ fontSize: '12px' }} />
      <Area type="monotone" dataKey="submitted" name="Submitted" stroke={CHART_COLORS.primary} fill="url(#colorSubmitted)" />
      <Area type="monotone" dataKey="approved" name="Approved" stroke={CHART_COLORS.success} fill="url(#colorApproved)" />
      <Area type="monotone" dataKey="rejected" name="Rejected" stroke={CHART_COLORS.danger} fill="url(#colorRejected)" />
    </AreaChart>
  </ResponsiveContainer>
);

// Submission Trends Chart - Line Chart with Area
const SubmissionTrendsChart: React.FC<{ data: any[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={280}>
    <AreaChart data={data}>
      <defs>
        <linearGradient id="colorSubmissions" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={CHART_COLORS.secondary} stopOpacity={0.8} />
          <stop offset="95%" stopColor={CHART_COLORS.secondary} stopOpacity={0.1} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="name" {...axisProps} fontSize={11} />
      <YAxis {...axisProps} fontSize={11} />
      <Tooltip content={<CustomTooltip />} />
      <Area
        type="monotone"
        dataKey="submissions"
        name="Submissions"
        stroke={CHART_COLORS.secondary}
        fill="url(#colorSubmissions)"
        strokeWidth={2}
      />
    </AreaChart>
  </ResponsiveContainer>
);

// Rejection Distribution - Donut Chart
const RejectionDistributionChart: React.FC<{ data: any[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={280}>
    <PieChart>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius={60}
        outerRadius={100}
        paddingAngle={2}
        dataKey="value"
        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
        labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}
      >
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
        ))}
      </Pie>
      <Tooltip content={<CustomTooltip />} />
    </PieChart>
  </ResponsiveContainer>
);

// Bottleneck Chart - Horizontal Bar
const BottleneckChart: React.FC<{ data: any[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={280}>
    <BarChart data={data} layout="vertical">
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis type="number" {...axisProps} fontSize={11} tickFormatter={formatNumber} />
      <YAxis type="category" dataKey="name" {...axisProps} fontSize={10} width={150} />
      <Tooltip content={<CustomTooltip />} />
      <Bar dataKey="delay" name="Delay (days)" fill={CHART_COLORS.warning} radius={[0, 4, 4, 0]} />
    </BarChart>
  </ResponsiveContainer>
);

// Health Comparison - Gradient Bar Chart
const HealthComparisonChart: React.FC<{ data: any[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={280}>
    <BarChart data={data.slice(0, 10)}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="name" {...axisProps} fontSize={10} angle={-45} textAnchor="end" height={80} />
      <YAxis {...axisProps} fontSize={11} domain={[0, 100]} />
      <Tooltip content={<CustomTooltip />} />
      <Bar
        dataKey="health"
        name="Health %"
        fill={CHART_COLORS.primary}
        radius={[4, 4, 0, 0]}
      />
    </BarChart>
  </ResponsiveContainer>
);

// Main ChartsSection Component
export const ChartsSection: React.FC<{ projectId?: number; context?: string; category?: string }> = ({
  projectId,
  context = 'DASHBOARD',
  category = 'all'
}) => {
  const { user } = useAuth();
  const location = useLocation();
  const userRole = user?.Role || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any>({});

  // Check if user can view charts
  const canViewCharts = () => {
    if (userRole === 'supervisor') return false;
    return true;
  };

  // Fetch chart data
  const fetchChartData = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getAllChartsData(userRole, projectId);
      setChartData(data);
    } catch (err) {
      setError('Failed to load chart data');
      console.error('Error fetching chart data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userRole && userRole !== 'supervisor') {
      fetchChartData();
    } else {
      setLoading(false);
    }
  }, [userRole, projectId]);

  // If supervisor, don't show charts
  if (!canViewCharts()) {
    return null;
  }

  if (loading) {
    return (
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="shadow-sm border-border bg-card">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-1/2 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[280px] w-full rounded" />
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
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="outline" size="sm" onClick={fetchChartData}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Determine which charts to show based on role and category
  const renderCharts = () => {
    const charts = [];
    const showAll = category === 'all';

    // PROGRESS GROUP
    if (showAll || category === 'progress') {
      // Planned vs Actual - Available for all roles except supervisor
      if (chartData.plannedVsActual) {
        charts.push(
          <ChartCard
            key="planned-vs-actual"
            title="Planned vs Actual Progress"
            description="Compare planned targets with actual achievements"
            icon={<TrendingUp className="w-4 h-4 text-primary" />}
            isEmpty={chartData.plannedVsActual.length === 0}
          >
            <PlannedVsActualChart data={chartData.plannedVsActual} />
          </ChartCard>
        );
      }

      // Completion & Delay - Available for all roles
      if (chartData.completionDelay) {
        charts.push(
          <ChartCard
            key="completion-delay"
            title="Top Delayed Activities"
            description="Activities with highest delays"
            icon={<AlertCircle className="w-4 h-4 text-destructive" />}
            isEmpty={chartData.completionDelay.length === 0}
          >
            <CompletionDelayChart data={chartData.completionDelay} />
          </ChartCard>
        );
      }
    }

    // APPROVAL GROUP
    if (showAll || category === 'approval') {
      // Approval Flow - Available for Site PM, PMAG, Super Admin
      if (chartData.approvalFlow) {
        charts.push(
          <ChartCard
            key="approval-flow"
            title="Approval Flow Status"
            description="Track submission status over time"
            icon={<Activity className="w-4 h-4 text-primary" />}
            isEmpty={chartData.approvalFlow.length === 0}
          >
            <ApprovalFlowChart data={chartData.approvalFlow} />
          </ChartCard>
        );
      }
    }

    // QUALITY & TRENDS GROUP
    if (showAll || category === 'quality' || category === 'trends') {
      // Submission Trends - Available for PMAG, Super Admin
      if (chartData.submissionTrends) {
        charts.push(
          <ChartCard
            key="submission-trends"
            title="Submission Trends"
            description="Daily submission patterns"
            icon={<TrendingUp className="w-4 h-4 text-secondary" />}
            isEmpty={chartData.submissionTrends.length === 0}
          >
            <SubmissionTrendsChart data={chartData.submissionTrends} />
          </ChartCard>
        );
      }

      // Rejection Distribution - Available for PMAG, Super Admin
      if (chartData.rejectionDistribution && chartData.rejectionDistribution.length > 0) {
        charts.push(
          <ChartCard
            key="rejection-distribution"
            title="Rejection Reasons"
            description="Distribution of rejection causes"
            icon={<PieChartIcon className="w-4 h-4 text-accent" />}
            isEmpty={chartData.rejectionDistribution.length === 0}
          >
            <RejectionDistributionChart data={chartData.rejectionDistribution} />
          </ChartCard>
        );
      }
    }

    // ADMIN / ADVANCED (Include in All or Progress)
    if (showAll || category === 'progress') {
      // Bottlenecks - Available for Super Admin only
      if (chartData.bottlenecks) {
        charts.push(
          <ChartCard
            key="bottlenecks"
            title="Bottleneck Identification"
            description="Resources with highest delays"
            icon={<AlertCircle className="w-4 h-4 text-warning" />}
            isEmpty={chartData.bottlenecks.length === 0}
          >
            <BottleneckChart data={chartData.bottlenecks} />
          </ChartCard>
        );
      }

      // Health Comparison - Available for Super Admin only
      if (chartData.healthComparison) {
        charts.push(
          <ChartCard
            key="health-comparison"
            title="Project Health Comparison"
            description="Compare health across projects"
            icon={<BarChart3 className="w-4 h-4 text-success" />}
            isEmpty={chartData.healthComparison.length === 0}
          >
            <HealthComparisonChart data={chartData.healthComparison} />
          </ChartCard>
        );
      }
    }

    return charts;
  };

  const charts = renderCharts();

  if (charts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 bg-card rounded-lg border border-border">
        <BarChart3 className="h-16 w-16 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-medium text-foreground">No Charts Available</h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-md text-center px-4">
          Charts are not available for your role or no data exists yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Analytics Dashboard</h2>
          <p className="text-sm text-muted-foreground">Real-time project insights and metrics</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchChartData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>
      <div className="grid gap-5 md:grid-cols-1 lg:grid-cols-2">
        {charts}
      </div>
    </div>
  );
};

export default ChartsSection;