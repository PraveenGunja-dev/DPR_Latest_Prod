# app/routers/sso.py
"""
SSO router – Azure AD login and access request management.
Handles the full OAuth2 Authorization Code flow (Web App flow).
"""

import logging
from typing import Optional, Any
import json
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse, FileResponse
import os
import msal

from app.auth.dependencies import get_current_user
from app.auth.jwt_handler import generate_tokens
from app.auth.password import hash_password
from app.config import settings
from app.database import get_db, PoolWrapper

logger = logging.getLogger("adani-flow.sso")

router = APIRouter(prefix="/api/sso", tags=["SSO"])

# MSAL Configuration
def _get_msal_client():
    if not settings.AZURE_CLIENT_ID or not settings.AZURE_TENANT_ID or not settings.AZURE_CLIENT_SECRET:
        logger.error("Azure AD credentials missing in settings")
        return None
    
    authority = f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}"
    return msal.ConfidentialClientApplication(
        settings.AZURE_CLIENT_ID,
        authority=authority,
        client_credential=settings.AZURE_CLIENT_SECRET,
    )

def _get_app_base_url(request: Request):
    """
    Dynamically determine the base URL of the application.
    Prioritize the configured settings.APP_BASE_URL for non-local environments.
    """
    from app.config import settings
    
    # 1. Force Production URL if configured (Top Priority)
    if settings.APP_BASE_URL and "digitalized-dpr.adani.com" in settings.APP_BASE_URL:
        url = settings.APP_BASE_URL.rstrip('/')
        # Strictly enforce HTTPS for production
        if not url.startswith("https://"):
            url = url.replace("http://", "https://", 1)
        return url

    # 2. Local/Dev Detection
    base = str(request.base_url).rstrip('/')
    if "localhost" in base or "127.0.0.1" in base or "0.0.0.0" in base:
        from urllib.parse import urlparse
        parsed = urlparse(base)
        port = parsed.port if parsed.port else 3316
        return f"http://localhost:{port}"

    # 3. Last Resort Fallback
    if settings.APP_BASE_URL:
        return settings.APP_BASE_URL.rstrip('/')
        
    return base

def _get_redirect_uri(request: Request):
    """
    Build the absolute redirect URI for Azure AD.
    Must match the URI registered in Azure Portal.
    """
    base = _get_app_base_url(request)
    prefix = settings.FASTAPI_ROOT_PATH or ""
    # Ensure the callback URL includes the root path if present
    redirect_uri = f"{base}{prefix}/api/sso/callback"
    logger.info(f"[SSO] Built redirect URI: {redirect_uri}")
    return redirect_uri


@router.get("/login")
async def sso_login(request: Request):
    """Initiate Microsoft SSO login redirect."""
    client = _get_msal_client()
    if not client:
        raise HTTPException(500, detail="SSO Not Configured")
    
    # Define scopes
    scopes = ["User.Read"]
    
    # Generate auth URL
    redirect_uri = _get_redirect_uri(request)
    auth_url = client.get_authorization_request_url(
        scopes,
        redirect_uri=redirect_uri,
    )
    
    return RedirectResponse(auth_url)


