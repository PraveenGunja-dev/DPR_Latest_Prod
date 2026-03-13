// src/modules/auth/services/chartService.ts
import apiClient from '../../../services/apiClient';

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
  size: number;
}

// API functions for fetching chart data - NO mock data fallback
export const getPlannedVsActualData = async (projectId?: number): Promise<PlannedVsActualData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await apiClient.get('/charts/planned-vs-actual', {
      params
    });
    return response.data || [];
  } catch (error) {
    console.error('Error fetching planned vs actual data:', error);
    return [];
  }
};

export const getCompletionDelayData = async (projectId?: number): Promise<CompletionDelayData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await apiClient.get('/charts/completion-delay', {
      params
    });
    return response.data || [];
  } catch (error) {
    console.error('Error fetching completion delay data:', error);
    return [];
  }
};

export const getApprovalFlowData = async (projectId?: number): Promise<ApprovalFlowData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await apiClient.get('/charts/approval-flow', {
      params
    });
    return response.data || [];
  } catch (error) {
    console.error('Error fetching approval flow data:', error);
    return [];
  }
};

export const getSubmissionTrendsData = async (projectId?: number): Promise<SubmissionTrendData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await apiClient.get('/charts/submission-trends', {
      params
    });
    return response.data || [];
  } catch (error) {
    console.error('Error fetching submission trends data:', error);
    return [];
  }
};

export const getRejectionDistributionData = async (projectId?: number): Promise<RejectionDistributionData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await apiClient.get('/charts/rejection-distribution', {
      params
    });
    return response.data || [];
  } catch (error) {
    console.error('Error fetching rejection distribution data:', error);
    return [];
  }
};

export const getBottleneckData = async (projectId?: number): Promise<BottleneckData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await apiClient.get('/charts/bottlenecks', {
      params
    });
    return response.data || [];
  } catch (error) {
    console.error('Error fetching bottleneck data:', error);
    return [];
  }
};

export const getHealthComparisonData = async (): Promise<HealthComparisonData[]> => {
  try {
    const response = await apiClient.get('/charts/health-comparison');
    return response.data || [];
  } catch (error) {
    console.error('Error fetching health comparison data:', error);
    return [];
  }
};

export const getWorkflowScatterData = async (projectId?: number): Promise<WorkflowScatterData[]> => {
  try {
    const params = projectId ? { projectId } : {};
    const response = await apiClient.get('/charts/workflow-scatter', {
      params
    });
    return response.data || [];
  } catch (error) {
    console.error('Error fetching workflow scatter data:', error);
    return [];
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
