// src/services/authSecurityService.ts
//
// Client for the email-login password lifecycle (/api/auth/email/*).
// SSO sign-in is untouched by anything in this file - it still goes straight
// to GET /api/sso/login as a full page redirect.

import axios from "axios";
import apiClient from "./apiClient";

/** Outcome codes the login endpoint can return alongside HTTP 200. */
export type LoginOutcome =
    | "SUCCESS"
    | "OTP_REQUIRED"
    | "PASSWORD_SETUP_REQUIRED"
    | "PASSWORD_EXPIRED";

export interface OtpChallenge {
    challengeId: string;
    maskedEmail: string;
    expiresInSeconds: number;
    resendCooldownSeconds: number;
    maxAttempts: number;
    message?: string;
}

export interface PasswordChallenge {
    challengeToken: string;
    email: string;
    name?: string;
    requiresOtp: boolean;
    message?: string;
}

export interface LoginResult {
    status: LoginOutcome;
    message?: string;
    // Present when status === "SUCCESS"
    accessToken?: string;
    refreshToken?: string;
    user?: any;
    passwordStatus?: PasswordStatus;
    // Present when status === "OTP_REQUIRED"
    challengeId?: string;
    maskedEmail?: string;
    expiresInSeconds?: number;
    resendCooldownSeconds?: number;
    maxAttempts?: number;
    // Present when a password must be set before proceeding
    challengeToken?: string;
    email?: string;
    name?: string;
    requiresOtp?: boolean;
}

export interface PasswordStatus {
    authenticationType?: "EMAIL" | "SSO";
    state: "OK" | "EXPIRED" | "MUST_CHANGE" | "NO_PASSWORD_SET" | "NOT_APPLICABLE";
    daysRemaining: number | null;
    expiresAt?: string | null;
    changedAt?: string | null;
    label: string;
    warn: boolean;
    warningThresholds?: number[];
    accountStatus?: string;
    recoveryEmail?: string | null;
    recoveryEmailVerified?: boolean;
    mustChangePassword?: boolean;
    isFirstLogin?: boolean;
}

/**
 * Normalise an axios failure into an Error carrying the backend's machine
 * code, so callers can branch on `code` instead of matching message strings.
 */
export class AuthApiError extends Error {
    code: string;
    status?: number;
    details: Record<string, any>;

