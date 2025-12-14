// src/modules/auth/services/chartService.ts
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// Helper to get auth token
const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Mock data for charts when API is not available
const mockPlannedVsActualData = [
  { name: 'Week 1', planned: 20, actual: 15 },
  { name: 'Week 2', planned: 40, actual: 35 },
  { name: 'Week 3', planned: 60, actual: 55 },
  { name: 'Week 4', planned: 80, actual: 75 },
  { name: 'Week 5', planned: 100, actual: 90 },
];

const mockCompletionDelayData = [
  { name: 'Activity A', completion: 85, delay: 2 },
  { name: 'Activity B', completion: 70, delay: 5 },
  { name: 'Activity C', completion: 90, delay: 1 },
  { name: 'Activity D', completion: 60, delay: 8 },
  { name: 'Activity E', completion: 75, delay: 4 },
];

const mockApprovalFlowData = [
  { name: 'Submitted', submitted: 45, approved: 38, rejected: 7 },
  { name: 'In Review', submitted: 30, approved: 25, rejected: 5 },
  { name: 'Pending', submitted: 25, approved: 20, rejected: 5 },
];

const mockSubmissionTrendsData = [
  { name: '2025-01-01', date: '2025-01-01', submissions: 12 },
  { name: '2025-01-08', date: '2025-01-08', submissions: 19 },
  { name: '2025-01-15', date: '2025-01-15', submissions: 15 },
  { name: '2025-01-22', date: '2025-01-22', submissions: 22 },
  { name: '2025-01-29', date: '2025-01-29', submissions: 18 },
];

const mockRejectionDistributionData = [
  { name: 'Quality Issues', value: 30 },
  { name: 'Documentation', value: 25 },
  { name: 'Design Changes', value: 20 },
  { name: 'Resource Constraints', value: 15 },
  { name: 'Other', value: 10 },
];

const mockBottleneckData = [
  { name: 'Vendor A', delay: 12 },
  { name: 'Vendor B', delay: 8 },
  { name: 'Vendor C', delay: 15 },
  { name: 'Vendor D', delay: 6 },
  { name: 'Vendor E', delay: 10 },
];

const mockHealthComparisonData = [
  { name: 'Project A', health: 85 },
  { name: 'Project B', health: 72 },
  { name: 'Project C', health: 90 },
  { name: 'Project D', health: 65 },
  { name: 'Project E', health: 78 },
];

const mockWorkflowScatterData: WorkflowScatterData[] = [
  { name: '2025-01-01', date: '2025-01-01', status: 'submitted' as const, count: 12, role: 'Supervisor A', size: 12 },
  { name: '2025-01-01', date: '2025-01-01', status: 'approved' as const, count: 8, role: 'Site PM', size: 8 },
  { name: '2025-01-02', date: '2025-01-02', status: 'rejected' as const, count: 3, role: 'Site PM', size: 3 },
  { name: '2025-01-02', date: '2025-01-02', status: 'pushed' as const, count: 5, role: 'PMAG', size: 5 },
  { name: '2025-01-03', date: '2025-01-03', status: 'submitted' as const, count: 15, role: 'Supervisor B', size: 15 },
  { name: '2025-01-03', date: '2025-01-03', status: 'approved' as const, count: 10, role: 'Site PM', size: 10 },
  { name: '2025-01-04', date: '2025-01-04', status: 'rejected' as const, count: 2, role: 'Site PM', size: 2 },
  { name: '2025-01-04', date: '2025-01-04', status: 'pushed' as const, count: 7, role: 'PMAG', size: 7 },
];

// Chart data interfaces
export interface ChartDataPoint {
  name: string;
  value?: number;
  [key: string]: any;
}

export interface PlannedVsActualData extends ChartDataPoint {
  planned: number;
  actual: number;
}

export interface CompletionDelayData extends ChartDataPoint {
  completion: number;
  delay: number;
}

export interface ApprovalFlowData extends ChartDataPoint {
  submitted: number;
  approved: number;
  rejected: number;
}

export interface SubmissionTrendData extends ChartDataPoint {
  date: string;
  submissions: number;
}

export interface RejectionDistributionData extends ChartDataPoint {
  value: number;
}

export interface BottleneckData extends ChartDataPoint {
  delay: number;
}

export interface HealthComparisonData extends ChartDataPoint {
  health: number;
}

export interface WorkflowScatterData extends ChartDataPoint {
  date: string;
  status: 'submitted' | 'approved' | 'rejected' | 'pushed';
  count: number;
  role: string;
  project?: string;
  size: number; // For dot size proportional to impact
}

// API functions for fetching chart data
export const getPlannedVsActualData = async (projectId?: number): Promise<PlannedVsActualData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await axios.get(`${API_URL}/api/charts/planned-vs-actual`, {
      params,
      headers: getAuthHeader()
    });
    return response.data;
  } catch (error) {
    console.warn('API not available, using mock data for planned vs actual');
    return mockPlannedVsActualData;
  }
};

