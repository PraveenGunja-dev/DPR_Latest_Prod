// src/services/externalClientService.ts
//
// OAuth2 client-credentials for the External API (Super Admin management side). See
// app/services/external_client_service.py and POST /api/external/token on the backend - a
// client_id/client_secret pair authenticates as an existing 'External'-role user. The secret is
// returned once, at creation, and never again - not by list, not by any other call.

import apiClient from "./apiClient";

export interface ExternalApiClient {
  id: number;
  client_id: string;
  label: string | null;
  user_id: number;
  user_email: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface CreatedExternalApiClient {
  message: string;
  clientId: string;
  clientSecret: string;
  label: string | null;
  id: number;
}

export const listExternalClients = async (userId: number): Promise<ExternalApiClient[]> => {
  const { data } = await apiClient.get("/super-admin/external-clients", { params: { userId } });
  return data.clients || [];
};

export const createExternalClient = async (
  userId: number,
  label?: string
): Promise<CreatedExternalApiClient> => {
  const { data } = await apiClient.post("/super-admin/external-clients", { userId, label });
  return data;
};

export const revokeExternalClient = async (clientRowId: number): Promise<void> => {
  await apiClient.delete(`/super-admin/external-clients/${clientRowId}`);
};
