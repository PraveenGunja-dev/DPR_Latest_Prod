# app/services/p6_token_service.py
"""
Oracle P6 OAuth token management.
Direct port of Express services/p6TokenService.js
"""

import base64
import logging
import time
from typing import Optional
from urllib.parse import urlencode

import httpx

from app.config import settings

logger = logging.getLogger("adani-flow.p6_token")

# Token cache
_cached_token: Optional[str] = None
_token_expires_at: Optional[float] = None

# ── Bad-credential circuit breaker ────────────────────────────────────────────
# Only SUCCESSFUL tokens were ever cached, so a rejected credential was re-sent to Oracle on every
# single call: an auto-sync tick, each push, every "Sync Project" click. IDCS locks the account
# after a handful of consecutive failures, so a password that had simply gone stale escalated into
# a locked account that needs an administrator to clear - the codebase only ever noticed this
# afterwards, via the "account is locked" message in oracle_p6.py.
#
# Once Oracle says the credential itself is bad, sending it again cannot help and can only push the
# account closer to a lockout, so the failure is remembered and every later attempt fails locally
# without touching Oracle. The block is tied to WHICH credential failed (a hash - never the
# password itself), so correcting the password clears it instantly: there is no waiting after a
# genuine fix. The time limit only exists so an account an administrator has unlocked, with the
# same credential still in place, recovers on its own.
_AUTH_BLOCK_SECONDS = 15 * 60

# Oracle's wording for "this credential is wrong" and "you already locked yourself out". Both mean
# retrying is pointless; anything else (timeout, 502, DNS) is transient and must NOT trip this.
_FATAL_AUTH_MARKERS = ("invalid_grant", "incorrect user name or password", "account is locked")

_auth_block: Optional[dict] = None


def _credential_fingerprint(basic_auth: str) -> str:
    """Identify a credential without ever holding the plaintext."""
    import hashlib
    return hashlib.sha256((basic_auth or "").encode("utf-8")).hexdigest()[:16]


def _blocked_reason(basic_auth: str) -> Optional[str]:
    """The stored failure if it applies to THIS credential and has not aged out."""
    global _auth_block
    if not _auth_block:
        return None
    if _auth_block["fingerprint"] != _credential_fingerprint(basic_auth):
        # A different credential - the operator changed it. Give it a clean run.
        logger.info("[P6 Token] Credential changed since the last auth failure; clearing the block.")
        _auth_block = None
        return None
    if time.time() >= _auth_block["until"]:
        logger.info("[P6 Token] Auth block expired; allowing one more attempt.")
        _auth_block = None
        return None
    return _auth_block["error"]


def _record_auth_failure(basic_auth: str, error_text: str) -> None:
    """Remember a credential rejection so it is not retried against Oracle."""
    global _auth_block
    lowered = (error_text or "").lower()
    if not any(marker in lowered for marker in _FATAL_AUTH_MARKERS):
        return  # transient (network, proxy, 5xx that is not an auth rejection) - do not block
    _auth_block = {
        "fingerprint": _credential_fingerprint(basic_auth),
        "until": time.time() + _AUTH_BLOCK_SECONDS,
        "error": (
            "Oracle P6 rejected the stored credential, so further sign-in attempts have been "
            "stopped to avoid locking the account. Update the P6 password (Settings -> Update P6 "
            "Password) and it will be retried immediately."
        ),
    }
    logger.error(
        "[P6 Token] Credential rejected by Oracle. Blocking further token requests for "
        f"{_AUTH_BLOCK_SECONDS // 60} minutes, or until the password is changed."
    )


def clear_auth_block() -> None:
    """Drop the bad-credential block (called when the password is updated)."""
    global _auth_block
    _auth_block = None


def get_auth_block_status() -> Optional[dict]:
    """None when not blocked; otherwise the reason and seconds remaining."""
    if not _auth_block:
        return None
    remaining = int(max(0, _auth_block["until"] - time.time()))
    return {"blocked": True, "error": _auth_block["error"], "retryInSeconds": remaining}


