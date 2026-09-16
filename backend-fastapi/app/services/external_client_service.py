"""
OAuth2 client-credentials for the External API (app/routers/external_api.py).

A client_id/client_secret pair authenticates AS an existing 'External'-role user (the account
POST /api/external/projects's row-level checks already key off), rather than being an entirely
separate identity - that keeps every downstream check (get_external_user, the role gate) exactly
as it was; only how a token is obtained changes. A secret is never stored or logged in the clear:
create_client() returns it once, the row keeps only its bcrypt hash.

Multiple active clients can exist per user, so a secret can be rotated without downtime: create
the replacement, update the integration, then revoke the old one - never a window with zero valid
credentials.
"""

import logging
import secrets
from typing import Any, Optional

from app.auth.password import hash_password, hash_password_async, verify_password_async

logger = logging.getLogger("adani-flow.external_client")

_CLIENT_ID_PREFIX = "extcli_"

# A real bcrypt hash of a value nobody can ever send (not derived from any real secret), computed
# once at import time so verify_password_async always has a genuine hash to compare against for
# an unknown client_id - see the timing note in authenticate_client below.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(32))


def _generate_client_id() -> str:
    return _CLIENT_ID_PREFIX + secrets.token_hex(12)


def _generate_client_secret() -> str:
    return secrets.token_urlsafe(32)


async def create_client(pool, user_id: int, label: Optional[str], created_by: int) -> dict[str, Any]:
    """Creates a new credential pair. Returns the plaintext secret - the only time it is ever
    available; the caller must show it to the person creating this and then discard it."""
    client_id = _generate_client_id()
    client_secret = _generate_client_secret()
    secret_hash = await hash_password_async(client_secret)

    row = await pool.fetchrow(
        """
        INSERT INTO external_api_clients (client_id, client_secret_hash, user_id, label, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, client_id, label, user_id, is_active, created_at
        """,
        client_id, secret_hash, user_id, label, created_by,
    )
    return {**dict(row), "clientSecret": client_secret}


async def list_clients(pool, user_id: Optional[int] = None) -> list[dict[str, Any]]:
    """Never returns the secret or its hash - this is for a management UI, not authentication."""
    if user_id is not None:
        rows = await pool.fetch(
            """
            SELECT c.id, c.client_id, c.label, c.user_id, u.email as user_email, c.is_active,
                   c.created_at, c.last_used_at, c.revoked_at
            FROM external_api_clients c
            JOIN users u ON u.user_id = c.user_id
            WHERE c.user_id = $1
            ORDER BY c.created_at DESC
            """,
            user_id,
        )
    else:
        rows = await pool.fetch(
            """
            SELECT c.id, c.client_id, c.label, c.user_id, u.email as user_email, c.is_active,
                   c.created_at, c.last_used_at, c.revoked_at
            FROM external_api_clients c
            JOIN users u ON u.user_id = c.user_id
            WHERE u.role = 'External'
            ORDER BY c.created_at DESC
            """
        )
    return [dict(r) for r in rows]


async def revoke_client(pool, client_row_id: int) -> bool:
    result = await pool.execute(
        "UPDATE external_api_clients SET is_active = FALSE, revoked_at = NOW() WHERE id = $1 AND is_active = TRUE",
        client_row_id,
    )
    return "1" in str(result)


async def authenticate_client(pool, client_id: str, client_secret: str) -> Optional[dict[str, Any]]:
    """Verifies a client_id/client_secret pair and returns the External-role user row it
    authenticates as, or None if the pair is invalid, inactive or that user is no longer active.
    Constant-time-ish: the secret is always bcrypt-compared against *some* hash, real or a fixed
    dummy, so a wrong client_id and a wrong secret take the same code path either way an attacker
    cannot use response timing to tell "no such client_id" from "wrong secret".
    """
    row = await pool.fetchrow(
        """
        SELECT c.id, c.client_secret_hash, c.is_active as client_active,
               u.user_id, u.email, u.role, u.is_active as user_active
        FROM external_api_clients c
        JOIN users u ON u.user_id = c.user_id
        WHERE c.client_id = $1
        """,
        client_id,
    )

    secret_hash = row["client_secret_hash"] if row else _DUMMY_HASH

    if not await verify_password_async(client_secret, secret_hash):
        return None
    if not row or not row["client_active"] or not row["user_active"] or row["role"] != "External":
        return None

    await pool.execute("UPDATE external_api_clients SET last_used_at = NOW() WHERE id = $1", row["id"])
    return {"user_id": row["user_id"], "email": row["email"], "role": row["role"]}