@router.get("/callback")
async def sso_callback(request: Request, code: Optional[str] = None, pool: PoolWrapper = Depends(get_db)):
    """Handle the callback from Microsoft and exchange code for tokens."""
    if not code:
        # If no code, maybe it's just a direct hit to the page, serving the SPA
        frontend_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")
        index_path = os.path.join(frontend_dist, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"message": "Frontend not found, but callback received."}

    client = _get_msal_client()
    if not client:
        raise HTTPException(500, detail="SSO Not Configured")
    
    # Exchange code for token
    redirect_uri = _get_redirect_uri(request)
    result = client.acquire_token_by_authorization_code(
        code,
        scopes=["User.Read"],
        redirect_uri=redirect_uri
    )
    
    if "error" in result:
        logger.error(f"Azure AD callback error: {result.get('error_description') or result.get('error')}")
        app_base = _get_app_base_url(request)
        return RedirectResponse(f"{app_base}/?sso_error=AzureAuthFailed")

    # Extract user info from id_token claims
    claims = result.get("id_token_claims")
    if not claims:
        # Fallback to Graph API if claims are missing
        import httpx
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {result['access_token']}"},
            )
            azure_user = resp.json()
    else:
        azure_user = {
            "mail": claims.get("preferred_username") or claims.get("email"),
            "displayName": claims.get("name"),
            "id": claims.get("oid") or claims.get("sub")
        }

    email = (azure_user.get("mail") or azure_user.get("userPrincipalName", "")).lower()
    name = azure_user.get("displayName") or azure_user.get("givenName", "User")
    oid = azure_user.get("id")

    if not email:
        app_base = _get_app_base_url(request)
        return RedirectResponse(f"{app_base}/?sso_error=NoEmailFound")

    # Check if user already exists
    row = await pool.fetchrow("SELECT * FROM users WHERE email = $1", email)

    user_data = None
    redirect_path = "/"
    
    if row:
        if not row.get("is_active", True):
            app_base = _get_app_base_url(request)
            return RedirectResponse(f"{app_base}/?sso_error=AccountInactive")

        # Update SSO fields
        await pool.execute(
            "UPDATE users SET sso_provider = 'azure_ad', azure_oid = $1 WHERE user_id = $2",
            oid, row["user_id"],
        )

        # Automatically promote to Super Admin if email matches
        current_role = row["role"]
        if email in settings.super_admin_emails and current_role != "Super Admin":
            await pool.execute("UPDATE users SET role = 'Super Admin' WHERE user_id = $1", row["user_id"])
            current_role = "Super Admin"
            logger.info(f"[SSOCallback] Automatically promoted {email} to Super Admin")

        # If user exists but is inactive (pending approval)
        if not row.get("is_active", True):
            # Check if they already have a pending request
            existing_request = await pool.fetchrow(
                "SELECT id FROM access_requests WHERE user_id = $1 AND status = 'pending'", 
                row["user_id"]
            )
            user_data = {
                "status": "pending_approval",
                "hasPendingRequest": existing_request is not None,
                "user": {
                    "userId": row["user_id"],
                    "ObjectId": row["user_id"],
                    "name": row["name"],
                    "Name": row["name"],
                    "email": row["email"],
                    "Email": row["email"],
                    "role": row["role"],
                    "Role": row["role"]
                }
            }
            redirect_path = "/access-pending"
        else:
            tokens = generate_tokens(row["user_id"], row["email"], current_role)
            user_data = {
                "token": tokens["accessToken"],
                "refreshToken": tokens["refreshToken"],
                "user": {
                    "userId": row["user_id"],
                    "ObjectId": row["user_id"],
                    "name": row["name"],
                    "Name": row["name"],
                    "email": row["email"],
                    "Email": row["email"],
                    "role": current_role,
                    "Role": current_role
                }
            }
            
            if current_role == "Super Admin":
                redirect_path = "/superadmin"
            else:
                redirect_path = "/projects"
    else:
        # Create new user
        try:
            # Check if this new user is the Super Admin
            initial_role = 'Super Admin' if email in settings.super_admin_emails else 'Supervisor'
            is_active = (initial_role == 'Super Admin')
            
            new_row = await pool.fetchrow(
                "INSERT INTO users (name, email, role, is_active, sso_provider, azure_oid) VALUES ($1, $2, $3, $4, 'azure_ad', $5) RETURNING *",
                name, email, initial_role, is_active, oid,
            )
            
            user_data = {
                "status": "authenticated" if is_active else "pending_approval",
                "hasPendingRequest": False,
                "user": {
                    "userId": new_row["user_id"],
                    "ObjectId": new_row["user_id"],
                    "name": new_row["name"],
                    "Name": new_row["name"],
                    "email": new_row["email"],
                    "Email": new_row["email"],
                    "role": new_row["role"],
                    "Role": new_row["role"]
                }
            }
            
            if initial_role == "Super Admin":
                tokens = generate_tokens(new_row["user_id"], new_row["email"], "Super Admin")
                user_data["token"] = tokens["accessToken"]
                user_data["refreshToken"] = tokens["refreshToken"]
                redirect_path = "/superadmin"
            else:
                redirect_path = "/access-pending"
        except Exception as e:
            logger.error(f"Error creating new SSO user: {e}")
            app_base = _get_app_base_url(request)
            return RedirectResponse(f"{app_base}/?sso_error=RegistrationFailed")

    # Redirect back to the frontend with the data in the URL fragment
    app_base = _get_app_base_url(request)
    prefix = settings.FASTAPI_ROOT_PATH or ""
    callback_data = urllib.parse.quote(json.dumps(user_data))
    
    # Final redirect must include the project prefix (e.g. /execution-tracker)
    final_url = f"{app_base}{prefix}{redirect_path}#sso_data={callback_data}"
    logger.info(f"[SSO] Redirecting to: {final_url}")
    return RedirectResponse(final_url)


