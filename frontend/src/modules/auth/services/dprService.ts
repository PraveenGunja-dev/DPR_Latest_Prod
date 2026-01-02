// src/modules/auth/services/dprService.ts
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';

// Helper to get auth token
const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

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
  const response = await axios.get(`${API_URL}/api/dpr/draft`, {
    params: { projectId, sheetType },
    headers: getAuthHeader()
  });
  return response.data;
};

export const saveDraftSheet = async (sheetId: number, sheetData: any) => {
  const response = await axios.post(`${API_URL}/api/dpr/save-draft`,
    { sheetId, sheetData },
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const submitSheet = async (sheetId: number) => {
  const response = await axios.post(`${API_URL}/api/dpr/submit`,
    { sheetId },
    { headers: getAuthHeader() }
  );
  return response.data;
};

// PM APIs
export const getSheetsForPMReview = async (projectId?: number) => {
  const params = projectId ? { projectId } : {};
  const response = await axios.get(`${API_URL}/api/dpr/pm/sheets`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

export const updateSheetByPM = async (sheetId: number, sheetData: any) => {
  const response = await axios.put(`${API_URL}/api/dpr/pm/update`,
    { sheetId, sheetData },
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const approveSheetByPM = async (sheetId: number, comment?: string) => {
  const response = await axios.post(`${API_URL}/api/dpr/pm/approve`,
    { sheetId, comment },
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const rejectSheetByPM = async (sheetId: number, comment: string) => {
  const response = await axios.post(`${API_URL}/api/dpr/pm/reject`,
    { sheetId, comment },
    { headers: getAuthHeader() }
  );
  return response.data;
};

// PMAG APIs
export const getSheetsForPMAGReview = async (projectId?: number) => {
  const params = projectId ? { projectId } : {};
  const response = await axios.get(`${API_URL}/api/dpr/pmag/sheets`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

export const finalApprovalByPMAG = async (sheetId: number, comment?: string) => {
  const response = await axios.post(`${API_URL}/api/dpr/pmag/approve`,
    { sheetId, comment },
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const rejectByPMAG = async (sheetId: number, comment: string) => {
  const response = await axios.post(`${API_URL}/api/dpr/pmag/reject`,
    { sheetId, comment },
    { headers: getAuthHeader() }
  );
  return response.data;
};

// Common APIs
export const getSheetById = async (sheetId: number) => {
  const response = await axios.get(`${API_URL}/api/dpr/sheet/${sheetId}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const getSheetComments = async (sheetId: number) => {
  const response = await axios.get(`${API_URL}/api/dpr/sheet/${sheetId}/comments`, {
    headers: getAuthHeader()
  });
  return response.data;
};