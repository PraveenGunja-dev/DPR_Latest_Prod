# app/routers/auth_email.py
"""
Email-login authentication and password lifecycle.

Every route here applies ONLY to users with authentication_type = 'EMAIL'.
An SSO account that reaches any of these endpoints is rejected: its password
and MFA are owned by Entra ID and the existing /api/sso/* flow is untouched.

Flow shapes
-----------
Login          email + password -> OTP -> tokens
First setup    email + password -> challenge token -> new password -> OTP -> tokens
Expired        identical to first setup, entered from a different trigger
Change         access token + current password -> new password -> OTP -> done
Forgot         email -> OTP -> reset token -> new password -> done

The new password is validated *before* the OTP is sent, and is then held as a
bcrypt hash on the OTP challenge row. It is never re-transmitted by the client
and never stored in clear.
"""

import logging
from datetime import timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError

from app.auth.dependencies import get_current_user
from app.auth.jwt_handler import (
    SCOPE_PASSWORD_CHALLENGE,
    SCOPE_PASSWORD_RESET,
    create_challenge_token,
    generate_tokens,
    verify_challenge_token,
)
from app.auth.password import verify_password_async
from app.auth.password_policy import evaluate_password
from app.config import settings
from app.database import PoolWrapper, get_db
from app.models.auth import (
    EmailLoginRequest,
    ForgotPasswordRequest,
    ForgotPasswordResetRequest,
    OtpResendRequest,
    OtpVerifyRequest,
    PasswordChangeRequest,
    PasswordSetupRequest,
    PasswordStrengthRequest,
    RecoveryEmailRequest,
)
from app.services import account_service as accounts
from app.services import audit_service
from app.services import otp_service
from app.services import session_service
from app.services.account_service import AccountError
from app.services.otp_service import OtpError

logger = logging.getLogger("adani-flow.auth_email")

router = APIRouter(prefix="/api/auth/email", tags=["Email Authentication"])

# Returned for every forgot-password request regardless of whether the address
# exists, so the endpoint cannot be used to enumerate accounts.
GENERIC_FORGOT_RESPONSE = {
    "message": "If an account exists for this email, an OTP has been sent.",
    "status": "OTP_SENT",
}


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _account_error(e: AccountError) -> HTTPException:
    detail: dict[str, Any] = {"message": e.message, "code": e.code}
    detail.update(e.extra)
    return HTTPException(e.http_status, detail=detail)


def _otp_error(e: OtpError) -> HTTPException:
    detail: dict[str, Any] = {"message": e.message, "code": e.code}
    detail.update(e.extra)
    return HTTPException(e.http_status, detail=detail)


async def _send_otp(
    pool,
    user: dict[str, Any],
    purpose: str,
    request: Request,
    destination: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
    enforce_cooldown: bool = False,
) -> dict[str, Any]:
    """
    Issue an OTP and mail it.

    The plaintext lives only between issue_otp() and send_otp_email(); it is
    never returned to the client, logged, or persisted.

    enforce_cooldown defaults to False here because every caller below is
    *starting* a flow, having already proved something (a password, a challenge
    token, a session). Only the explicit resend endpoint passes True. The
    hourly cap applies either way.
    """
    target = destination or accounts.otp_destination(user)
    try:
        challenge_id, otp = await otp_service.issue_otp(
            pool,
            user_id=user["user_id"],
            purpose=purpose,
            destination=target,
            ip_address=audit_service.client_ip(request),
            payload=payload,
            enforce_cooldown=enforce_cooldown,
        )
    except OtpError as e:
        raise _otp_error(e)

    from app.services.email_service import send_otp_email

    delivery = {"success": False}
    try:
        delivery = await send_otp_email(
            target,
            user.get("name") or "there",
            otp,
            otp_service.PURPOSE_LABELS.get(purpose, "Verify your identity"),
            settings.OTP_EXPIRY_MINUTES,
        )
    except Exception as e:
        logger.error(f"Failed to send OTP email for purpose {purpose}: {e}")
    finally:
        del otp  # drop the plaintext as soon as it has been handed to SMTP

    await audit_service.record_audit(
        audit_service.OTP_SENT,
        actor_id=user["user_id"],
        target_user_id=user["user_id"],
        target_entity=audit_service.describe_user(user),
        request=request,
        result=audit_service.RESULT_SUCCESS if delivery.get("success") else audit_service.RESULT_FAILURE,
        remarks=f"Purpose {purpose} to {otp_service.mask_email(target)}"
                + ("" if delivery.get("success") else " - DELIVERY FAILED"),
    )

    if not delivery.get("success"):
        # Burn the challenge: leaving it live would sit the user in front of a
        # verification box waiting for a code that was never sent.
        await otp_service.invalidate_otps(pool, user["user_id"], purpose)
        raise HTTPException(
            503,
            detail={
                "message": "We could not send your verification code. Please try again, "
                           "or contact your administrator if the problem continues.",
                "code": "OTP_DELIVERY_FAILED",
            },
        )

    return {
        "challengeId": challenge_id,
        "maskedEmail": otp_service.mask_email(target),
        "expiresInSeconds": settings.OTP_EXPIRY_MINUTES * 60,
        "resendCooldownSeconds": settings.OTP_RESEND_COOLDOWN_SECONDS,
        "maxAttempts": settings.OTP_MAX_ATTEMPTS,
    }


