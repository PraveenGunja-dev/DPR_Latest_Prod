import axios from 'axios';
import apiClient from '../../../services/apiClient';

// Define types for Oracle P6 style API responses
export interface Project {
  ObjectId: number;
  Name: string;
  Location: string;
  Status: string;
  PercentComplete: number;
  PlannedStartDate: string;
  PlannedFinishDate: string;
  ActualStartDate: string | null;
  ActualFinishDate: string | null;
}

export interface User {
  ObjectId: number;
  Name: string;
  Email: string;
  Role: 'supervisor' | 'Site PM' | 'PMAG';
}

export interface ProjectAssignment {
  ObjectId: number;
  ProjectId: number;
  UserId: number;
  AssignedAt: string;
}

export interface Supervisor {
  ObjectId: number;
  Name: string;
  Email: string;
  AssignedAt: string;
}

// Get projects for the authenticated user
export const getUserProjects = async (): Promise<Project[]> => {
  try {
    const response = await apiClient.get<Project[]>('/projects');
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to fetch projects'
        : 'Network error'
    );
  }
};

// Get project by ID
export const getProjectById = async (projectId: number): Promise<Project> => {
  try {
    const response = await apiClient.get<Project>(`/projects/${projectId}`);
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to fetch project'
        : 'Network error'
    );
  }
};

// Create a new project
export const createProject = async (projectData: Omit<Project, 'ObjectId'>): Promise<Project> => {
  try {
    // Map the field names to match the backend expectations
    const mappedData = {
      name: projectData.Name,
      location: projectData.Location,
      status: projectData.Status,
      progress: projectData.PercentComplete,
      planStart: projectData.PlannedStartDate,
      planEnd: projectData.PlannedFinishDate,
      actualStart: projectData.ActualStartDate,
      actualEnd: projectData.ActualFinishDate
    };

    const response = await apiClient.post<Project>('/projects', mappedData);

    // Map the response back to Oracle P6 style
    const oracleP6Project: Project = {
      ObjectId: response.data.ObjectId,
      Name: response.data.Name,
      Location: response.data.Location,
      Status: response.data.Status,
      PercentComplete: response.data.PercentComplete,
      PlannedStartDate: response.data.PlannedStartDate,
      PlannedFinishDate: response.data.PlannedFinishDate,
      ActualStartDate: response.data.ActualStartDate,
      ActualFinishDate: response.data.ActualFinishDate
    };

    return oracleP6Project;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to create project'
        : 'Network error'
    );
  }
};

// Update project
export const updateProject = async (projectId: number, projectData: Partial<Project>): Promise<Project> => {
  try {
    // Map the field names to match the backend expectations
    const mappedData: any = {};
    if (projectData.Name !== undefined) mappedData.name = projectData.Name;
    if (projectData.Location !== undefined) mappedData.location = projectData.Location;
    if (projectData.Status !== undefined) mappedData.status = projectData.Status;
    if (projectData.PercentComplete !== undefined) mappedData.progress = projectData.PercentComplete;
    if (projectData.PlannedStartDate !== undefined) mappedData.planStart = projectData.PlannedStartDate;
    if (projectData.PlannedFinishDate !== undefined) mappedData.planEnd = projectData.PlannedFinishDate;
    if (projectData.ActualStartDate !== undefined) mappedData.actualStart = projectData.ActualStartDate;
    if (projectData.ActualFinishDate !== undefined) mappedData.actualEnd = projectData.ActualFinishDate;

    const response = await apiClient.put<Project>(`/projects/${projectId}`, mappedData);

    // Map the response back to Oracle P6 style
    const oracleP6Project: Project = {
      ObjectId: response.data.ObjectId,
      Name: response.data.Name,
      Location: response.data.Location,
      Status: response.data.Status,
      PercentComplete: response.data.PercentComplete,
      PlannedStartDate: response.data.PlannedStartDate,
      PlannedFinishDate: response.data.PlannedFinishDate,
      ActualStartDate: response.data.ActualStartDate,
      ActualFinishDate: response.data.ActualFinishDate
    };

    return oracleP6Project;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to update project'
        : 'Network error'
    );
  }
};

// Get assigned projects for supervisor
export const getAssignedProjects = async (): Promise<Project[]> => {
  try {
    const response = await apiClient.get<Project[]>('/project-assignment/assigned');
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to fetch assigned projects'
        : 'Network error'
    );
  }
};

// Get assigned projects for a specific user (PMAG only)
export const getProjectsForUser = async (userId: number): Promise<Project[]> => {
  try {
    const response = await apiClient.get<Project[]>(`/project-assignment/user/${userId}/projects`);
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to fetch user projects'
        : 'Network error'
    );
  }
};

// Get all projects for assignment (PMAG and Site PM only) - used in dropdowns when assigning projects
export const getAllProjectsForAssignment = async (): Promise<Project[]> => {
  try {
    const response = await apiClient.get<Project[]>('/projects/all-for-assignment');
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to fetch projects for assignment'
        : 'Network error'
    );
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
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to assign project'
        : 'Network error'
    );
  }
};

// Get supervisors for a project (PMAG only)
export const getProjectSupervisors = async (projectId: number): Promise<Supervisor[]> => {
  try {
    const response = await apiClient.get<Supervisor[]>(`/project-assignment/project/${projectId}/supervisors`);
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to fetch project supervisors'
        : 'Network error'
    );
  }
};

// Get Site PMs for a project (PMAG only)
export const getProjectSitePMs = async (projectId: number): Promise<Supervisor[]> => {
  try {
    const response = await apiClient.get<Supervisor[]>(`/project-assignment/project/${projectId}/sitepms`);
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to fetch project Site PMs'
        : 'Network error'
    );
  }
};

// Unassign project from supervisor (PMAG only)
export const unassignProjectFromSupervisor = async (projectId: number, supervisorId: number): Promise<any> => {
  try {
    const response = await apiClient.post('/project-assignment/unassign', {
      projectId: projectId,
      supervisorId: supervisorId
    });
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to unassign project'
        : 'Network error'
    );
  }
};

// Assign project to multiple supervisors
export const assignProjectToMultipleSupervisors = async (projectId: number, supervisorIds: number[], sheetTypes: string[] = []): Promise<any> => {
  try {
    const response = await apiClient.post('/project-assignment/assign-multiple', {
      projectId: projectId,
      supervisorIds: supervisorIds,
      sheetTypes: sheetTypes
    });
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to assign project to multiple users'
        : 'Network error'
    );
  }
};

// Assign multiple projects to multiple supervisors
export const assignProjectsToMultipleSupervisors = async (projectIds: number[], supervisorIds: number[], sheetTypes: string[] = []): Promise<any> => {
  try {
    const response = await apiClient.post('/project-assignment/assign-projects-multiple', {
      projectIds: projectIds,
      supervisorIds: supervisorIds,
      sheetTypes: sheetTypes
    });
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to assign multiple projects to multiple users'
        : 'Network error'
    );
  }
};


