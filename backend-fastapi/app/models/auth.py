# app/models/auth.py
"""Pydantic models for auth routes."""

from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: str
    password: str


from pydantic import BaseModel, Field, ConfigDict

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=8)
    role: str


class RefreshTokenRequest(BaseModel):
    refreshToken: str


class LogoutRequest(BaseModel):
    refreshToken: Optional[str] = None


class UserResponse(BaseModel):
    ObjectId: int
    Name: str
    Email: str
    Role: str


class LoginResponse(BaseModel):
    message: str
    accessToken: str
    refreshToken: str
    p6Token: Optional[str] = None
    user: UserResponse
    sessionId: str
    loginStatus: str = "SUCCESS"


class ProfileResponse(BaseModel):
    user: UserResponse


# ──────────────────────────────────────────────────────────────
# Email-login password lifecycle
# ──────────────────────────────────────────────────────────────
# Passwords are carried as plain `str` with no min_length constraint on
# purpose: the policy lives in app.auth.password_policy so that every rejection
# comes back as a readable message rather than a pydantic schema error.


class EmailLoginRequest(BaseModel):
    email: str
    password: str


class OtpVerifyRequest(BaseModel):
    challengeId: str
    otp: str


class OtpResendRequest(BaseModel):
    challengeId: str


class PasswordSetupRequest(BaseModel):
    """First-time setup or forced change, authorised by a challenge token."""
    challengeToken: str
    newPassword: str
    confirmPassword: str


class PasswordChangeRequest(BaseModel):
    """Profile > Security > Change Password, authorised by the access token."""
    currentPassword: str
    newPassword: str
    confirmPassword: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ForgotPasswordResetRequest(BaseModel):
    resetToken: str
    newPassword: str
    confirmPassword: str


class RecoveryEmailRequest(BaseModel):
    recoveryEmail: str


class PasswordStrengthRequest(BaseModel):
    password: str