async def _issue_session(pool, user: dict[str, Any], request: Request) -> dict[str, Any]:
    """Mint tokens, open a tracked session and stamp the successful login."""
    auth_type = accounts.auth_type_of(user)
    session_id = await session_service.start_session(pool, user, request, auth_type)

    tokens = generate_tokens(
        user["user_id"], user["email"], user["role"],
        auth_type=auth_type, session_id=session_id,
    )

    from datetime import datetime

    expires_at = datetime.now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await pool.execute(
        """INSERT INTO refresh_tokens (token, user_id, email, role, expires_at, session_id)
           VALUES ($1, $2, $3, $4, $5, $6)""",
        tokens["refreshToken"], user["user_id"], user["email"], user["role"],
        expires_at, session_id,
    )

    await accounts.record_successful_login(pool, user, request)

    fresh = await accounts.get_user_by_id(pool, user["user_id"])
    status_info = accounts.get_password_status(fresh)

    return {
        "message": "Login successful",
        "status": "SUCCESS",
        "loginStatus": "SUCCESS",
        "accessToken": tokens["accessToken"],
        "refreshToken": tokens["refreshToken"],
        "sessionId": tokens["accessToken"],
        "user": {
            "ObjectId": user["user_id"],
            "Name": user["name"],
            "Email": user["email"],
            "Role": user["role"],
            "AuthenticationType": accounts.auth_type_of(user),
        },
        "passwordStatus": {
            "state": status_info["state"],
            "daysRemaining": status_info["daysRemaining"],
            "warn": status_info["warn"],
            "label": status_info["label"],
        },
    }


def _challenge_response(user: dict[str, Any], code: str, message: str) -> dict[str, Any]:
    """Hand back a scoped, short-lived token that only unlocks the password flow."""
    return {
        "status": code,
        "code": code,
        "message": message,
        "challengeToken": create_challenge_token(
            user["user_id"], user["email"], purpose=code
        ),
        "requiresOtp": settings.PASSWORD_SETUP_REQUIRE_OTP,
        "email": user["email"],
        "name": user.get("name"),
    }


async def _resolve_challenge_token(pool, token: str) -> dict[str, Any]:
    """Verify a password-flow challenge token and load its user."""
    try:
        payload = verify_challenge_token(token, SCOPE_PASSWORD_CHALLENGE)
    except JWTError:
        raise HTTPException(
            401,
            detail={
                "message": "Your password session has expired. Please sign in again.",
                "code": "CHALLENGE_EXPIRED",
            },
        )

    user = await accounts.get_user_by_id(pool, payload.get("userId"))
    if not user:
        raise HTTPException(404, detail={"message": "User not found", "code": "USER_NOT_FOUND"})
    try:
        accounts.assert_email_user(user)
    except AccountError as e:
        raise _account_error(e)
    return user