@router.post("/azure-login")
async def azure_login_legacy(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
):
    """
    Legacy endpoint for frontend-initiated SSO.
    Kept for backward compatibility.
    """
    access_token = body.get("accessToken")
    if not access_token:
        raise HTTPException(400, detail={"message": "Azure access token is required"})

    # Verify Azure token
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            azure_user = resp.json()
    except Exception as e:
        raise HTTPException(401, detail={"message": f"Invalid Azure token: {e}"})

    email = azure_user.get("mail") or azure_user.get("userPrincipalName", "").lower()
    name = azure_user.get("displayName") or azure_user.get("givenName", "User")
    oid = azure_user.get("id")

    if not email:
        raise HTTPException(400, detail={"message": "No email found in Azure AD profile"})

    # Check if user already exists
    row = await pool.fetchrow("SELECT * FROM users WHERE email = $1", email)

    if row:
        if not row.get("is_active", True):
            raise HTTPException(401, detail={"message": "Your account is inactive. Contact admin."})

        # Automatically promote to Super Admin if email matches
        current_role = row["role"]
        if email in settings.super_admin_emails and current_role != "Super Admin":
            await pool.execute("UPDATE users SET role = 'Super Admin' WHERE user_id = $1", row["user_id"])
            current_role = "Super Admin"
            logger.info(f"[LegacySSO] Automatically promoted {email} to Super Admin")

        tokens = generate_tokens(row["user_id"], row["email"], current_role)
        return {
            "message": "SSO login successful",
            "status": "authenticated",
            "accessToken": tokens["accessToken"],
            "refreshToken": tokens["refreshToken"],
            "user": {
                "ObjectId": row["user_id"],
                "Name": row["name"],
                "Email": row["email"],
                "Role": current_role,
            },
        }
    else:
        # Create new user
        try:
            initial_role = 'Super Admin' if email in settings.super_admin_emails else 'pending_approval'
            
            new_user = await pool.fetchrow(
                "INSERT INTO users (name, email, role, sso_provider, azure_oid) VALUES ($1, $2, $3, 'azure_ad', $4) RETURNING *",
                name, email, initial_role, oid,
            )
        except Exception:
            raise HTTPException(400, detail={"message": "Email already exists"})

        if initial_role == "Super Admin":
            tokens = generate_tokens(new_user["user_id"], new_user["email"], "Super Admin")
            return {
                "message": "SSO login successful",
                "status": "authenticated",
                "accessToken": tokens["accessToken"],
                "refreshToken": tokens["refreshToken"],
                "user": {
                    "ObjectId": new_user["user_id"],
                    "Name": new_user["name"],
                    "Email": new_user["email"],
                    "Role": new_user["role"],
                },
            }

        return {
            "message": "SSO registration successful. Your account requires admin approval.",
            "status": "pending_approval",
            "requiresApproval": True,
            "user": {
                "ObjectId": new_user["user_id"],
                "Name": new_user["name"],
                "Email": new_user["email"],
                "Role": new_user["role"],
            },
        }


@router.post("/request-access")
async def request_access(
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
):
    """Request access to the platform."""
    user_id = body.get("userId")
    requested_role = body.get("requestedRole")
    justification = body.get("justification")

    if not user_id or not requested_role:
        raise HTTPException(400, detail={"message": "userId and requestedRole are required"})

    # Check existing pending request
    existing = await pool.fetchrow(
        "SELECT * FROM access_requests WHERE user_id = $1 AND status = 'pending'", user_id
    )
    if existing:
        raise HTTPException(400, detail={"message": "You already have a pending access request"})

    row = await pool.fetchrow("""
        INSERT INTO access_requests (user_id, requested_role, justification) VALUES ($1, $2, $3) RETURNING *
    """, user_id, requested_role, justification)

    try:
        user_id_int = int(user_id)
        from app.services.email_service import send_access_request_email, send_access_request_confirmation
        user = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", user_id_int)
        
        # Notify the first Super Admin listed in config
        admin_emails = settings.super_admin_emails
        admin_email = admin_emails[0] if admin_emails else None
        
        logger.info(f"[request_access] Attempting to send email. Admin: {admin_email}, User found: {user is not None}")
        if user:
            # 1. Notify Super Admin
            if admin_email:
                await send_access_request_email(admin_email, user["name"], user["email"], requested_role, justification)
            # 2. Confirm to User
            await send_access_request_confirmation(user["email"], user["name"], requested_role)
        else:
            logger.warning(f"[request_access] Email not sent: user not found in database for ID {user_id}")
    except Exception as e:
        logger.error(f"Failed to send access request emails: {str(e)}")

    return {"success": True, "message": "Access request submitted", "request": dict(row)}


