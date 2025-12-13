import axios from 'axios';

// Define types for Oracle P6 style API responses
export interface User {
  ObjectId: number;
  Name: string;
  Email: string;
  Role: 'supervisor' | 'Site PM' | 'PMAG' | 'Super Admin';
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

// Get API base URL from environment variables
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Set auth token for API requests
export const setAuthToken = (token: string | null) => {
  if (token) {
    console.log("Setting auth token for authService"); // Debug log
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    console.log("Clearing auth token for authService"); // Debug log
    delete api.defaults.headers.common['Authorization'];
  }
};

// Normalize user data from different API responses to Oracle P6 style
const normalizeUser = (userData: any): User => {
  // Handle standard response (snake_case)
  if (userData.user_id !== undefined) {
    // Normalize role to ensure it matches expected values
    let normalizedRole: 'supervisor' | 'Site PM' | 'PMAG' = 'supervisor'; // default
    if (userData.role) {
      const roleStr = userData.role.toString().trim().toLowerCase();
      if (roleStr === 'supervisor') {
        normalizedRole = 'supervisor';
      } else if (roleStr === 'site pm' || roleStr === 'sitepm') {
        normalizedRole = 'Site PM';
      } else if (roleStr === 'pmag') {
        normalizedRole = 'PMAG';
      }
    }
    
    return {
      ObjectId: userData.user_id,
      Name: userData.name,
      Email: userData.email,
      Role: normalizedRole
    };
  }
  
  // Handle Oracle P6 style response (PascalCase) - already in correct format
  if (userData.ObjectId !== undefined) {
    return userData;
  }
  
  // Fallback - assume it's already in the correct format
  return userData;
};

// Register a new user
export const registerUser = async (userData: Omit<User, 'ObjectId'>): Promise<AuthResponse> => {
  try {
    const response = await api.post<AuthResponse>('/api/auth/register', {
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
    const response = await api.post<AuthResponse>('/api/auth/login', credentials);
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Login failed'
        : 'Network error'
    );
  }
};

// Logout user
export const logoutUser = async (refreshToken: string): Promise<void> => {
  try {
    await api.post('/api/auth/logout', { refreshToken });
  } catch (error) {
    // Even if logout fails, we still want to clear local storage
    console.error('Logout error:', error);
  }
};

// Get user profile
export const getUserProfile = async (): Promise<User> => {
  try {
    console.log("Fetching user profile with headers:", api.defaults.headers); // Debug log
    const response = await api.get<AuthResponse>('/api/auth/profile');
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
    console.log("Fetching supervisors with headers:", api.defaults.headers); // Debug log
    const response = await api.get<Supervisor[]>('/api/auth/supervisors');
    console.log("Supervisors response:", response.data); // Debug log
    return response.data.map(normalizeUser) as Supervisor[];
  } catch (error) {
    console.error("Error fetching supervisors:", error); // Debug log
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to fetch supervisors'
        : 'Network error'
    );
  }
};

// Refresh token function
export const refreshAccessToken = async (refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> => {
  try {
    const response = await api.post('/api/auth/refresh-token', { refreshToken });
    return response.data;
  } catch (error) {
    throw new Error(
      axios.isAxiosError(error) && error.response
        ? error.response.data.message || 'Failed to refresh token'
        : 'Network error'
    );
  }
};