# ──────────────────────────────────────────────────────────────
# POST /api/auth/email/login
# ──────────────────────────────────────────────────────────────
@router.post("/login")
async def email_login(
    body: EmailLoginRequest,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
):
    """
    Step 1 of email login: verify the password, then decide what happens next.

    Possible outcomes:
      * OTP_REQUIRED               - normal path, a code has been mailed
      * PASSWORD_SETUP_REQUIRED    - first login or admin-forced change
      * PASSWORD_EXPIRED           - the 30-day window has elapsed
      * 401 / 423                  - bad credentials, inactive, or locked
    """
    email = (body.email or "").strip()
    if not email or not body.password:
        raise HTTPException(400, detail={"message": "Email and password are required"})

    user = await accounts.get_user_by_email(pool, email)

    # An SSO account has no DPR password. Point it at the right door instead of
    # failing with a confusing "invalid credentials".
    if user and not accounts.is_email_user(user):
        raise HTTPException(
            400,
            detail={
                "message": "This account signs in with Microsoft SSO. Please use the SSO Login option.",
                "code": "SSO_ACCOUNT",
            },
        )

    if not user or not user.get("password"):
        # Same shape and timing-insensitive message as a wrong password.
        await audit_service.record_audit(
            audit_service.LOGIN_FAILED,
            target_entity=f"Unknown email: {email}",
            request=request,
            result=audit_service.RESULT_FAILURE,
            remarks="No matching email account",
        )
        raise HTTPException(401, detail={"message": "Invalid email or password", "code": "INVALID_CREDENTIALS"})

    if accounts.is_locked(user):
        raise HTTPException(
            423,
            detail={
                "message": "Your account is temporarily locked after repeated failed attempts.",
                "code": "ACCOUNT_LOCKED",
                "retryAfterSeconds": accounts.lock_seconds_remaining(user),
            },
        )

    if user.get("is_active") is False or user.get("account_status") == accounts.STATUS_INACTIVE:
        raise HTTPException(
            401,
            detail={"message": "Your account is inactive. Please contact your administrator.", "code": "ACCOUNT_INACTIVE"},
        )

    if not await verify_password_async(body.password, user["password"]):
        result = await accounts.register_failed_login(pool, user, request)
        if result["lockedUntil"]:
            raise HTTPException(
                423,
                detail={
                    "message": f"Too many failed attempts. Your account is locked for "
                               f"{settings.LOGIN_LOCKOUT_MINUTES} minutes.",
                    "code": "ACCOUNT_LOCKED",
                    "retryAfterSeconds": settings.LOGIN_LOCKOUT_MINUTES * 60,
                },
            )
        raise HTTPException(
            401,
            detail={
                "message": "Invalid email or password",
                "code": "INVALID_CREDENTIALS",
                "attemptsRemaining": result["attemptsRemaining"],
            },
        )

    # Password is correct from here on: the failure counter can be cleared even
    # though the session may still be gated by the lifecycle checks below.
    await accounts.reset_failed_login(pool, user["user_id"])

    block = accounts.access_block_reason(user)
    if block:
        code, message = block
        if code in ("PASSWORD_CHANGE_REQUIRED", "PASSWORD_EXPIRED"):
            if code == "PASSWORD_EXPIRED":
                await audit_service.record_audit(
                    audit_service.PASSWORD_EXPIRED,
                    actor_id=user["user_id"],
                    target_user_id=user["user_id"],
                    target_entity=audit_service.describe_user(user),
                    request=request,
                    result=audit_service.RESULT_FAILURE,
                    remarks="Login blocked: password past its 30-day expiry",
                )
            response_code = (
                "PASSWORD_SETUP_REQUIRED" if code == "PASSWORD_CHANGE_REQUIRED" else "PASSWORD_EXPIRED"
            )
            return _challenge_response(user, response_code, message)
        raise HTTPException(
            423 if code == "ACCOUNT_LOCKED" else 401,
            detail={"message": message, "code": code},
        )

    # The External machine account cannot receive an OTP - see the module
    # docstring on /api/external/token in external_api.py.
    # We also bypass OTP for specific test emails configured in the environment.
    is_test_account = (user.get("email") or "").strip().lower() in settings.test_emails_otp_exempt_list
    if not settings.LOGIN_REQUIRE_OTP or accounts.is_lifecycle_exempt(user) or is_test_account:
        return await _issue_session(pool, user, request)

    challenge = await _send_otp(pool, user, otp_service.PURPOSE_LOGIN, request)
    return {
        "status": "OTP_REQUIRED",
        "code": "OTP_REQUIRED",
        "message": f"A verification code has been sent to {challenge['maskedEmail']}.",
        **challenge,
    }


