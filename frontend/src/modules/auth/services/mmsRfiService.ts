import apiClient from '../../../services/apiClient';

// Dynamic Columns Management APIs
export const addMmsRfiDynamicColumn = async (projectId: number, columnName: string, displayName: string, dataType: string, isRequired: boolean, defaultValue: string) => {
  const response = await apiClient.post('/mms-rfi/dynamic-columns',
    { projectId, columnName, displayName, dataType, isRequired, defaultValue }
  );
  return response.data;
};

export const getMmsRfiDynamicColumns = async (projectId: number) => {
  const response = await apiClient.get('/mms-rfi/dynamic-columns', {
    params: { projectId }
  });
  return response.data;
};

export const updateMmsRfiDynamicColumn = async (columnId: number, displayName: string, dataType: string, isRequired: boolean, defaultValue: string) => {
  const response = await apiClient.put(`/mms-rfi/dynamic-columns/${columnId}`,
    { displayName, dataType, isRequired, defaultValue }
  );
  return response.data;
};

export const deleteMmsRfiDynamicColumn = async (columnId: number) => {
  const response = await apiClient.delete(`/mms-rfi/dynamic-columns/${columnId}`);
  return response.data;
};

// MMS & RFI Entries APIs
export const getMmsRfiDraftEntry = async (projectId: number) => {
  const response = await apiClient.get('/mms-rfi/entries/draft', {
    params: { projectId }
  });
  return response.data;
};

export const saveMmsRfiDraftEntry = async (entryId: number, data: any) => {
  const response = await apiClient.post('/mms-rfi/entries/save-draft',
    { entryId, data }
  );
  return response.data;
};

export const submitMmsRfiEntry = async (entryId: number) => {
  const response = await apiClient.post('/mms-rfi/entries/submit',
    { entryId }
  );
  return response.data;
};
