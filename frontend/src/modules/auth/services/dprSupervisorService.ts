// src/modules/auth/services/dprSupervisorService.ts
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
export const getDraftEntry = async (projectId: number, sheetType: string, date?: string) => {
  const params: any = { projectId, sheetType };
  if (date) params.date = date;

  const response = await apiClient.get('/dpr-supervisor/draft', { params });
  return response.data;
};

export const saveDraftEntry = async (entryId: number, data: any) => {
  const response = await apiClient.post('/dpr-supervisor/save-draft',
    { entryId, data }
  );
  return response.data;
};

export const submitEntry = async (entryId: number, editReason?: string) => {
  const payload: any = { entryId };
  if (editReason) payload.editReason = editReason;

  const response = await apiClient.post('/dpr-supervisor/submit', payload);
  return response.data;
};

// PM APIs - Oracle P6 compatible naming
export const getEntriesForPMReview = async (projectId?: number) => {
  const params = projectId ? { projectId } : {};
  const response = await apiClient.get('/dpr-supervisor/pm/entries', {
    params
  });
  return response.data;
};

export const approveEntryByPM = async (entryId: number) => {
  const response = await apiClient.post('/dpr-supervisor/pm/approve',
    { entryId }
  );
  return response.data;
};

export const updateEntryByPM = async (entryId: number, data: any) => {
  const response = await apiClient.put('/dpr-supervisor/pm/update',
    { entryId, data }
  );
  return response.data;
};

export const rejectEntryByPM = async (entryId: number, rejectionReason?: string) => {
  const response = await apiClient.post('/dpr-supervisor/pm/reject',
    { entryId, rejectionReason }
  );
  return response.data;
};

export const rejectEntryByPMAG = async (entryId: number, rejectionReason?: string) => {
  const response = await apiClient.post('/dpr-supervisor/pmag/reject',
    { entryId, rejectionReason }
  );
  return response.data;
};

// Common APIs - Oracle P6 compatible naming
export const getEntryById = async (entryId: number) => {
  const response = await apiClient.get(`/dpr-supervisor/entry/${entryId}`);
  return response.data;
};

// PMAG APIs - Oracle P6 compatible naming
export const getEntriesForPMAGReview = async (projectId?: number) => {
  const params = projectId ? { projectId } : {};
  const response = await apiClient.get('/dpr-supervisor/pmag/entries', {
    params
  });
  return response.data;
};

export const getEntriesHistoryForPMAG = async (projectId?: number, days?: number) => {
  const params: any = {};
  if (projectId) params.projectId = projectId;
  if (days) params.days = days;

  const response = await apiClient.get('/dpr-supervisor/pmag/history', {
    params
  });
  return response.data;
};

export const getArchivedEntriesForPMAG = async (projectId?: number) => {
  const params = projectId ? { projectId } : {};
  const response = await apiClient.get('/dpr-supervisor/pmag/archived', {
    params
  });
  return response.data;
};

export const finalApproveByPMAG = async (entryId: number) => {
  const response = await apiClient.post('/dpr-supervisor/pmag/approve',
    { entryId }
  );
  return response.data;
};

export const rejectEntryByPMAGWithoutReason = async (entryId: number) => {
  const response = await apiClient.post('/dpr-supervisor/pmag/reject',
    { entryId }
  );
  return response.data;
};