# ──────────────────────────────────────────────────────────────
# POST /api/auth/email/login/verify
# ──────────────────────────────────────────────────────────────
@router.post("/login/verify")
async def email_login_verify(
    body: OtpVerifyRequest,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
):
    """Step 2 of email login: exchange a correct OTP for a real session."""
    try:
        challenge = await otp_service.verify_otp(
            pool, body.challengeId, body.otp, purpose=otp_service.PURPOSE_LOGIN
        )
    except OtpError as e:
        await audit_service.record_audit(
            audit_service.OTP_FAILED,
            request=request,
            result=audit_service.RESULT_FAILURE,
            remarks=f"Login OTP rejected: {e.code}",
        )
        raise _otp_error(e)

    user = await accounts.get_user_by_id(pool, challenge["user_id"])
    if not user:
        raise HTTPException(404, detail={"message": "User not found", "code": "USER_NOT_FOUND"})

    # Re-check state: it may have changed between issuing and verifying.
    block = accounts.access_block_reason(user)
    if block:
        raise HTTPException(403, detail={"message": block[1], "code": block[0]})

    await audit_service.record_audit(
        audit_service.OTP_VERIFIED,
        actor_id=user["user_id"],
        target_user_id=user["user_id"],
        target_entity=audit_service.describe_user(user),
        request=request,
        remarks="Login OTP verified",
    )
    return await _issue_session(pool, user, request)


# ──────────────────────────────────────────────────────────────
# POST /api/auth/email/otp/resend
# ──────────────────────────────────────────────────────────────
@router.post("/otp/resend")
async def resend_otp(
    body: OtpResendRequest,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
):
    """Re-issue the code for an in-flight challenge, subject to the cooldown."""
    existing = await otp_service.peek_challenge(pool, body.challengeId)
    if not existing:
        raise HTTPException(
            400,
            detail={"message": "This verification session is no longer valid. Please start again.",
                    "code": "OTP_INVALID"},
        )

    user = await accounts.get_user_by_id(pool, existing["user_id"])
    if not user:
        raise HTTPException(404, detail={"message": "User not found", "code": "USER_NOT_FOUND"})

    payload = existing.get("payload")
    if isinstance(payload, str):
        import json
        payload = json.loads(payload)

    # The one place the 60-second cooldown applies: this is the resend button.
    challenge = await _send_otp(
        pool, user, existing["purpose"], request,
        destination=existing["destination"], payload=payload,
        enforce_cooldown=True,
    )
    return {
        "status": "OTP_SENT",
        "message": f"A new verification code has been sent to {challenge['maskedEmail']}.",
        **challenge,
    }


# ──────────────────────────────────────────────────────────────
# POST /api/auth/email/password/setup  (+ /verify)
# ──────────────────────────────────────────────────────────────
@router.post("/password/setup")
async def password_setup(
    body: PasswordSetupRequest,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
):
    """
    Validate a new password for a first-login or expired account.

    The password is fully validated here - policy, current-password
    difference, and the reuse history - and only then is an OTP sent. The
    resulting bcrypt hash rides on the challenge row so the client never sends
    the password twice.
    """
    user = await _resolve_challenge_token(pool, body.challengeToken)

    try:
        password_hash = await accounts.validate_new_password(
            pool, user, body.newPassword, body.confirmPassword
        )
    except AccountError as e:
        raise _account_error(e)

    if not settings.PASSWORD_SETUP_REQUIRE_OTP:
        # Escape hatch for an SMTP outage: commit immediately.
        try:
            result = await accounts.commit_password(
                pool, user["user_id"], password_hash,
                action=audit_service.PASSWORD_CREATED, request=request,
                remarks="Password set without OTP (PASSWORD_SETUP_REQUIRE_OTP disabled)",
            )
        except AccountError as e:
            raise _account_error(e)
        fresh = await accounts.get_user_by_id(pool, user["user_id"])
        session = await _issue_session(pool, fresh, request)
        session["passwordExpiresAt"] = result["passwordExpiresAt"].isoformat()
        return session

    challenge = await _send_otp(
        pool, user, otp_service.PURPOSE_PASSWORD_SETUP, request,
        payload={"new_password_hash": password_hash},
    )
    return {
        "status": "OTP_REQUIRED",
        "message": f"A verification code has been sent to {challenge['maskedEmail']}.",
        **challenge,
    }


