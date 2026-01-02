// src/modules/pmag/services/pmagDashboardService.ts
import {
  getEntriesForPMAGReview,
  getEntriesHistoryForPMAG,
  getArchivedEntriesForPMAG,
  finalApproveByPMAG,
  rejectEntryByPMAG
} from "@/modules/auth/services/dprSupervisorService";
import { getUserProjects, createProject as createProjectService } from "@/modules/auth/services/projectService";
import { registerUser, getAllSupervisors } from "@/modules/auth/services/authService";
import { assignProjectsToMultipleSupervisors, assignProjectToSupervisor } from "@/modules/auth/services/projectService";
import { handleApiError, handleApiSuccess } from "@/services/shared";

import apiClient from "@/services/apiClient";

// Fetch approved entries from PM
export const fetchApprovedEntries = async () => {

  try {
    const entries = await getEntriesForPMAGReview();
    return entries;
  } catch (error: any) {
    handleApiError(error, "Failed to load approved sheets");
  }
};

// Fetch history entries with date filter
export const fetchHistoryEntries = async (days?: number | null) => {
  try {
    const entries = await getEntriesHistoryForPMAG(undefined, days || undefined);
    return entries;
  } catch (error: any) {
    handleApiError(error, "Failed to load history");
  }
};

// Fetch archived entries
export const fetchArchivedEntries = async () => {
  try {
    const entries = await getArchivedEntriesForPMAG();
    return entries;
  } catch (error: any) {
    handleApiError(error, "Failed to load archived entries");
  }
};

// Final approve entry by PMAG
export const finalApproveEntry = async (entryId: number) => {
  try {
    await finalApproveByPMAG(entryId);
    handleApiSuccess("Entry approved successfully!");
  } catch (error: any) {
    handleApiError(error, "Failed to approve entry");
  }
};

// Reject entry by PMAG
export const rejectEntry = async (entryId: number, rejectionReason?: string) => {
  try {
    await rejectEntryByPMAG(entryId, rejectionReason);
    handleApiSuccess("Entry rejected and sent back to PM");
  } catch (error: any) {
    handleApiError(error, "Failed to reject entry");
  }
};

// Fetch projects and supervisors
export const fetchData = async () => {
  try {
    // Fetch projects
    const projectsData = await getUserProjects();

    // Fetch supervisors from API
    const supervisorsData = await getAllSupervisors();

    return {
      projects: projectsData,
      supervisors: supervisorsData
    };
  } catch (error: any) {
    handleApiError(error, "Failed to fetch data");
  }
};

// Create project
export const createProject = async (projectData: any) => {
  try {
    const response = await createProjectService(projectData);
    handleApiSuccess("Project created successfully!");
    return response;
  } catch (error: any) {
    handleApiError(error, "Failed to create project");
  }
};

// Register user
export const registerNewUser = async (userData: any) => {
  try {
    const response = await registerUser(userData);
    handleApiSuccess("User registered successfully!");
    return response;
  } catch (error: any) {
    handleApiError(error, "Failed to register user");
  }
};

// Assign projects to multiple supervisors
export const assignMultipleProjects = async (projectIds: number[], supervisorIds: number[]) => {
  try {
    await assignProjectsToMultipleSupervisors(projectIds, supervisorIds);
    handleApiSuccess("Projects assigned successfully!");
  } catch (error: any) {
    handleApiError(error, "Failed to assign projects");
  }
};

// Assign project to supervisor
export const assignProject = async (projectId: number, supervisorId: number) => {
  try {
    await assignProjectToSupervisor(projectId, supervisorId);
    handleApiSuccess("Project assigned successfully!");
  } catch (error: any) {
    // Failed to assign project
    handleApiError(error, "Failed to assign project");
  }
};

// Push entry to P6
export const pushEntryToP6 = async (entryId: number) => {
  try {
    const response = await apiClient.post(`/api/oracle-p6/push-entry/${entryId}`);
    handleApiSuccess("Entry successfully pushed to P6!");
    return response.data;
  } catch (error: any) {
    handleApiError(error, "Failed to push entry to P6");
    throw error;
  }
};
