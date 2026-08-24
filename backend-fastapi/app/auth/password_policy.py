# app/auth/password_policy.py
"""
Password policy and strength scoring for EMAIL-login users.

This module is the single source of truth for what counts as an acceptable
password. The frontend mirrors these rules in src/lib/passwordPolicy.ts purely
to drive the live strength meter - every submission is re-validated here, so a
tampered client gains nothing.

SSO users never reach this module: their password lives in Entra ID.
"""

import re
from typing import Any, Optional

import asyncio

from app.auth.password import verify_password
from app.config import settings

# Strength levels, weakest first. The index into this list is the score.
STRENGTH_LEVELS = ["Weak", "Fair", "Good", "Strong", "Very Strong"]

# Passwords rejected outright regardless of how they score. Kept deliberately
# short and high-value: the character-class and sequence rules below already
# eliminate the bulk of weak choices.
COMMON_PASSWORDS = {
    "password", "password1", "password123", "passw0rd", "p@ssword", "p@ssw0rd",
    "welcome", "welcome1", "welcome123", "qwerty", "qwerty123", "qwertyuiop",
    "letmein", "iloveyou", "admin", "admin123", "administrator", "root",
    "abc123", "abcd1234", "a1b2c3d4", "123456", "1234567", "12345678",
    "123456789", "1234567890", "monkey", "dragon", "sunshine", "princess",
    "football", "baseball", "superman", "trustno1", "master", "shadow",
    "changeme", "change123", "default", "secret", "temp123", "test123",
    "india123", "adani", "adani123", "adani@123", "dpr123", "dpr@123",
}

# Substrings that make a password guessable in this specific deployment.
CONTEXT_WORDS = {"adani", "dpr", "digitalized", "agel", "renewable"}

# Ordered runs used to detect sequential passwords such as "abcdefghi".
_SEQUENCES = [
    "abcdefghijklmnopqrstuvwxyz",
    "0123456789",
    "qwertyuiop",
    "asdfghjkl",
    "zxcvbnm",
]