@router.post("/password/setup/verify")
async def password_setup_verify(
    body: OtpVerifyRequest,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
):
    """Confirm the OTP and activate the new password, returning a real session."""
    try:
        challenge = await otp_service.verify_otp(
            pool, body.challengeId, body.otp, purpose=otp_service.PURPOSE_PASSWORD_SETUP
        )
    except OtpError as e:
        await audit_service.record_audit(
            audit_service.OTP_FAILED, request=request,
            result=audit_service.RESULT_FAILURE,
            remarks=f"Password setup OTP rejected: {e.code}",
        )
        raise _otp_error(e)

    password_hash = (challenge.get("payload") or {}).get("new_password_hash")
    if not password_hash:
        raise HTTPException(
            400,
            detail={"message": "This password session is no longer valid. Please start again.",
                    "code": "CHALLENGE_INVALID"},
        )

    user = await accounts.get_user_by_id(pool, challenge["user_id"])
    was_first_login = bool(user and user.get("is_first_login"))

    try:
        result = await accounts.commit_password(
            pool, challenge["user_id"], password_hash,
            action=audit_service.PASSWORD_CREATED, request=request,
            remarks="Password created via first-time setup / forced change",
        )
    except AccountError as e:
        raise _account_error(e)

    if was_first_login:
        await audit_service.record_audit(
            audit_service.FIRST_LOGIN,
            actor_id=challenge["user_id"], target_user_id=challenge["user_id"],
            target_entity=audit_service.describe_user(user), request=request,
            remarks="Account setup completed",
        )

    fresh = await accounts.get_user_by_id(pool, challenge["user_id"])
    try:
        from app.services.email_service import send_password_changed_email
        await send_password_changed_email(
            fresh["email"], fresh["name"], result["passwordExpiresAt"].strftime("%d-%b-%Y")
        )
    except Exception as e:
        logger.error(f"Failed to send password-changed notification: {e}")

    session = await _issue_session(pool, fresh, request)
    session["message"] = "Password created successfully"
    session["passwordExpiresAt"] = result["passwordExpiresAt"].isoformat()
    return session


