# app/auth/password.py
"""
Password hashing and verification using bcrypt directly.
Replaces the passlib dependency because passlib is incompatible with bcrypt >= 4.0.0
"""

import asyncio

import bcrypt


def hash_password(password: str) -> str:
    """Hash a password using bcrypt (compatible with Express bcryptjs hashes)."""
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a bcrypt hash."""
    try:
        pwd_bytes = plain_password.encode('utf-8')
        hash_bytes = hashed_password.strip().encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception as e:
        import logging
        logging.getLogger("adani-flow.auth").error(f"Error in verify_password: {e}")
        return False


# ── Async wrappers ────────────────────────────────────────────────
# bcrypt at 12 rounds costs roughly a quarter of a second of pure CPU. Called
# directly from an async route it blocks the whole event loop, so simultaneous
# sign-ins queue up behind one another - ten at once measured 7.7 seconds.
#
# The bcrypt extension releases the GIL while hashing, so moving the call to a
# worker thread lets concurrent hashes genuinely run in parallel across cores.
# Use these from any request path; the synchronous versions remain for startup
# code, migrations and scripts.

async def hash_password_async(password: str) -> str:
    """Hash a password off the event loop."""
    return await asyncio.to_thread(hash_password, password)


async def verify_password_async(plain_password: str, hashed_password: str) -> bool:
    """Verify a password off the event loop."""
    return await asyncio.to_thread(verify_password, plain_password, hashed_password)
