// src/services/masterGroupService.ts
//
// Master Project Groups (SuperAdmin bulk-assignment). A named group of projects (Master Solar,
// Master Wind, ...) that can be bulk-assigned to a user in one action. See the backend's
// app/routers/super_admin.py (the "Master Project Groups" section) and
// app/migrations.py (_seed_master_project_groups) for the schema and default seed data.

import apiClient from "./apiClient";

export interface MasterGroup {
  id: number;
  name: string;
  category: string;
  created_at: string;
  updated_at: string;
  projectCount: number;
}

export interface MasterGroupProject {
  id: number;
  name: string;
  status: string | null;
}

export type AssignMode = "reset" | "add";

export interface AssignMasterGroupUserResult {
  userId: number;
  userName: string;
  removedPriorAssignments: number;
  assigned: number;
}

export interface AssignMasterGroupResult {
  message: string;
  mode: AssignMode;
  totalInGroup: number;
  totalRemovedPriorAssignments: number;
  totalAssigned: number;
  perUser: AssignMasterGroupUserResult[];
  missingUserIds: number[];
}

export const listMasterGroups = async (): Promise<MasterGroup[]> => {
  const { data } = await apiClient.get("/super-admin/master-groups");
  return data.groups || [];
};

export const createMasterGroup = async (name: string, category: string): Promise<MasterGroup> => {
  const { data } = await apiClient.post("/super-admin/master-groups", { name, category });
  return data;
};

export const renameMasterGroup = async (
  groupId: number,
  updates: { name?: string; category?: string }
): Promise<MasterGroup> => {
  const { data } = await apiClient.put(`/super-admin/master-groups/${groupId}`, updates);
  return data;
};

export const deleteMasterGroup = async (groupId: number): Promise<void> => {
  await apiClient.delete(`/super-admin/master-groups/${groupId}`);
};

export const getMasterGroupProjects = async (
  groupId: number
): Promise<{ group: MasterGroup; projects: MasterGroupProject[] }> => {
  const { data } = await apiClient.get(`/super-admin/master-groups/${groupId}/projects`);
  return data;
};

export const addMasterGroupProjects = async (
  groupId: number,
  projectIds: number[]
): Promise<{ message: string; added: number }> => {
  const { data } = await apiClient.post(`/super-admin/master-groups/${groupId}/projects/add`, { projectIds });
  return data;
};

export const removeMasterGroupProjects = async (
  groupId: number,
  projectIds: number[]
): Promise<{ message: string }> => {
  const { data } = await apiClient.post(`/super-admin/master-groups/${groupId}/projects/remove`, { projectIds });
  return data;
};

export const assignMasterGroup = async (
  groupId: number,
  userIds: number[],
  mode: AssignMode
): Promise<AssignMasterGroupResult> => {
  const { data } = await apiClient.post(`/super-admin/master-groups/${groupId}/assign`, { userIds, mode });
  return data;
};
