# app/auth/jwt_handler.py
"""
JWT token creation and verification.
Replaces jsonwebtoken from the Express backend.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

from app.config import settings


# Token scopes. Only SCOPE_ACCESS may be used to reach application routes;
# the others exist purely to carry a user through a password flow and are
# rejected by get_current_user. Tokens minted before scopes existed carry no
# "scope" claim and are treated as access tokens, so live sessions survive.
SCOPE_ACCESS = "access"
SCOPE_PASSWORD_CHALLENGE = "password_challenge"
SCOPE_PASSWORD_RESET = "password_reset"


def create_access_token(
    user_id: int,
    email: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
    auth_type: Optional[str] = None,
    session_id: Optional[str] = None,
) -> str:
    """Create a short-lived access token (default 15 minutes)."""
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        "userId": user_id,
        "email": email,
        "role": role,
        "scope": SCOPE_ACCESS,
        "exp": datetime.now(timezone.utc) + expires_delta,
        "iat": datetime.now(timezone.utc),
    }
    if auth_type:
        # Lets the auth dependency skip the account-status lookup entirely for
        # SSO users, who are never subject to the email password lifecycle.
        payload["authType"] = auth_type
    if session_id:
        # Ties the token to a login session so presence can be tracked and the
        # exact session closed on sign-out.
        payload["sid"] = session_id
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def create_challenge_token(
    user_id: int,
    email: str,
    purpose: str,
    scope: str = SCOPE_PASSWORD_CHALLENGE,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create a short-lived, single-purpose token for a password flow.

    It carries no role and a non-access scope, so it cannot be swapped for
    application access even though it is signed with the same key.
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.CHALLENGE_TOKEN_EXPIRE_MINUTES)

    payload = {
        "userId": user_id,
        "email": email,
        "scope": scope,
        "purpose": purpose,
        "exp": datetime.now(timezone.utc) + expires_delta,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_challenge_token(token: str, scope: str = SCOPE_PASSWORD_CHALLENGE) -> dict:
    """
    Verify a challenge token and confirm it carries the expected scope.

    Raises JWTError when the signature, expiry or scope does not match.
    """
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    if payload.get("scope") != scope:
        raise JWTError("Token scope mismatch")
    return payload


def create_refresh_token(
    user_id: int, email: str, role: str, expires_delta: Optional[timedelta] = None
) -> str:
    """Create a long-lived refresh token (default 7 days)."""
    if expires_delta is None:
        expires_delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    payload = {
        "userId": user_id,
        "email": email,
        "role": role,
        "tokenId": str(uuid.uuid4()),
        "exp": datetime.now(timezone.utc) + expires_delta,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.REFRESH_TOKEN_SECRET, algorithm="HS256")


def verify_access_token(token: str) -> dict:
    """
    Verify and decode an access token.
    Raises JWTError on invalid/expired token.
    Returns the decoded payload dict with userId, email, role.
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload
    except JWTError:
        raise


def verify_refresh_token(token: str) -> dict:
    """
    Verify and decode a refresh token.
    Raises JWTError on invalid/expired token.
    """
    try:
        payload = jwt.decode(token, settings.REFRESH_TOKEN_SECRET, algorithms=["HS256"])
        return payload
    except JWTError:
        raise


def generate_tokens(
    user_id: int,
    email: str,
    role: str,
    auth_type: Optional[str] = None,
    session_id: Optional[str] = None,
) -> dict:
    """Generate both access and refresh tokens. Matches Express generateTokens()."""
    access_token = create_access_token(
        user_id, email, role, auth_type=auth_type, session_id=session_id
    )
    refresh_token = create_refresh_token(user_id, email, role)
    return {"accessToken": access_token, "refreshToken": refresh_token}