def get_http_client(timeout: float = 10.0) -> httpx.AsyncClient:
    """Get an httpx client configured with proxy if available."""
    proxy_url = settings.HTTPS_PROXY or settings.HTTP_PROXY
    transport = None
    if proxy_url:
        logger.info(f"[P6 Token] Using Proxy: {proxy_url}")
        transport = httpx.AsyncHTTPTransport(proxy=proxy_url, verify=False)

    return httpx.AsyncClient(
        verify=False,  # rejectUnauthorized: false
        timeout=timeout,
        transport=transport,
    )


async def generate_p6_token() -> str:
    """Generate OAuth token from Oracle P6. Returns the access token string."""
    global _cached_token, _token_expires_at

    token_url = settings.ORACLE_P6_TOKEN_URL
    basic_auth = settings.ORACLE_P6_OAUTH_TOKEN

    if not token_url or not basic_auth:
        raise ValueError("Oracle P6 token URL or auth token not configured")

    # Oracle already rejected this exact credential. Sending it again cannot succeed and only
    # counts against the IDCS lockout threshold, so fail here without touching Oracle.
    blocked = _blocked_reason(basic_auth)
    if blocked:
        logger.warning("[P6 Token] Skipping token request - credential is blocked after a rejection.")
        raise Exception(blocked)

    logger.info("[P6 Token] Generating new token from Oracle P6...")

    # Decode username:password from base64
    try:
        decoded = base64.b64decode(basic_auth).decode("utf-8")
        parts = decoded.split(":", 1)
        username = parts[0]
        password = parts[1] if len(parts) > 1 else ""
    except Exception as e:
        raise ValueError(f"Invalid Base64 in ORACLE_P6_OAUTH_TOKEN: {e}")

    # Password Grant flow
    form_data = {
        "grant_type": "password",
        "username": username,
        "password": password,
        "scope": "urn:opc:idm:__myscopes__",
    }

    async with get_http_client() as client:
        response = await client.post(
            token_url,
            content=urlencode(form_data),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            error_body = response.text
            logger.error(f"[P6 Token] HTTP Error getting token. Details: {error_body}")
            # Trips only on a genuine credential rejection; a timeout or a 502 leaves it clear so
            # a transient outage never blocks a credential that is actually fine.
            _record_auth_failure(basic_auth, error_body)
            raise Exception(f"P6 Token Error: {e}. Details: {error_body}")

    data = response.text
    expires_in = 3600  # Default 1 hour

    # Handle raw JWT string
    if isinstance(data, str) and data.strip().startswith("ey"):
        token = data.strip()
        logger.info("[P6 Token] Received raw JWT token string")
    else:
        # Parse JSON
        import json
        try:
            json_data = json.loads(data) if isinstance(data, str) else data
        except json.JSONDecodeError:
            json_data = response.json()

        token = (json_data.get("access_token") or json_data.get("authToken", "")).strip()
        if json_data.get("expires_in"):
            expires_in = json_data["expires_in"]
        elif json_data.get("token_exp"):
            expires_in = json_data["token_exp"]

    if not token:
        raise ValueError("No access_token, authToken, or raw JWT found in response")

    _cached_token = token
    _token_expires_at = time.time() + (expires_in - 60)
    clear_auth_block()  # a success proves the credential is good again

    logger.info(f"[P6 Token] Token generated successfully. Expires in {expires_in}s")
    return token


async def get_valid_p6_token() -> str:
    """Get a valid token, using cache or generating a new one."""
    global _cached_token, _token_expires_at

    if _cached_token and _token_expires_at and time.time() < _token_expires_at:
        logger.info("[P6 Token] Using cached token")
        return _cached_token

    return await generate_p6_token()


def clear_cached_token():
    """Clear the cached token.

    Also lifts any bad-credential block: the only caller is the password-update flow, and the
    whole point of updating the password is that the next attempt should actually be made.
    """
    global _cached_token, _token_expires_at
    _cached_token = None
    _token_expires_at = None
    clear_auth_block()


def is_token_valid() -> bool:
    """Check if the cached token is still valid."""
    return (
        _cached_token is not None
        and _token_expires_at is not None
        and time.time() < _token_expires_at
    )
