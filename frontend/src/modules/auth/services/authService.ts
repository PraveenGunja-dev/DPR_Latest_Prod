import axios from 'axios';
import apiClient from '../../../services/apiClient';

// Define types for Oracle P6 style API responses
export interface User {
  ObjectId: number;
  Name: string;
  Email: string;
  Role: 'supervisor' | 'Site PM' | 'PMAG' | 'Super Admin' | 'pending_approval';
  password?: string;
}

export interface Supervisor {
  ObjectId: number;
  Name: string;
  Email: string;
  Role: 'supervisor';
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  sessionId?: string;
  loginStatus?: string;
}

export interface SSOAuthResponse {
  message: string;
  status: 'authenticated' | 'pending_approval' | 'inactive';
  isNewUser?: boolean;
  accessToken?: string;
  refreshToken?: string;
  user: User;
  accessRequest?: AccessRequest | null;
}

export interface AccessRequest {
  id: number;
  user_id?: number;
  requested_role: string;
  justification?: string;
  status: 'pending' | 'approved' | 'rejected';
  user_name?: string;
  user_email?: string;
  reviewer_name?: string;
  review_notes?: string;
  created_at: string;
  reviewed_at?: string;
}

// Normalize user data from different API responses to Oracle P6 style
const normalizeUser = (userData: any): User => {
  // Handle standard response (snake_case)
  if (userData.user_id !== undefined) {
    let normalizedRole: User['Role'] = 'supervisor'; // default
    if (userData.role) {
      const roleStr = userData.role.toString().trim().toLowerCase();
      if (roleStr === 'supervisor') normalizedRole = 'supervisor';
      else if (roleStr === 'site pm' || roleStr === 'sitepm') normalizedRole = 'Site PM';
      else if (roleStr === 'pmag') normalizedRole = 'PMAG';
      else if (roleStr === 'super admin') normalizedRole = 'Super Admin';
      else if (roleStr === 'pending_approval') normalizedRole = 'pending_approval';
    }
    return {
      ObjectId: userData.user_id,
      Name: userData.name,
      Email: userData.email,
      Role: normalizedRole
    };
  }
  // Handle Oracle P6 style response (PascalCase)
  if (userData.ObjectId !== undefined) return userData;
  return userData;
};

// Register a new user
export const registerUser = async (userData: Omit<User, 'ObjectId'>): Promise<AuthResponse> => {
  try {
    const response = await apiClient.post<AuthResponse>('/auth/register', {
      name: userData.Name,
      email: userData.Email,
      password: userData.password,
      role: userData.Role
    });
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Registration failed'
        : 'Network error'
    );
  }
};

// Login user
export const loginUser = async (credentials: LoginCredentials): Promise<AuthResponse> => {
  try {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Login failed'
        : 'Network error'
    );
  }
};

// SSO Login - Azure AD
export const ssoLogin = async (idToken: string, accessToken: string): Promise<SSOAuthResponse> => {
  try {
    const response = await apiClient.post<SSOAuthResponse>('/sso/azure-login', {
      idToken,
      accessToken,
    });
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'SSO login failed'
        : 'Network error'
    );
  }
};

// Request Access (for pending SSO users)
export const requestAccess = async (userId: number, requestedRole: string, justification: string): Promise<{ message: string; accessRequest: AccessRequest }> => {
  try {
    const response = await apiClient.post('/sso/request-access', {
      userId,
      requestedRole,
      justification,
    });
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Access request failed'
        : 'Network error'
    );
  }
};

// Get Access Requests (Super Admin)
export const getAccessRequests = async (status?: string): Promise<AccessRequest[]> => {
  try {
    const params = status ? { status } : {};
    const response = await apiClient.get('/sso/access-requests', { params });
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to fetch access requests'
        : 'Network error'
    );
  }
};

// Process Access Request (Super Admin)
export const processAccessRequest = async (
  requestId: number,
  action: 'approve' | 'reject',
  role?: string,
  reviewNotes?: string
): Promise<any> => {
  try {
    const response = await apiClient.put(`/sso/access-requests/${requestId}`, {
      action,
      role,
      reviewNotes,
    });
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to process access request'
        : 'Network error'
    );
  }
};

// Get pending access request count
export const getAccessRequestCount = async (): Promise<number> => {
  try {
    const response = await apiClient.get('/sso/access-requests/count');
    return response.data.count;
  } catch (error) {
    return 0;
  }
};

// Logout user
export const logoutUser = async (refreshToken: string): Promise<void> => {
  try {
    await apiClient.post('/auth/logout', { refreshToken });
  } catch (error) {
    console.error('Logout error:', error);
  }
};

// Get user profile
export const getUserProfile = async (): Promise<User> => {
  try {
    const response = await apiClient.get<AuthResponse>('/auth/profile');
    return normalizeUser(response.data.user);
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to fetch profile'
        : 'Network error'
    );
  }
};

// Get all supervisors (PMAG only)
export const getAllSupervisors = async (): Promise<Supervisor[]> => {
  try {
    const response = await apiClient.get<Supervisor[]>('/auth/supervisors');
    return response.data.map(normalizeUser) as Supervisor[];
  } catch (error) {
    console.error("Error fetching supervisors:", error);
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to fetch supervisors'
        : 'Network error'
    );
  }
};

// Get all Site PMs (PMAG only)
export const getAllSitePMs = async (): Promise<User[]> => {
  try {
    const response = await apiClient.get<User[]>('/auth/sitepms');
    return response.data.map(normalizeUser) as User[];
  } catch (error) {
    console.error("Error fetching Site PMs:", error);
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to fetch Site PMs'
        : 'Network error'
    );
  }
};

// Refresh token function
export const refreshAccessToken = async (refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> => {
  try {
    const response = await apiClient.post('/auth/refresh-token', { refreshToken });
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to refresh token'
        : 'Network error'
    );
  }
};
