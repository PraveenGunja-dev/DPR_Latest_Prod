// src/services/issuesService.ts
// Service for issue logs API

import apiClient from './apiClient';

export interface Issue {
    id: number;
    project_id: number | null;
    entry_id: number | null;
    sheet_type: string | null;
    issue_type: 'general' | 'data_error' | 'approval' | 'sync_error' | 'system' | 'other';
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    created_by: number;
    created_by_name?: string;
    created_by_email?: string;
    assigned_to: number | null;
    assigned_to_name?: string;
    resolved_by: number | null;
    resolved_by_name?: string;
    resolved_at: string | null;
    resolution_notes: string | null;
    project_name?: string;
    created_at: string;
    updated_at: string;
}

export interface IssueStats {
    open_count: number;
    in_progress_count: number;
    resolved_count: number;
    closed_count: number;
    critical_count: number;
    high_count: number;
    total_count: number;
}

export interface CreateIssueData {
    project_id?: number;
    entry_id?: number;
    sheet_type?: string;
    issue_type?: string;
    title: string;
    description: string;
    priority?: string;
    assigned_to?: number;
}

export interface UpdateIssueData {
    title?: string;
    description?: string;
    issue_type?: string;
    priority?: string;
    status?: string;
    assigned_to?: number;
    resolution_notes?: string;
}

export interface IssueFilters {
    status?: string;
    priority?: string;
    project_id?: number;
    issue_type?: string;
    limit?: number;
    offset?: number;
}

// Get all issues with optional filters
export const getIssues = async (filters: IssueFilters = {}): Promise<{
    issues: Issue[];
    total: number;
    limit: number;
    offset: number;
}> => {
    const params = new URLSearchParams();

    if (filters.status) params.append('status', filters.status);
    if (filters.priority) params.append('priority', filters.priority);
    if (filters.project_id) params.append('project_id', filters.project_id.toString());
    if (filters.issue_type) params.append('issue_type', filters.issue_type);
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.offset) params.append('offset', filters.offset.toString());

    const response = await apiClient.get(`/issues?${params.toString()}`);
    return response.data;
};

// Get issue statistics
export const getIssueStats = async (): Promise<IssueStats> => {
    const response = await apiClient.get('/issues/stats/summary');
    return response.data.stats;
};

// Get single issue by ID
export const getIssue = async (id: number): Promise<Issue> => {
    const response = await apiClient.get(`/issues/${id}`);
    return response.data.issue;
};

// Create a new issue
export const createIssue = async (data: CreateIssueData): Promise<Issue> => {
    const response = await apiClient.post('/issues', data);
    return response.data.issue;
};

// Update an issue
export const updateIssue = async (id: number, data: UpdateIssueData): Promise<Issue> => {
    const response = await apiClient.put(`/issues/${id}`, data);
    return response.data.issue;
};

// Delete an issue
export const deleteIssue = async (id: number): Promise<void> => {
    await apiClient.delete(`/issues/${id}`);
};

export default {
    getIssues,
    getIssueStats,
    getIssue,
    createIssue,
    updateIssue,
    deleteIssue
};