class PasswordPolicyError(ValueError):
    """Raised when a candidate password violates the policy."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def _strip_non_alnum(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _has_sequential_run(password: str, run_length: int = 4) -> bool:
    """True when the password contains a forward or reverse run such as 'abcd' or '4321'."""
    lowered = password.lower()
    for seq in _SEQUENCES:
        for i in range(len(seq) - run_length + 1):
            window = seq[i:i + run_length]
            if window in lowered or window[::-1] in lowered:
                return True
    return False


def _has_repeated_run(password: str, run_length: int = 4) -> bool:
    """True when the same character repeats run_length times, e.g. 'aaaa'."""
    return bool(re.search(r"(.)\1{" + str(run_length - 1) + r",}", password))


def _is_common(password: str) -> bool:
    lowered = password.lower()
    if lowered in COMMON_PASSWORDS:
        return True
    # Strip a trailing digit/punctuation run so "Password123!" is still caught.
    stem = re.sub(r"[^a-z]+$", "", lowered)
    return bool(stem) and stem in COMMON_PASSWORDS


def evaluate_password(
    password: str,
    email: Optional[str] = None,
    name: Optional[str] = None,
) -> dict[str, Any]:
    """
    Score a candidate password and report which rules it satisfies.

    Returns a dict shaped for direct use by the UI:
        checks  - the five mandatory rules, each True/False
        valid   - every mandatory rule passed and no disqualifier fired
        score   - 0..4, index into STRENGTH_LEVELS
        level   - "Weak" .. "Very Strong"
        errors  - human-readable reasons the password was rejected
    """
    password = password or ""
    min_length = settings.PASSWORD_MIN_LENGTH

    checks = {
        "minLength": len(password) >= min_length,
        "uppercase": bool(re.search(r"[A-Z]", password)),
        "lowercase": bool(re.search(r"[a-z]", password)),
        "number": bool(re.search(r"[0-9]", password)),
        "special": bool(re.search(r"[^A-Za-z0-9]", password)),
    }

    errors: list[str] = []
    if not checks["minLength"]:
        errors.append(f"Password must be at least {min_length} characters long")
    if not checks["uppercase"]:
        errors.append("Password must contain at least one uppercase letter")
    if not checks["lowercase"]:
        errors.append("Password must contain at least one lowercase letter")
    if not checks["number"]:
        errors.append("Password must contain at least one number")
    if not checks["special"]:
        errors.append("Password must contain at least one special character")

    normalised = _strip_non_alnum(password)

    if email:
        local_part = email.split("@")[0]
        for candidate in (email, local_part):
            stripped = _strip_non_alnum(candidate)
            if stripped and (stripped == normalised or (len(stripped) >= 4 and stripped in normalised)):
                errors.append("Password must not contain your email address")
                break

    if name:
        for word in re.split(r"\s+", name.strip()):
            stripped = _strip_non_alnum(word)
            if len(stripped) >= 4 and stripped in normalised:
                errors.append("Password must not contain your name")
                break

    for word in CONTEXT_WORDS:
        if word in normalised:
            errors.append("Password must not contain the organisation or application name")
            break

    if _is_common(password):
        errors.append("Password is too common. Choose something less predictable")

    if _has_sequential_run(password):
        errors.append("Password must not contain sequential characters such as 'abcd' or '1234'")

    if _has_repeated_run(password):
        errors.append("Password must not repeat the same character four or more times")

    # De-duplicate while preserving order.
    errors = list(dict.fromkeys(errors))
    valid = not errors

    # ── Strength scoring ────────────────────────────────────────────
    # Anything that fails a mandatory rule or trips a disqualifier can never
    # be better than "Weak"; the meter must not encourage a rejected password.
    if not valid:
        score = 0
    else:
        score = 1  # a valid password starts at "Fair"
        if len(password) >= min_length + 3:
            score += 1
        if len(password) >= min_length + 7:
            score += 1
        # Variety beyond the bare minimum of one character per class.
        classes_beyond_minimum = sum([
            len(re.findall(r"[A-Z]", password)) >= 2,
            len(re.findall(r"[0-9]", password)) >= 2,
            len(re.findall(r"[^A-Za-z0-9]", password)) >= 2,
            len(set(password)) >= min_length,
        ])
        if classes_beyond_minimum >= 2:
            score += 1
        score = min(score, len(STRENGTH_LEVELS) - 1)

    return {
        "checks": checks,
        "valid": valid,
        "score": score,
        "level": STRENGTH_LEVELS[score],
        "errors": errors,
        "minLength": min_length,
    }


def assert_password_allowed(
    password: str,
    email: Optional[str] = None,
    name: Optional[str] = None,
) -> dict[str, Any]:
    """Evaluate a password and raise PasswordPolicyError if it is not acceptable."""
    result = evaluate_password(password, email=email, name=name)
    if not result["valid"]:
        raise PasswordPolicyError(result["errors"])
    return result


def _history_hashes(history: Optional[list[Any]]) -> list[str]:
    """Extract the stored hashes. Plain strings are accepted so an older format cannot break."""
    hashes = []
    for entry in history or []:
        stored = entry.get("hash") if isinstance(entry, dict) else entry
        if stored:
            hashes.append(stored)
    return hashes


def is_password_reused(password: str, history: Optional[list[Any]]) -> bool:
    """True when the candidate matches any hash in the stored history."""
    return any(verify_password(password, stored) for stored in _history_hashes(history))


async def is_password_reused_async(password: str, history: Optional[list[Any]]) -> bool:
    """
    Async form of is_password_reused.

    Comparing against five bcrypt hashes costs well over a second of CPU, which
    would otherwise stall every other request on the worker for the duration of
    one password change.
    """
    return await asyncio.to_thread(is_password_reused, password, history)


def push_password_history(
    history: Optional[list[Any]],
    password_hash: str,
    changed_at: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Prepend a hash to the history and trim it to PASSWORD_HISTORY_COUNT.

    Only hashes are ever stored - the plaintext never reaches this function.
    """
    entries: list[dict[str, Any]] = []
    for entry in history or []:
        if isinstance(entry, dict) and entry.get("hash"):
            entries.append(entry)
        elif isinstance(entry, str):
            entries.append({"hash": entry, "changed_at": None})

    entries.insert(0, {"hash": password_hash, "changed_at": changed_at})
    return entries[: max(settings.PASSWORD_HISTORY_COUNT, 0)]