# ──────────────────────────────────────────────────────────────
# POST /api/auth/email/password/change  (+ /verify)
# ──────────────────────────────────────────────────────────────
@router.post("/password/change")
async def password_change(
    body: PasswordChangeRequest,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Profile > Security > Change Password. Requires the current password."""
    user = await accounts.get_user_by_id(pool, current_user["userId"])
    if not user:
        raise HTTPException(404, detail={"message": "User not found", "code": "USER_NOT_FOUND"})

    try:
        accounts.assert_email_user(user)
    except AccountError as e:
        raise _account_error(e)

    if not user.get("password") or not await verify_password_async(body.currentPassword, user["password"]):
        await audit_service.record_audit(
            audit_service.PASSWORD_CHANGED,
            actor_id=user["user_id"], target_user_id=user["user_id"],
            target_entity=audit_service.describe_user(user), request=request,
            result=audit_service.RESULT_FAILURE, remarks="Current password incorrect",
        )
        raise HTTPException(
            400, detail={"message": "Your current password is incorrect.", "code": "CURRENT_PASSWORD_INVALID"}
        )

    try:
        password_hash = await accounts.validate_new_password(
            pool, user, body.newPassword, body.confirmPassword
        )
    except AccountError as e:
        raise _account_error(e)

    if not settings.PASSWORD_SETUP_REQUIRE_OTP:
        try:
            result = await accounts.commit_password(
                pool, user["user_id"], password_hash,
                action=audit_service.PASSWORD_CHANGED, request=request,
                revoke_sessions=False,
            )
        except AccountError as e:
            raise _account_error(e)
        return {
            "status": "SUCCESS",
            "message": "Password changed successfully",
            "passwordExpiresAt": result["passwordExpiresAt"].isoformat(),
        }

    challenge = await _send_otp(
        pool, user, otp_service.PURPOSE_PASSWORD_CHANGE, request,
        destination=user["email"],
        payload={"new_password_hash": password_hash},
    )
    return {
        "status": "OTP_REQUIRED",
        "message": f"A verification code has been sent to {challenge['maskedEmail']}.",
        **challenge,
    }


@router.post("/password/change/verify")
async def password_change_verify(
    body: OtpVerifyRequest,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Confirm the OTP and apply the password change."""
    try:
        challenge = await otp_service.verify_otp(
            pool, body.challengeId, body.otp, purpose=otp_service.PURPOSE_PASSWORD_CHANGE
        )
    except OtpError as e:
        await audit_service.record_audit(
            audit_service.OTP_FAILED,
            actor_id=current_user["userId"], target_user_id=current_user["userId"],
            request=request, result=audit_service.RESULT_FAILURE,
            remarks=f"Password change OTP rejected: {e.code}",
        )
        raise _otp_error(e)

    # A challenge belongs to exactly one account; refuse a token borrowed from
    # another session.
    if challenge["user_id"] != current_user["userId"]:
        raise HTTPException(403, detail={"message": "Access denied", "code": "CHALLENGE_MISMATCH"})

    password_hash = (challenge.get("payload") or {}).get("new_password_hash")
    if not password_hash:
        raise HTTPException(
            400, detail={"message": "This password session is no longer valid. Please start again.",
                         "code": "CHALLENGE_INVALID"}
        )

    try:
        # The current session stays alive: the user is already authenticated
        # and changed their own password deliberately.
        result = await accounts.commit_password(
            pool, challenge["user_id"], password_hash,
            action=audit_service.PASSWORD_CHANGED, request=request,
            revoke_sessions=False,
        )
    except AccountError as e:
        raise _account_error(e)

    user = await accounts.get_user_by_id(pool, challenge["user_id"])
    try:
        from app.services.email_service import send_password_changed_email
        await send_password_changed_email(
            user["email"], user["name"], result["passwordExpiresAt"].strftime("%d-%b-%Y")
        )
    except Exception as e:
        logger.error(f"Failed to send password-changed notification: {e}")

    return {
        "status": "SUCCESS",
        "message": "Password changed successfully",
        "passwordExpiresAt": result["passwordExpiresAt"].isoformat(),
    }


# ──────────────────────────────────────────────────────────────
# Forgot password
# ──────────────────────────────────────────────────────────────
@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
):
    """
    Start password recovery.

    Always answers with the same generic message so the endpoint cannot be
    used to discover which addresses exist. The code goes to the verified
    recovery address when one is set, otherwise to the registered login
    address - the user never gets to nominate a destination here.
    """
    email = (body.email or "").strip()
    user = await accounts.get_user_by_email(pool, email) if email else None

    if not user or not accounts.is_email_user(user) or user.get("is_active") is False:
        await audit_service.record_audit(
            audit_service.PASSWORD_RESET,
            target_entity=f"Email: {email}", request=request,
            result=audit_service.RESULT_FAILURE,
            remarks="Recovery requested for an unknown, SSO or inactive account",
        )
        return GENERIC_FORGOT_RESPONSE

    try:
        challenge = await _send_otp(pool, user, otp_service.PURPOSE_PASSWORD_RESET, request)
    except HTTPException as e:
        # Rate limiting and a delivery failure must not leak existence either:
        # a distinguishable error here would turn this endpoint back into an
        # account-enumeration oracle. The failure is still audited, so an
        # administrator can see that delivery broke.
        if isinstance(e.detail, dict) and e.detail.get("code") in ("OTP_RATE_LIMITED", "OTP_DELIVERY_FAILED"):
            return GENERIC_FORGOT_RESPONSE
        raise

    return {**GENERIC_FORGOT_RESPONSE, **challenge}


@router.post("/forgot-password/verify")
async def forgot_password_verify(
    body: OtpVerifyRequest,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
):
    """Exchange a correct recovery OTP for a short-lived, single-purpose reset token."""
    try:
        challenge = await otp_service.verify_otp(
            pool, body.challengeId, body.otp, purpose=otp_service.PURPOSE_PASSWORD_RESET
        )
    except OtpError as e:
        await audit_service.record_audit(
            audit_service.OTP_FAILED, request=request,
            result=audit_service.RESULT_FAILURE,
            remarks=f"Password reset OTP rejected: {e.code}",
        )
        raise _otp_error(e)

    user = await accounts.get_user_by_id(pool, challenge["user_id"])
    if not user:
        raise HTTPException(404, detail={"message": "User not found", "code": "USER_NOT_FOUND"})

    await audit_service.record_audit(
        audit_service.OTP_VERIFIED,
        actor_id=user["user_id"], target_user_id=user["user_id"],
        target_entity=audit_service.describe_user(user), request=request,
        remarks="Password reset OTP verified",
    )

    return {
        "status": "VERIFIED",
        "message": "Code verified. You can now create a new password.",
        # The challenge id rides along inside the token so the reset step can
        # claim it exactly once - see redeem_challenge below.
        "resetToken": create_challenge_token(
            user["user_id"], user["email"],
            purpose=f"PASSWORD_RESET:{challenge['challenge_id']}", scope=SCOPE_PASSWORD_RESET,
        ),
        "email": user["email"],
        "name": user.get("name"),
    }


