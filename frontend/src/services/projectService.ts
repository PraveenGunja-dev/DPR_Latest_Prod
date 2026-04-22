// src/services/projectService.ts
import apiClient from './apiClient';
import { Project, User, ProjectAssignment, Supervisor } from '@/types';
import axios from 'axios';

/**
 * Handle API errors consistently
 */
const handleApiError = (error: any, defaultMessage: string) => {
    if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.message || defaultMessage);
    }
    throw new Error('Network error');
};

// Get projects for the authenticated user
export const getUserProjects = async (): Promise<Project[]> => {
    try {
        const response = await apiClient.get<Project[]>('/projects');
        return response.data.map(p => ({
            ...p,
            projectType: p.projectType || p.project_type || detectProjectType(p)
        }));
    } catch (error) {
        return handleApiError(error, 'Failed to fetch projects');
    }
};

// Get project by ID
export const getProjectById = async (projectId: number): Promise<Project> => {
    try {
        const response = await apiClient.get<Project>(`/projects/${projectId}`);
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to fetch project');
    }
};

// Create a new project
export const createProject = async (projectData: any): Promise<Project> => {
    try {
        // Map any P6 style names to backend names if needed
        const payload = {
            name: projectData.Name || projectData.name,
            location: projectData.Location || projectData.location,
            status: projectData.Status || projectData.status,
            progress: projectData.PercentComplete || projectData.progress,
            planStart: projectData.PlannedStartDate || projectData.planStart,
            planEnd: projectData.PlannedFinishDate || projectData.planEnd,
            actualStart: projectData.ActualStartDate || projectData.actualStart,
            actualEnd: projectData.ActualFinishDate || projectData.actualEnd
        };

        const response = await apiClient.post<Project>('/projects', payload);
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to create project');
    }
};

// Update project
export const updateProject = async (projectId: number, projectData: Partial<any>): Promise<Project> => {
    try {
        const payload: any = {};
        if (projectData.Name !== undefined || projectData.name !== undefined) payload.name = projectData.Name || projectData.name;
        if (projectData.Location !== undefined || projectData.location !== undefined) payload.location = projectData.Location || projectData.location;
        if (projectData.Status !== undefined || projectData.status !== undefined) payload.status = projectData.Status || projectData.status;
        if (projectData.PercentComplete !== undefined || projectData.progress !== undefined) payload.progress = projectData.PercentComplete || projectData.progress;

        const response = await apiClient.put<Project>(`/projects/${projectId}`, payload);
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to update project');
    }
};

import { detectProjectType } from '@/utils/projectUtils';

// Get assigned projects for supervisor
export const getAssignedProjects = async (): Promise<Project[]> => {
    try {
        const response = await apiClient.get<Project[]>('/project-assignment/assigned');
        // Enrich with detected type if not present
        return response.data.map(p => ({
            ...p,
            projectType: p.projectType || p.project_type || detectProjectType(p)
        }));
    } catch (error) {
        return handleApiError(error, 'Failed to fetch assigned projects');
    }
};

// Get assigned projects for a specific user (PMAG only)
export const getProjectsForUser = async (userId: number): Promise<Project[]> => {
    try {
        const response = await apiClient.get<Project[]>(`/project-assignment/user/${userId}/projects`);
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to fetch user projects');
    }
};

// Get all projects for assignment (PMAG and Site PM only)
export const getAllProjectsForAssignment = async (): Promise<Project[]> => {
    try {
        const response = await apiClient.get<Project[]>('/projects/all-for-assignment');
        return response.data.map(p => ({
            ...p,
            projectType: p.projectType || p.project_type || detectProjectType(p)
        }));
    } catch (error) {
        return handleApiError(error, 'Failed to fetch projects for assignment');
    }
};

// Assign project to supervisor
export const assignProjectToSupervisor = async (projectId: number, supervisorId: number, sheetTypes: string[] = []): Promise<any> => {
    try {
        const response = await apiClient.post('/project-assignment/assign', {
            projectId: projectId,
            supervisorId: supervisorId,
            sheetTypes: sheetTypes
        });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to assign project');
    }
};

import { normalizeUser } from './userService';

// Get supervisors for a project (PMAG only)
export const getProjectSupervisors = async (projectId: number): Promise<Supervisor[]> => {
    try {
        const response = await apiClient.get<any[]>(`/project-assignment/project/${projectId}/supervisors`);
        return response.data.map(normalizeUser) as Supervisor[];
    } catch (error) {
        return handleApiError(error, 'Failed to fetch project supervisors');
    }
};

// Get Site PMs for a project (PMAG only)
export const getProjectSitePMs = async (projectId: number): Promise<User[]> => {
    try {
        const response = await apiClient.get<any[]>(`/project-assignment/project/${projectId}/sitepms`);
        return response.data.map(normalizeUser);
    } catch (error) {
        return handleApiError(error, 'Failed to fetch project Site PMs');
    }
};

// Unassign project from supervisor
export const unassignProjectFromSupervisor = async (projectId: number, supervisorId: number): Promise<any> => {
    try {
        const response = await apiClient.post('/project-assignment/unassign', {
            projectId: projectId,
            supervisorId: supervisorId
        });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to unassign project');
    }
};

// Assign projects to multiple supervisors
export const assignProjectsToMultipleSupervisors = async (projectIds: number[], supervisorIds: number[], sheetTypes: string[] = []): Promise<any> => {
    try {
        const response = await apiClient.post('/project-assignment/assign-projects-multiple', {
            projectIds: projectIds,
            supervisorIds: supervisorIds,
            sheetTypes: sheetTypes
        });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to assign projects to multiple users');
    }
};
