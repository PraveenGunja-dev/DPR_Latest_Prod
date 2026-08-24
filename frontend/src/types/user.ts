// src/types/user.ts

export type UserRole = 'supervisor' | 'Site PM' | 'PMAG' | 'Super Admin' | 'admin' | 'pending_approval';

export type AuthenticationType = 'SSO' | 'EMAIL';

/** Display statuses shown in User Management (spec section 15). */
export type AccountStatus =
    | 'Active'
    | 'Pending Setup'
    | 'Inactive'
    | 'Password Expired'
    | 'Temporarily Locked';

export interface User {
    userId: number;
    ObjectId?: number; // P6 compatibility
    name: string;
    Name?: string; // P6 compatibility
    email: string;
    Email?: string; // P6 compatibility
    role: UserRole;
    Role?: UserRole; // P6 compatibility
    is_active?: boolean;
    sso_provider?: string;
    azure_oid?: string;
    // ── Email-login lifecycle (absent or 'SSO' for SSO accounts) ──
    AuthenticationType?: AuthenticationType;
    RecoveryEmail?: string | null;
    RecoveryEmailVerified?: boolean;
    PasswordState?: string;
    PasswordDaysRemaining?: number | null;
    PasswordWarn?: boolean;
}

/** A row of the Super Admin user list. */
export interface ManagedUser {
    ObjectId: number;
    Name: string;
    Email: string;
    Role: string;
    IsActive: boolean;
    CreatedAt: string;
    AuthenticationType: AuthenticationType;
    AccountStatus: AccountStatus;
    RecoveryEmail: string | null;
    RecoveryEmailVerified: boolean;
    MfaStatus: string;
    PasswordState: string;
    PasswordStatusLabel: string;
    PasswordDaysRemaining: number | null;
    PasswordExpiresAt: string | null;
    PasswordChangedAt: string | null;
    MustChangePassword: boolean;
    IsFirstLogin: boolean;
    FailedLoginAttempts: number;
    LockedUntil: string | null;
    IsLocked: boolean;
    LastLoginAt: string | null;
}

export interface PaginatedUsers {
    items: ManagedUser[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface Supervisor extends User {
    role: 'supervisor';
}

export interface SitePM extends User {
    role: 'Site PM';
}

export interface LoginCredentials {
    email: string;
    password?: string;
}

export interface AuthResponse {
    accessToken: string;
    refreshToken: string;
    user: User;
}

export interface SSOAuthResponse {
    status: 'authenticated' | 'pending_approval' | 'error';
    accessToken?: string;
    refreshToken?: string;
    user: User;
    message?: string;
}

export interface AccessRequest {
    id: number;
    user_name: string;
    user_email: string;
    requested_role: string;
    justification?: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
    reviewer_name?: string;
    reviewer_id?: number;
    reviewed_at?: string;
    review_notes?: string;
}