@router.post("/forgot-password/reset")
async def forgot_password_reset(
    body: ForgotPasswordResetRequest,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
):
    """Set the new password using the reset token issued after OTP verification."""
    try:
        payload = verify_challenge_token(body.resetToken, SCOPE_PASSWORD_RESET)
    except JWTError:
        raise HTTPException(
            401,
            detail={"message": "Your reset session has expired. Please start again.",
                    "code": "RESET_TOKEN_EXPIRED"},
        )

    user = await accounts.get_user_by_id(pool, payload.get("userId"))
    if not user:
        raise HTTPException(404, detail={"message": "User not found", "code": "USER_NOT_FOUND"})

    # Claim the underlying challenge so this token can only ever set one
    # password. Without it a token captured from a browser or a proxy log could
    # be replayed for the remainder of its 15-minute lifetime.
    _, _, challenge_id = (payload.get("purpose") or "").partition(":")
    if not challenge_id or not await otp_service.redeem_challenge(pool, challenge_id):
        raise HTTPException(
            400,
            detail={"message": "This reset link has already been used. Please start again.",
                    "code": "RESET_TOKEN_USED"},
        )

    try:
        # revoke_sessions defaults to True: a recovery implies the account may
        # have been compromised, so every existing session is dropped.
        result = await accounts.set_password(
            pool, user["user_id"], body.newPassword,
            action=audit_service.PASSWORD_RESET,
            confirm_password=body.confirmPassword,
            request=request,
            remarks="Password reset via forgot-password recovery",
        )
    except AccountError as e:
        raise _account_error(e)

    try:
        from app.services.email_service import send_password_changed_email
        await send_password_changed_email(
            user["email"], user["name"], result["passwordExpiresAt"].strftime("%d-%b-%Y")
        )
    except Exception as e:
        logger.error(f"Failed to send password-changed notification: {e}")

    return {
        "status": "SUCCESS",
        "message": "Your password has been reset. Please sign in with your new password.",
    }


