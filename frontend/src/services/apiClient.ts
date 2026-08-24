// src/services/apiClient.ts
// Centralized axios instance with automatic token refresh

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';

const base = import.meta.env.BASE_URL || '/';
const API_URL = import.meta.env.VITE_API_BASE_URL || (base.endsWith('/') ? `${base}api/` : `${base}/api/`);

console.log('[ApiClient] Configured API_URL:', API_URL);

/**
 * Absolute (or root-relative) base URL of the backend API, without a trailing slash.
 * Use this for full-page browser navigations such as the SSO redirect, which cannot
 * go through axios. In Azure this resolves to the backend App Service
 * (VITE_API_BASE_URL), never to the frontend host.
 */
export const API_BASE_URL = API_URL.replace(/\/+$/, '');

// Create axios instance
const apiClient = axios.create({
    baseURL: API_URL,
    timeout: 120000, // 120 second timeout
    headers: {
        'Content-Type': 'application/json'
    }
});

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
// Queue of failed requests to retry after token refresh
let failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: Error) => void;
}> = [];

// Process queued requests after token refresh
const processQueue = (error: Error | null, token: string | null = null) => {
    failedQueue.forEach(promise => {
        if (error) {
            promise.reject(error);
        } else {
            promise.resolve(token!);
        }
    });
    failedQueue = [];
};

// Request interceptor - add auth token to all requests
apiClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        // Fix: remove leading slash from URL if baseURL is present
        // This ensures the URL is appended to baseURL instead of being treated as absolute-to-host
        if (config.url && config.url.startsWith('/') && config.baseURL) {
            config.url = config.url.substring(1);
        }

        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor - handle 401 errors and refresh token
apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // If no config or already retried, reject
        if (!originalRequest || originalRequest._retry) {
            return Promise.reject(error);
        }

        // Handle 401 Unauthorized errors
        if (error.response?.status === 401) {
            // Detailed logging for 401s
            console.warn(`[ApiClient] 401 Unauthorized: ${originalRequest.method?.toUpperCase()} ${originalRequest.url}`);

            // Ignore 401s from auth endpoints that handle their own errors
            const isAuthRoute = originalRequest.url?.includes('auth/login') ||
                originalRequest.url?.includes('auth/register') ||
                originalRequest.url?.includes('auth/sso') ||
                originalRequest.url?.includes('sso/initiate') ||
                originalRequest.url?.includes('sso/callback');

            if (isAuthRoute) {
                console.log('[ApiClient] Auth/SSO route 401 - rejecting without refresh');
                return Promise.reject(error);
            }

            // If already refreshing, queue this request
            if (isRefreshing) {
                console.log('[ApiClient] Already refreshing token, queuing request');
                return new Promise((resolve, reject) => {
                    failedQueue.push({
                        resolve: (token: string) => {
                            originalRequest.headers.Authorization = `Bearer ${token}`;
                            resolve(apiClient(originalRequest));
                        },
                        reject: (err: Error) => {
                            reject(err);
                        }
                    });
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const refreshToken = localStorage.getItem('refreshToken');

            if (!refreshToken) {
                // No refresh token, redirect to login
                console.warn('[ApiClient] No refresh token available, redirecting to login');
                isRefreshing = false;

                // Clear state
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('user');

                // Only redirect if NOT already on the landing page/login
                // Only redirect if NOT already on the landing page/login
                // This prevents infinite refresh loops
                const currentPath = window.location.pathname.replace(/\/$/, ''); // Remove trailing slash
                const basePath = base.replace(/\/$/, ''); // Remove trailing slash

                if (currentPath !== basePath && currentPath !== '/' && currentPath !== '') {
                    console.log(`[ApiClient] Redirecting to login from ${currentPath}`);
                    window.location.href = base;
                }
                return Promise.reject(error);
            }

            try {
                console.log('[ApiClient] Attempting token refresh...');
                // Call refresh token endpoint (avoid double slashes)
                const refreshUrl = API_URL.endsWith('/') 
                    ? `${API_URL}auth/refresh-token` 
                    : `${API_URL}/auth/refresh-token`;
                
                const response = await axios.post(refreshUrl, {
                    refreshToken
                });

                const { accessToken, refreshToken: newRefreshToken } = response.data;

                // Store new tokens
                localStorage.setItem('token', accessToken);
                localStorage.setItem('refreshToken', newRefreshToken);

                console.log('[ApiClient] Token refreshed successfully');

                // Process queued requests
                processQueue(null, accessToken);

                // Retry original request with new token
                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                return apiClient(originalRequest);
            } catch (refreshError: any) {
                // Refresh failed, redirect to login
                console.error('[ApiClient] Token refresh failed:', refreshError.response?.data || refreshError.message);
                processQueue(refreshError as Error);

                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('user');

                const currentPath = window.location.pathname.replace(/\/$/, ''); // Remove trailing slash
                const basePath = base.replace(/\/$/, ''); // Remove trailing slash

                if (currentPath !== basePath && currentPath !== '/' && currentPath !== '') {
                    console.log(`[ApiClient] Token refresh failed. Redirecting to login from ${currentPath}`);
                    window.location.href = base;
                }

                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        // Password lifecycle enforcement. The backend answers any gated route
        // with 403/423 and a machine code once an email user's password needs
        // attention, which is exactly what a direct API call or a hand-edited
        // URL would hit. Surface it as a redirect rather than a generic error
        // so the user lands on the screen that can actually resolve it.
        if (error.response && (error.response.status === 403 || error.response.status === 423)) {
            const detail: any = (error.response.data as any)?.detail ?? error.response.data;
            const code = typeof detail === 'object' ? detail?.code ?? detail?.error?.code : undefined;

            if (code === 'PASSWORD_CHANGE_REQUIRED' || code === 'PASSWORD_EXPIRED') {
                console.warn(`[ApiClient] Password lifecycle block: ${code}`);
                // The session is no longer usable; the user must re-authenticate
                // so the login endpoint can hand out a fresh challenge token.
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                if (!window.location.pathname.includes('/security/password-setup')) {
                    toast.warning(
                        code === 'PASSWORD_EXPIRED'
                            ? 'Your password has expired. Please sign in to set a new one.'
                            : 'You must set a new password before continuing.'
                    );
                    window.location.href = base;
                }
                return Promise.reject(error);
            }

            if (code === 'ACCOUNT_LOCKED') {
                toast.error('Your account is temporarily locked. Please try again later.');
                return Promise.reject(error);
            }
        }

        // Detailed logging for other errors
        if (error.response) {
            console.error(`[ApiClient] ${error.response.status} Error:`, error.response.data);
            if (error.response.status >= 500) {
                window.dispatchEvent(new Event('app_down'));
            }
        } else {
            console.error('[ApiClient] Request Error:', error.message);
            window.dispatchEvent(new Event('app_down'));
        }

        return Promise.reject(error);
    }
);

export default apiClient;
