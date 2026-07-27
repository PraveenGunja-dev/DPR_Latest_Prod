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
    """Clear the cached token."""
    global _cached_token, _token_expires_at
    _cached_token = None
    _token_expires_at = None


def is_token_valid() -> bool:
    """Check if the cached token is still valid."""
    return (
        _cached_token is not None
        and _token_expires_at is not None
        and time.time() < _token_expires_at
    )
