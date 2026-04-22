// src/services/userService.ts
import apiClient from './apiClient';
import { 
    User, 
    LoginCredentials, 
    AuthResponse, 
    SSOAuthResponse, 
    AccessRequest, 
    Supervisor 
} from '@/types';
import axios from 'axios';

/**
 * Handle API errors consistently
 */
const handleApiError = (error: any, defaultMessage: string) => {
    if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data.message || defaultMessage);
    }
    throw new Error('Network error');
};

/**
 * Normalize backend user structure to application user structure
 */
export const normalizeUser = (userData: any): User => {
    // Backend uses user_id, UI sometimes uses userId or ObjectId (P6 compat)
    const userId = userData.user_id || userData.userId || userData.ObjectId;
    const name = userData.name || userData.Name;
    const email = userData.email || userData.Email;
    const role = userData.role || userData.Role;

    return {
        userId: Number(userId),
        ObjectId: Number(userId),
        name: name,
        Name: name,
        email: email,
        Email: email,
        role: role,
        Role: role,
        is_active: userData.is_active,
        sheetTypes: userData.sheetTypes || userData.sheet_types || [],
        SheetTypes: userData.sheetTypes || userData.sheet_types || [],
    };
};

export const loginUser = async (credentials: LoginCredentials): Promise<AuthResponse> => {
    try {
        const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Login failed');
    }
};

export const registerUser = async (userData: any): Promise<AuthResponse> => {
    try {
        const response = await apiClient.post<AuthResponse>('/auth/register', userData);
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Registration failed');
    }
};

export const ssoLogin = async (idToken: string, accessToken: string): Promise<SSOAuthResponse> => {
    try {
        const response = await apiClient.post<SSOAuthResponse>('/sso/azure-login', { idToken, accessToken });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'SSO login failed');
    }
};

export const logoutUser = async (refreshToken: string): Promise<void> => {
    try {
        await apiClient.post('/auth/logout', { refreshToken });
    } catch (error) {
        console.error('Logout error:', error);
    }
};

export const getUserProfile = async (): Promise<User> => {
    try {
        const response = await apiClient.get<any>('/auth/profile');
        // Extract from nested { user: ... } if present
        const user = response.data.user || response.data;
        return normalizeUser(user);
    } catch (error) {
        return handleApiError(error, 'Failed to fetch profile');
    }
};

export const getAllSupervisors = async (): Promise<Supervisor[]> => {
    try {
        const response = await apiClient.get<any[]>('/auth/supervisors');
        return response.data.map(normalizeUser) as Supervisor[];
    } catch (error) {
        return handleApiError(error, 'Failed to fetch supervisors');
    }
};

export const getAllSitePMs = async (): Promise<User[]> => {
    try {
        const response = await apiClient.get<any[]>('/auth/sitepms');
        return response.data.map(normalizeUser);
    } catch (error) {
        return handleApiError(error, 'Failed to fetch Site PMs');
    }
};

export const getAllPMAGs = async (): Promise<User[]> => {
    try {
        const response = await apiClient.get<any[]>('/auth/pmags');
        return response.data.map(normalizeUser);
    } catch (error) {
        return handleApiError(error, 'Failed to fetch PMAGs');
    }
};

export const getAccessRequests = async (status?: string): Promise<AccessRequest[]> => {
    try {
        const params = status ? { status } : {};
        const response = await apiClient.get<AccessRequest[]>('/sso/access-requests', { params });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to fetch access requests');
    }
};

export const processAccessRequest = async (requestId: number, action: string, role?: string, reviewNotes?: string): Promise<any> => {
    try {
        const response = await apiClient.put(`/sso/access-requests/${requestId}`, { action, role, reviewNotes });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to process access request');
    }
};

export const getAccessRequestCount = async (): Promise<number> => {
    try {
        const response = await apiClient.get<{ count: number }>('/sso/access-requests/count');
        return response.data.count;
    } catch (error) {
        return 0;
    }
};

export const requestAccess = async (userId: number, requestedRole: string, justification?: string): Promise<any> => {
    try {
        const response = await apiClient.post('/sso/request-access', { userId, requestedRole, justification });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to submit access request');
    }
};

export const checkAccessStatus = async (userId: number): Promise<{ role: string; isActive: boolean }> => {
    try {
        const response = await apiClient.get(`/sso/status/${userId}`);
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to check access status');
    }
};

export const refreshAccessToken = async (refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> => {
    try {
        const response = await apiClient.post('/auth/refresh-token', { refreshToken });
        return response.data;
    } catch (error) {
        return handleApiError(error, 'Failed to refresh token');
    }
};