# ──────────────────────────────────────────────────────────────
# Recovery email
# ──────────────────────────────────────────────────────────────
@router.post("/recovery-email")
async def set_recovery_email(
    body: RecoveryEmailRequest,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Begin adding or changing a recovery address.

    The address is stored unverified and a code is sent to it. Until that code
    is confirmed it is never used for recovery, which is what prevents an
    attacker redirecting recovery to an inbox they control.
    """
    import re

    user = await accounts.get_user_by_id(pool, current_user["userId"])
    if not user:
        raise HTTPException(404, detail={"message": "User not found", "code": "USER_NOT_FOUND"})
    try:
        accounts.assert_email_user(user)
    except AccountError as e:
        raise _account_error(e)

    recovery = (body.recoveryEmail or "").strip().lower()
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", recovery):
        raise HTTPException(400, detail={"message": "Enter a valid email address.", "code": "INVALID_EMAIL"})
    if recovery == (user["email"] or "").lower():
        raise HTTPException(
            400,
            detail={"message": "Your recovery email must be different from your login email.",
                    "code": "RECOVERY_SAME_AS_LOGIN"},
        )

    await pool.execute(
        """UPDATE users SET recovery_email = $1, recovery_email_verified = FALSE,
                            updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2""",
        recovery, user["user_id"],
    )

    challenge = await _send_otp(
        pool, user, otp_service.PURPOSE_RECOVERY_EMAIL, request,
        destination=recovery, payload={"recovery_email": recovery},
    )
    return {
        "status": "OTP_REQUIRED",
        "message": f"A verification code has been sent to {challenge['maskedEmail']}.",
        **challenge,
    }


@router.post("/recovery-email/verify")
async def verify_recovery_email(
    body: OtpVerifyRequest,
    request: Request,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Confirm ownership of the recovery address and mark it verified."""
    try:
        challenge = await otp_service.verify_otp(
            pool, body.challengeId, body.otp, purpose=otp_service.PURPOSE_RECOVERY_EMAIL
        )
    except OtpError as e:
        await audit_service.record_audit(
            audit_service.OTP_FAILED,
            actor_id=current_user["userId"], target_user_id=current_user["userId"],
            request=request, result=audit_service.RESULT_FAILURE,
            remarks=f"Recovery email OTP rejected: {e.code}",
        )
        raise _otp_error(e)

    if challenge["user_id"] != current_user["userId"]:
        raise HTTPException(403, detail={"message": "Access denied", "code": "CHALLENGE_MISMATCH"})

    recovery = (challenge.get("payload") or {}).get("recovery_email") or challenge["destination"]
    await pool.execute(
        """UPDATE users SET recovery_email = $1, recovery_email_verified = TRUE,
                            updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2""",
        recovery, challenge["user_id"],
    )

    user = await accounts.get_user_by_id(pool, challenge["user_id"])
    await audit_service.record_audit(
        audit_service.RECOVERY_EMAIL_CHANGED,
        actor_id=user["user_id"], target_user_id=user["user_id"],
        target_entity=audit_service.describe_user(user), request=request,
        remarks=f"Recovery email verified: {otp_service.mask_email(recovery)}",
    )

    try:
        from app.services.email_service import send_recovery_email_changed_email
        await send_recovery_email_changed_email(user["email"], user["name"], recovery)
    except Exception as e:
        logger.error(f"Failed to send recovery-email notification: {e}")

    return {
        "status": "SUCCESS",
        "message": "Recovery email verified.",
        "recoveryEmail": recovery,
        "recoveryEmailVerified": True,
    }


# ──────────────────────────────────────────────────────────────
# Status helpers
# ──────────────────────────────────────────────────────────────
@router.get("/password-status")
async def password_status(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Password and account state for the signed-in user, used by the UI banner."""
    user = await accounts.get_user_by_id(pool, current_user["userId"])
    if not user:
        raise HTTPException(404, detail={"message": "User not found", "code": "USER_NOT_FOUND"})

    info = accounts.get_password_status(user)
    return {
        "authenticationType": accounts.auth_type_of(user),
        "state": info["state"],
        "daysRemaining": info["daysRemaining"],
        "expiresAt": info["expiresAt"].isoformat() if info["expiresAt"] else None,
        "changedAt": info["changedAt"].isoformat() if info["changedAt"] else None,
        "label": info["label"],
        "warn": info["warn"],
        "warningThresholds": settings.password_expiry_warning_days,
        "accountStatus": accounts.compute_account_status(user),
        "recoveryEmail": user.get("recovery_email"),
        "recoveryEmailVerified": bool(user.get("recovery_email_verified")),
        "mustChangePassword": bool(user.get("must_change_password")),
        "isFirstLogin": bool(user.get("is_first_login")),
    }


@router.post("/password-strength")
async def password_strength(body: PasswordStrengthRequest):
    """
    Server-side strength evaluation.

    Unauthenticated on purpose: it is also used from the first-login and
    forgot-password screens, where no access token exists yet. It reveals
    nothing about any account - it only scores the string it is given.
    """
    return evaluate_password(body.password)


@router.get("/policy")
async def password_policy():
    """Public description of the password policy, so the UI never hardcodes it."""
    return {
        "minLength": settings.PASSWORD_MIN_LENGTH,
        "requiresUppercase": True,
        "requiresLowercase": True,
        "requiresNumber": True,
        "requiresSpecial": True,
        "historyCount": settings.PASSWORD_HISTORY_COUNT,
        "expiryDays": settings.PASSWORD_EXPIRY_DAYS,
        "warningDays": settings.password_expiry_warning_days,
        "otp": {
            "length": settings.OTP_LENGTH,
            "expiryMinutes": settings.OTP_EXPIRY_MINUTES,
            "maxAttempts": settings.OTP_MAX_ATTEMPTS,
            "resendCooldownSeconds": settings.OTP_RESEND_COOLDOWN_SECONDS,
        },
        "lockout": {
            "maxFailedAttempts": settings.LOGIN_MAX_FAILED_ATTEMPTS,
            "lockoutMinutes": settings.LOGIN_LOCKOUT_MINUTES,
        },
    }