export const getCompletionDelayData = async (projectId?: number): Promise<CompletionDelayData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await axios.get(`${API_URL}/api/charts/completion-delay`, {
      params,
      headers: getAuthHeader()
    });
    return response.data;
  } catch (error) {
    console.warn('API not available, using mock data for completion delay');
    return mockCompletionDelayData;
  }
};

export const getApprovalFlowData = async (projectId?: number): Promise<ApprovalFlowData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await axios.get(`${API_URL}/api/charts/approval-flow`, {
      params,
      headers: getAuthHeader()
    });
    return response.data;
  } catch (error) {
    console.warn('API not available, using mock data for approval flow');
    return mockApprovalFlowData;
  }
};

export const getSubmissionTrendsData = async (projectId?: number): Promise<SubmissionTrendData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await axios.get(`${API_URL}/api/charts/submission-trends`, {
      params,
      headers: getAuthHeader()
    });
    return response.data;
  } catch (error) {
    console.warn('API not available, using mock data for submission trends');
    return mockSubmissionTrendsData;
  }
};

export const getRejectionDistributionData = async (projectId?: number): Promise<RejectionDistributionData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await axios.get(`${API_URL}/api/charts/rejection-distribution`, {
      params,
      headers: getAuthHeader()
    });
    return response.data;
  } catch (error) {
    console.warn('API not available, using mock data for rejection distribution');
    return mockRejectionDistributionData;
  }
};

export const getBottleneckData = async (projectId?: number): Promise<BottleneckData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await axios.get(`${API_URL}/api/charts/bottlenecks`, {
      params,
      headers: getAuthHeader()
    });
    return response.data;
  } catch (error) {
    console.warn('API not available, using mock data for bottlenecks');
    return mockBottleneckData;
  }
};

export const getHealthComparisonData = async (): Promise<HealthComparisonData[]> => {
  try {
    const response = await axios.get(`${API_URL}/api/charts/health-comparison`, {
      headers: getAuthHeader()
    });
    return response.data;
  } catch (error) {
    console.warn('API not available, using mock data for health comparison');
    return mockHealthComparisonData;
  }
};

export const getWorkflowScatterData = async (projectId?: number): Promise<WorkflowScatterData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await axios.get(`${API_URL}/api/charts/workflow-scatter`, {
      params,
      headers: getAuthHeader()
    });
    return response.data;
  } catch (error) {
    console.warn('API not available, using mock data for workflow scatter');
    return mockWorkflowScatterData;
  }
};

// Combined function to fetch all chart data for a specific context
export interface ChartsData {
  plannedVsActual?: PlannedVsActualData[];
  completionDelay?: CompletionDelayData[];
  approvalFlow?: ApprovalFlowData[];
  submissionTrends?: SubmissionTrendData[];
  rejectionDistribution?: RejectionDistributionData[];
  bottlenecks?: BottleneckData[];
  healthComparison?: HealthComparisonData[];
  workflowScatter?: WorkflowScatterData[];
}

export const getAllChartsData = async (
  userRole: string,
  projectId?: number
): Promise<ChartsData> => {
  const chartsData: ChartsData = {};

  try {
    // Fetch data based on user role
    switch (userRole) {
      case 'Site PM':
        chartsData.plannedVsActual = await getPlannedVsActualData(projectId);
        chartsData.completionDelay = await getCompletionDelayData(projectId);
        chartsData.approvalFlow = await getApprovalFlowData(projectId);
        break;

      case 'PMAG':
        chartsData.plannedVsActual = await getPlannedVsActualData(projectId);
        chartsData.completionDelay = await getCompletionDelayData(projectId);
        chartsData.approvalFlow = await getApprovalFlowData(projectId);
        chartsData.submissionTrends = await getSubmissionTrendsData(projectId);
        chartsData.rejectionDistribution = await getRejectionDistributionData(projectId);
        break;

      case 'Super Admin':
        chartsData.plannedVsActual = await getPlannedVsActualData(projectId);
        chartsData.completionDelay = await getCompletionDelayData(projectId);
        chartsData.approvalFlow = await getApprovalFlowData(projectId);
        chartsData.submissionTrends = await getSubmissionTrendsData(projectId);
        chartsData.rejectionDistribution = await getRejectionDistributionData(projectId);
        chartsData.bottlenecks = await getBottleneckData(projectId);
        chartsData.healthComparison = await getHealthComparisonData();
        chartsData.workflowScatter = await getWorkflowScatterData(projectId);
        break;

      default:
        // Supervisors don't get charts
        break;
    }

    return chartsData;
  } catch (error) {
    console.error('Error fetching all charts data:', error);
    // Return whatever data we have even if some requests failed
    return chartsData;
  }
};