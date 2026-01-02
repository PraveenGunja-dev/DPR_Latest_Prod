// src/modules/auth/services/dprSupervisorService.ts
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';

// Add axios interceptor for debugging
axios.interceptors.request.use(
  (config) => {
    console.log('Axios Request:', config.method?.toUpperCase(), config.url, config.params);
    return config;
  },
  (error) => {
    console.error('Axios Request Error:', error);
    return Promise.reject(error);
  }
);

axios.interceptors.response.use(
  (response) => {
    console.log('Axios Response:', response.status, response.config.url, 'Data length:', Array.isArray(response.data) ? response.data.length : 'N/A');
    return response;
  },
  (error) => {
    console.error('Axios Response Error:', error.response?.status, error.response?.data || error.message);
    return Promise.reject(error);
  }
);

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

// Helper function to check if an entry is locked (submitted within the last 2 days)
export const isEntryLocked = (entry: any): boolean => {
  if (!entry || !entry.status || !entry.submitted_at) {
    return false;
  }

  // Only submitted entries can be locked
  if (entry.status !== 'submitted_to_pm') {
    return false;
  }

  // Check if submitted within the last 2 days
  const submittedDate = new Date(entry.submitted_at);
  const now = new Date();
  const timeDiff = now.getTime() - submittedDate.getTime();
  const daysDiff = timeDiff / (1000 * 3600 * 24);

  // Lock for 2 days
  return daysDiff < 2;
};

// Supervisor APIs - Oracle P6 compatible naming
export const getDraftEntry = async (projectId: number, sheetType: string) => {
  const response = await axios.get(`${API_URL}/api/dpr-supervisor/draft`, {
    params: { projectId, sheetType },
    headers: getAuthHeader()
  });
  return response.data;
};

export const saveDraftEntry = async (entryId: number, data: any) => {
  const response = await axios.post(`${API_URL}/api/dpr-supervisor/save-draft`,
    { entryId, data },
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const submitEntry = async (entryId: number) => {
  const response = await axios.post(`${API_URL}/api/dpr-supervisor/submit`,
    { entryId },
    { headers: getAuthHeader() }
  );
  return response.data;
};

// PM APIs - Oracle P6 compatible naming
export const getEntriesForPMReview = async (projectId?: number) => {
  const params = projectId ? { projectId } : {};
  console.log('API Service: Fetching PM entries with params:', params);
  console.log('API Service: projectId value:', projectId);
  console.log('API Service: Using token:', localStorage.getItem('token') ? 'Token exists' : 'No token');

  const response = await axios.get(`${API_URL}/api/dpr-supervisor/pm/entries`, {
    params,
    headers: getAuthHeader()
  });

  console.log('API Service: Received response:', response.data);
  return response.data;
};

export const approveEntryByPM = async (entryId: number) => {
  const response = await axios.post(`${API_URL}/api/dpr-supervisor/pm/approve`,
    { entryId },
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const updateEntryByPM = async (entryId: number, data: any) => {
  const response = await axios.put(`${API_URL}/api/dpr-supervisor/pm/update`,
    { entryId, data },
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const rejectEntryByPM = async (entryId: number, rejectionReason?: string) => {
  const response = await axios.post(`${API_URL}/api/dpr-supervisor/pm/reject`,
    { entryId, rejectionReason },
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const rejectEntryByPMAG = async (entryId: number, rejectionReason?: string) => {
  const response = await axios.post(`${API_URL}/api/dpr-supervisor/pmag/reject`,
    { entryId, rejectionReason },
    { headers: getAuthHeader() }
  );
  return response.data;
};

// Common APIs - Oracle P6 compatible naming
export const getEntryById = async (entryId: number) => {
  const response = await axios.get(`${API_URL}/api/dpr-supervisor/entry/${entryId}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

// PMAG APIs - Oracle P6 compatible naming
export const getEntriesForPMAGReview = async (projectId?: number) => {
  const params = projectId ? { projectId } : {};
  const response = await axios.get(`${API_URL}/api/dpr-supervisor/pmag/entries`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

export const getEntriesHistoryForPMAG = async (projectId?: number, days?: number) => {
  const params: any = {};
  if (projectId) params.projectId = projectId;
  if (days) params.days = days;

  const response = await axios.get(`${API_URL}/api/dpr-supervisor/pmag/history`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

export const getArchivedEntriesForPMAG = async (projectId?: number) => {
  const params = projectId ? { projectId } : {};
  const response = await axios.get(`${API_URL}/api/dpr-supervisor/pmag/archived`, {
    params,
    headers: getAuthHeader()
  });
  return response.data;
};

export const finalApproveByPMAG = async (entryId: number) => {
  const response = await axios.post(`${API_URL}/api/dpr-supervisor/pmag/approve`,
    { entryId },
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const rejectEntryByPMAGWithoutReason = async (entryId: number) => {
  const response = await axios.post(`${API_URL}/api/dpr-supervisor/pmag/reject`,
    { entryId },
    {
      headers: getAuthHeader()
    });
  return response.data;
};