@router.get("/status/{user_id}")
async def check_access_status(
    user_id: int,
    pool: PoolWrapper = Depends(get_db)
):
    """Public endpoint to check user role/status (for pending users)."""
    row = await pool.fetchrow("SELECT role, is_active FROM users WHERE user_id = $1", user_id)
    if not row:
        raise HTTPException(404, detail={"message": "User not found"})
    return {"role": row["role"], "isActive": row["is_active"] is not False}


@router.get("/access-requests")
async def get_access_requests(
    status: Optional[str] = None,
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get access requests (Super Admin only)."""
    if current_user["role"] != "Super Admin":
        raise HTTPException(403, detail={"message": "Super Admin privileges required"})

    if status:
        rows = await pool.fetch("""
            SELECT ar.*, u.name as user_name, u.email as user_email
            FROM access_requests ar JOIN users u ON ar.user_id = u.user_id
            WHERE ar.status = $1 ORDER BY ar.created_at DESC
        """, status)
    else:
        rows = await pool.fetch("""
            SELECT ar.*, u.name as user_name, u.email as user_email
            FROM access_requests ar JOIN users u ON ar.user_id = u.user_id
            ORDER BY ar.created_at DESC
        """)

    return [dict(r) for r in rows]


@router.get("/access-requests/count")
async def get_pending_count(
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if current_user["role"] != "Super Admin":
        raise HTTPException(403, detail={"message": "Super Admin privileges required"})

    count = await pool.fetchval("SELECT COUNT(*) FROM access_requests WHERE status = 'pending'")
    return {"count": count}


@router.put("/access-requests/{request_id}")
async def update_access_request(
    request_id: int,
    body: dict[str, Any],
    pool: PoolWrapper = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Approve or reject access request (Super Admin only)."""
    if current_user["role"] != "Super Admin":
        raise HTTPException(403, detail={"message": "Super Admin privileges required"})

    action = body.get("action")
    role = body.get("role")
    notes = body.get("notes") or body.get("reviewNotes")

    if action not in ("approve", "reject"):
        raise HTTPException(400, detail={"message": "action must be 'approve' or 'reject'"})

    req = await pool.fetchrow("SELECT * FROM access_requests WHERE id = $1 AND status = 'pending'", request_id)
    if not req:
        raise HTTPException(404, detail={"message": "Request not found or already processed"})

    if action == "approve":
        assigned_role = role or req["requested_role"]
        await pool.execute(
            "UPDATE users SET role = $1, is_active = TRUE WHERE user_id = $2",
            assigned_role, req["user_id"],
        )
        await pool.execute("""
            UPDATE access_requests SET status = 'approved', reviewed_by = $1, review_notes = $2, reviewed_at = CURRENT_TIMESTAMP
            WHERE id = $3
        """, current_user["userId"], notes, request_id)

        user = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", req["user_id"])
        try:
            from app.services.email_service import send_access_approved_email
            if user:
                await send_access_approved_email(user["email"], user["name"], assigned_role)
        except Exception as e:
            logger.error(f"Failed to send approval email: {e}")

        return {"success": True, "message": f"Request approved with role: {assigned_role}"}
    else:
        await pool.execute("""
            UPDATE access_requests SET status = 'rejected', reviewed_by = $1, review_notes = $2, reviewed_at = CURRENT_TIMESTAMP
            WHERE id = $3
        """, current_user["userId"], notes, request_id)

        user = await pool.fetchrow("SELECT name, email FROM users WHERE user_id = $1", req["user_id"])
        try:
            from app.services.email_service import send_access_rejected_email
            if user:
                await send_access_rejected_email(user["email"], user["name"], notes)
        except Exception as e:
            logger.error(f"Failed to send rejection email: {e}")

        return {"success": True, "message": "Request rejected"}
