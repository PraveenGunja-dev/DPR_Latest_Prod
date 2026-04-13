// src/services/chartService.ts
import apiClient from './apiClient';

/**
 * Get all charts data for a user role and project
 */
export const getAllChartsData = async (role: string, projectId?: number | string) => {
    try {
        const params = projectId ? { projectId } : {};
        
        // Fetch all chart data in parallel
        const [
            plannedVsActual,
            completionDelay,
            approvalFlow,
            submissionTrends,
            rejectionDistribution,
            bottlenecks,
            healthComparison,
            sCurve,
            dailyProductivity,
            activityHeatmap,
            manpowerEfficiency,
            issuePareto
        ] = await Promise.all([
            apiClient.get('/charts/planned-vs-actual', { params }).then(res => res.data).catch(() => []),
            apiClient.get('/charts/completion-delay', { params }).then(res => res.data).catch(() => []),
            apiClient.get('/charts/approval-flow', { params }).then(res => res.data).catch(() => []),
            apiClient.get('/charts/submission-trends', { params }).then(res => res.data).catch(() => []),
            apiClient.get('/charts/rejection-distribution', { params }).then(res => res.data).catch(() => []),
            apiClient.get('/charts/bottlenecks', { params }).then(res => res.data).catch(() => []),
            apiClient.get('/charts/health-comparison', { params }).then(res => res.data).catch(() => []),
            // Advanced Analytics
            apiClient.get('/charts/s-curve', { params }).then(res => res.data).catch(() => []),
            apiClient.get('/charts/daily-productivity', { params }).then(res => res.data).catch(() => []),
            apiClient.get('/charts/activity-heatmap', { params }).then(res => res.data).catch(() => []),
            apiClient.get('/charts/manpower-efficiency', { params }).then(res => res.data).catch(() => []),
            apiClient.get('/charts/issue-pareto', { params }).then(res => res.data).catch(() => [])
        ]);

        return {
            plannedVsActual: plannedVsActual || [],
            completionDelay: completionDelay || [],
            approvalFlow: approvalFlow || [],
            submissionTrends: submissionTrends || [],
            rejectionDistribution: rejectionDistribution || [],
            bottlenecks: bottlenecks || [],
            healthComparison: healthComparison || [],
            sCurve: sCurve || [],
            dailyProductivity: dailyProductivity || [],
            activityHeatmap: activityHeatmap || [],
            manpowerEfficiency: manpowerEfficiency || [],
            issuePareto: issuePareto || []
        };
    } catch (error) {
        console.error('Error fetching charts data:', error);
        return {
            plannedVsActual: [],
            completionDelay: [],
            approvalFlow: [],
            submissionTrends: [],
            rejectionDistribution: [],
            bottlenecks: [],
            healthComparison: [],
            sCurve: [],
            dailyProductivity: [],
            activityHeatmap: [],
            manpowerEfficiency: [],
            issuePareto: []
        };
    }
};

/**
 * Get S-Curve data specific to a project
 */
export const getSCurveData = async (projectId: string | number) => {
    return apiClient.get('/charts/s-curve', { params: { projectId } }).then(res => res.data);
};

/**
 * Get daily productivity data for a specific activity category
 */
export const getDailyProductivityData = async (projectId: string | number, category: string = 'MMS') => {
    return apiClient.get('/charts/daily-productivity', { params: { projectId, activity_category: category } }).then(res => res.data);
};