    constructor(message: string, code: string, status?: number, details: Record<string, any> = {}) {
        super(message);
        this.name = "AuthApiError";
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

const toAuthError = (error: any, fallback: string): never => {
    if (axios.isAxiosError(error) && error.response) {
        const detail = (error.response.data?.detail ?? error.response.data) || {};
        const body = typeof detail === "string" ? { message: detail } : detail;
        throw new AuthApiError(
            body.message || fallback,
            body.code || "UNKNOWN",
            error.response.status,
            body,
        );
    }
    throw new AuthApiError(fallback, "NETWORK_ERROR");
};

// ── Login ──────────────────────────────────────────────────────

export const emailLogin = async (email: string, password: string): Promise<LoginResult> => {
    try {
        const { data } = await apiClient.post("/auth/email/login", { email, password });
        return data;
    } catch (error) {
        return toAuthError(error, "Login failed");
    }
};

export const verifyLoginOtp = async (challengeId: string, otp: string): Promise<LoginResult> => {
    try {
        const { data } = await apiClient.post("/auth/email/login/verify", { challengeId, otp });
        return data;
    } catch (error) {
        return toAuthError(error, "Verification failed");
    }
};

export const resendOtp = async (challengeId: string): Promise<OtpChallenge> => {
    try {
        const { data } = await apiClient.post("/auth/email/otp/resend", { challengeId });
        return data;
    } catch (error) {
        return toAuthError(error, "Could not resend the code");
    }
};

// ── First-time setup / forced change / expired ─────────────────

export const submitPasswordSetup = async (
    challengeToken: string,
    newPassword: string,
    confirmPassword: string,
): Promise<OtpChallenge & LoginResult> => {
    try {
        const { data } = await apiClient.post("/auth/email/password/setup", {
            challengeToken, newPassword, confirmPassword,
        });
        return data;
    } catch (error) {
        return toAuthError(error, "Could not set your password");
    }
};

export const verifyPasswordSetup = async (challengeId: string, otp: string): Promise<LoginResult> => {
    try {
        const { data } = await apiClient.post("/auth/email/password/setup/verify", { challengeId, otp });
        return data;
    } catch (error) {
        return toAuthError(error, "Verification failed");
    }
};

// ── Change password (authenticated) ────────────────────────────

export const submitPasswordChange = async (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
): Promise<OtpChallenge & { status: string; passwordExpiresAt?: string }> => {
    try {
        const { data } = await apiClient.post("/auth/email/password/change", {
            currentPassword, newPassword, confirmPassword,
        });
        return data;
    } catch (error) {
        return toAuthError(error, "Could not change your password");
    }
};

export const verifyPasswordChange = async (challengeId: string, otp: string) => {
    try {
        const { data } = await apiClient.post("/auth/email/password/change/verify", { challengeId, otp });
        return data;
    } catch (error) {
        return toAuthError(error, "Verification failed");
    }
};

// ── Forgot password ────────────────────────────────────────────

export const requestPasswordReset = async (email: string): Promise<OtpChallenge & { message: string }> => {
    try {
        const { data } = await apiClient.post("/auth/email/forgot-password", { email });
        return data;
    } catch (error) {
        return toAuthError(error, "Could not start password recovery");
    }
};

export const verifyPasswordReset = async (
    challengeId: string,
    otp: string,
): Promise<{ resetToken: string; email: string; name?: string }> => {
    try {
        const { data } = await apiClient.post("/auth/email/forgot-password/verify", { challengeId, otp });
        return data;
    } catch (error) {
        return toAuthError(error, "Verification failed");
    }
};

export const completePasswordReset = async (
    resetToken: string,
    newPassword: string,
    confirmPassword: string,
) => {
    try {
        const { data } = await apiClient.post("/auth/email/forgot-password/reset", {
            resetToken, newPassword, confirmPassword,
        });
        return data;
    } catch (error) {
        return toAuthError(error, "Could not reset your password");
    }
};

// ── Recovery email ─────────────────────────────────────────────

export const setRecoveryEmail = async (recoveryEmail: string): Promise<OtpChallenge> => {
    try {
        const { data } = await apiClient.post("/auth/email/recovery-email", { recoveryEmail });
        return data;
    } catch (error) {
        return toAuthError(error, "Could not save the recovery email");
    }
};

export const verifyRecoveryEmail = async (challengeId: string, otp: string) => {
    try {
        const { data } = await apiClient.post("/auth/email/recovery-email/verify", { challengeId, otp });
        return data;
    } catch (error) {
        return toAuthError(error, "Verification failed");
    }
};

// ── Status ─────────────────────────────────────────────────────

export const getPasswordStatus = async (): Promise<PasswordStatus> => {
    try {
        const { data } = await apiClient.get("/auth/email/password-status");
        return data;
    } catch (error) {
        return toAuthError(error, "Could not load password status");
    }
};

// ── Admin security actions ─────────────────────────────────────

export const adminForcePasswordChange = async (userId: number) => {
    try {
        const { data } = await apiClient.post(`/super-admin/users/${userId}/force-password-change`);
        return data;
    } catch (error) {
        return toAuthError(error, "Could not force a password change");
    }
};

export const adminUnlockUser = async (userId: number) => {
    try {
        const { data } = await apiClient.post(`/super-admin/users/${userId}/unlock`);
        return data;
    } catch (error) {
        return toAuthError(error, "Could not unlock the account");
    }
};

export const adminResendSetupNotification = async (userId: number) => {
    try {
        const { data } = await apiClient.post(`/super-admin/users/${userId}/resend-setup-notification`);
        return data;
    } catch (error) {
        return toAuthError(error, "Could not send the notification");
    }
};

export const adminResetPassword = async (userId: number, newPassword: string) => {
    try {
        const { data } = await apiClient.post(`/super-admin/users/${userId}/reset-password`, { newPassword });
        return data;
    } catch (error) {
        return toAuthError(error, "Could not reset the password");
    }
};

export interface SecurityEvent {
    id: number;
    action: string;
    timestamp: string;
    ipAddress: string | null;
    device: string | null;
    result: string;
    performedBy: string;
    performedByEmail: string | null;
    remarks: string | null;
}

export const adminGetSecurityEvents = async (
    userId: number,
): Promise<{ user: any; events: SecurityEvent[] }> => {
    try {
        const { data } = await apiClient.get(`/super-admin/users/${userId}/security-events`);
        return data;
    } catch (error) {
        return toAuthError(error, "Could not load security events");
    }
};
