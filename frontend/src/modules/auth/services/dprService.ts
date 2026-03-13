// src/modules/auth/services/dprService.ts
import apiClient from '../../../services/apiClient';

// Get today and yesterday dates in local timezone (IST for India)
export const getTodayAndYesterday = () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Use toLocaleDateString with 'en-CA' locale to get YYYY-MM-DD format in local timezone
  return {
    today: today.toLocaleDateString('en-CA'),
    yesterday: yesterday.toLocaleDateString('en-CA')
  };
};

// Supervisor APIs
export const getDraftSheet = async (projectId: number, sheetType: string) => {
  const response = await apiClient.get('/dpr/draft', {
    params: { projectId, sheetType }
  });
  return response.data;
};

export const saveDraftSheet = async (sheetId: number, sheetData: any) => {
  const response = await apiClient.post('/dpr/save-draft',
    { sheetId, sheetData }
  );
  return response.data;
};

export const submitSheet = async (sheetId: number) => {
  const response = await apiClient.post('/dpr/submit',
    { sheetId }
  );
  return response.data;
};

// PM APIs
export const getSheetsForPMReview = async (projectId?: number) => {
  const params = projectId ? { projectId } : {};
  const response = await apiClient.get('/dpr/pm/sheets', {
    params
  });
  return response.data;
};

export const updateSheetByPM = async (sheetId: number, sheetData: any) => {
  const response = await apiClient.put('/dpr/pm/update',
    { sheetId, sheetData }
  );
  return response.data;
};

export const approveSheetByPM = async (sheetId: number, comment?: string) => {
  const response = await apiClient.post('/dpr/pm/approve',
    { sheetId, comment }
  );
  return response.data;
};

export const rejectSheetByPM = async (sheetId: number, comment: string) => {
  const response = await apiClient.post('/dpr/pm/reject',
    { sheetId, comment }
  );
  return response.data;
};

// PMAG APIs
export const getSheetsForPMAGReview = async (projectId?: number) => {
  const params = projectId ? { projectId } : {};
  const response = await apiClient.get('/dpr/pmag/sheets', {
    params
  });
  return response.data;
};

export const finalApprovalByPMAG = async (sheetId: number, comment?: string) => {
  const response = await apiClient.post('/dpr/pmag/approve',
    { sheetId, comment }
  );
  return response.data;
};

export const rejectByPMAG = async (sheetId: number, comment: string) => {
  const response = await apiClient.post('/dpr/pmag/reject',
    { sheetId, comment }
  );
  return response.data;
};

// Common APIs
export const getSheetById = async (sheetId: number) => {
  const response = await apiClient.get(`/dpr/sheet/${sheetId}`);
  return response.data;
};

export const getSheetComments = async (sheetId: number) => {
  const response = await apiClient.get(`/dpr/sheet/${sheetId}/comments`);
  return response.data;
};
