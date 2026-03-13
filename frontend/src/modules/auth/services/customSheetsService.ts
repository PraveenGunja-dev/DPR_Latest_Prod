import apiClient from '../../../services/apiClient';

// Custom Sheets Management APIs
export const createCustomSheet = async (projectId: number, name: string, description: string, columns: any[]) => {
  const response = await apiClient.post('/custom-sheets',
    { projectId, name, description, columns }
  );
  return response.data;
};

export const getCustomSheets = async (projectId: number) => {
  const response = await apiClient.get('/custom-sheets', {
    params: { projectId }
  });
  return response.data;
};

export const getCustomSheetById = async (sheetId: number) => {
  const response = await apiClient.get(`/custom-sheets/${sheetId}`);
  return response.data;
};

export const updateCustomSheet = async (sheetId: number, name: string, description: string, columns: any[]) => {
  const response = await apiClient.put(`/custom-sheets/${sheetId}`,
    { name, description, columns }
  );
  return response.data;
};

export const deleteCustomSheet = async (sheetId: number) => {
  const response = await apiClient.delete(`/custom-sheets/${sheetId}`);
  return response.data;
};

export const addColumnToSheet = async (sheetId: number, column: any) => {
  const response = await apiClient.post(`/custom-sheets/${sheetId}/columns`,
    column
  );
  return response.data;
};

export const removeColumnFromSheet = async (sheetId: number, columnId: number) => {
  const response = await apiClient.delete(`/custom-sheets/${sheetId}/columns/${columnId}`);
  return response.data;
};

// Custom Sheet Entries APIs
export const getCustomSheetDraftEntry = async (sheetId: number, projectId: number) => {
  const response = await apiClient.get('/custom-sheets/entries/draft', {
    params: { sheetId, projectId }
  });
  return response.data;
};

export const saveCustomSheetDraftEntry = async (entryId: number, data: any) => {
  const response = await apiClient.post('/custom-sheets/entries/save-draft',
    { entryId, data }
  );
  return response.data;
};

export const submitCustomSheetEntry = async (entryId: number) => {
  const response = await apiClient.post('/custom-sheets/entries/submit',
    { entryId }
  );
  return response.data;
};
