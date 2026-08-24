# tests/test_otp_service.py
"""
OTP generation, expiry, attempt limits, invalidation and resend throttling.

Talks to the database directly through the service layer, so no server needs
to be running. The plaintext code comes from issue_otp's return value - it is
stored only as a bcrypt hash, so there is nowhere else to read it from.
"""

import asyncio
from datetime import datetime, timedelta, timezone

from conftest import Results, cleanup_all, close_db, create_test_user, db  # noqa: E402

from app.config import settings  # noqa: E402
from app.services import otp_service  # noqa: E402


async def run() -> int:
    r = Results("OTP service")
    pool = await db()

    try:
        user = await create_test_user(pool, "otp")
        uid = user["user_id"]

        print("\n-- Generation --")
        codes = {otp_service.generate_otp() for _ in range(200)}
        r.check(
            all(c.isdigit() and len(c) == settings.OTP_LENGTH for c in codes),
            f"codes are {settings.OTP_LENGTH} digits",
        )
        r.check(len(codes) > 150, f"codes are not predictable ({len(codes)} distinct in 200 draws)")

        print("\n-- Storage --")
        challenge_id, otp = await otp_service.issue_otp(
            pool, uid, otp_service.PURPOSE_LOGIN, user["email"]
        )
        row = await pool.fetchrow("SELECT * FROM auth_otps WHERE challenge_id = $1", challenge_id)
        r.check(row is not None, "challenge persisted")
        r.check(row["otp_hash"].startswith("$2"), "code stored as a bcrypt hash")
        r.check(otp not in row["otp_hash"], "plaintext code does not appear in the stored hash")
        stored_anywhere = await pool.fetchval(
            "SELECT COUNT(*) FROM auth_otps WHERE destination = $1 AND otp_hash = $2", user["email"], otp
        )
        r.check(stored_anywhere == 0, "plaintext code is not stored in any column")

        print("\n-- Verification --")
        try:
            await otp_service.verify_otp(pool, challenge_id, "000000", otp_service.PURPOSE_LOGIN)
            r.check(False, "wrong code rejected")
        except otp_service.OtpInvalid as e:
            r.check(e.extra.get("attemptsRemaining") == settings.OTP_MAX_ATTEMPTS - 1,
                    f"wrong code rejected, {e.extra.get('attemptsRemaining')} attempts remaining")

        result = await otp_service.verify_otp(pool, challenge_id, otp, otp_service.PURPOSE_LOGIN)
        r.check(result["user_id"] == uid, "correct code accepted")

        try:
            await otp_service.verify_otp(pool, challenge_id, otp, otp_service.PURPOSE_LOGIN)
            r.check(False, "consumed code cannot be reused")
        except otp_service.OtpInvalid:
            r.check(True, "consumed code cannot be reused")

        print("\n-- Purpose binding --")
        await pool.execute("DELETE FROM auth_otps WHERE user_id = $1", uid)
        cid, code = await otp_service.issue_otp(pool, uid, otp_service.PURPOSE_PASSWORD_RESET, user["email"])
        try:
            await otp_service.verify_otp(pool, cid, code, otp_service.PURPOSE_LOGIN)
            r.check(False, "a reset code cannot be replayed as a login code")
        except otp_service.OtpInvalid:
            r.check(True, "a reset code cannot be replayed as a login code")

        print("\n-- Attempt limit --")
        await pool.execute("DELETE FROM auth_otps WHERE user_id = $1", uid)
        cid, code = await otp_service.issue_otp(pool, uid, otp_service.PURPOSE_LOGIN, user["email"])
        wrong = "111111" if code != "111111" else "222222"
        exceeded = False
        for attempt in range(settings.OTP_MAX_ATTEMPTS):
            try:
                await otp_service.verify_otp(pool, cid, wrong, otp_service.PURPOSE_LOGIN)
            except otp_service.OtpAttemptsExceeded:
                exceeded = True
                break
            except otp_service.OtpInvalid:
                pass
        r.check(exceeded, f"challenge dies after {settings.OTP_MAX_ATTEMPTS} wrong attempts")

        try:
            await otp_service.verify_otp(pool, cid, code, otp_service.PURPOSE_LOGIN)
            r.check(False, "correct code no longer works once attempts are exhausted")
        except otp_service.OtpError:
            r.check(True, "correct code no longer works once attempts are exhausted")

        print("\n-- Expiry --")
        await pool.execute("DELETE FROM auth_otps WHERE user_id = $1", uid)
        cid, code = await otp_service.issue_otp(pool, uid, otp_service.PURPOSE_LOGIN, user["email"])
        await pool.execute(
            "UPDATE auth_otps SET expires_at = $1 WHERE challenge_id = $2",
            datetime.now(timezone.utc) - timedelta(seconds=1), cid,
        )
        try:
            await otp_service.verify_otp(pool, cid, code, otp_service.PURPOSE_LOGIN)
            r.check(False, "expired code rejected")
        except otp_service.OtpExpired:
            r.check(True, f"expired code rejected (window is {settings.OTP_EXPIRY_MINUTES} minutes)")

        print("\n-- Invalidation of the previous code --")
        await pool.execute("DELETE FROM auth_otps WHERE user_id = $1", uid)
        cid1, code1 = await otp_service.issue_otp(pool, uid, otp_service.PURPOSE_LOGIN, user["email"])
        # Clear the cooldown so a second code can be issued immediately.
        await pool.execute("UPDATE auth_otps SET last_sent_at = $1 WHERE challenge_id = $2",
                           datetime.now(timezone.utc) - timedelta(seconds=300), cid1)
        cid2, code2 = await otp_service.issue_otp(pool, uid, otp_service.PURPOSE_LOGIN, user["email"])
        try:
            await otp_service.verify_otp(pool, cid1, code1, otp_service.PURPOSE_LOGIN)
            r.check(False, "issuing a new code invalidates the previous one")
        except otp_service.OtpInvalid:
            r.check(True, "issuing a new code invalidates the previous one")
        ok = await otp_service.verify_otp(pool, cid2, code2, otp_service.PURPOSE_LOGIN)
        r.check(ok["challenge_id"] == cid2, "the newest code still works")

        print("\n-- Resend cooldown --")
        await pool.execute("DELETE FROM auth_otps WHERE user_id = $1", uid)
        cid, _ = await otp_service.issue_otp(pool, uid, otp_service.PURPOSE_LOGIN, user["email"])
        try:
            await otp_service.issue_otp(pool, uid, otp_service.PURPOSE_LOGIN, user["email"])
            r.check(False, "resend blocked inside the cooldown window")
        except otp_service.OtpRateLimited as e:
            r.check(
                e.extra.get("retryAfterSeconds", 0) <= settings.OTP_RESEND_COOLDOWN_SECONDS,
                f"resend blocked for {settings.OTP_RESEND_COOLDOWN_SECONDS}s "
                f"(retry after {e.extra.get('retryAfterSeconds')}s)",
            )

        print("\n-- Hourly cap --")
        await pool.execute("DELETE FROM auth_otps WHERE user_id = $1", uid)
        issued = 0
        for _ in range(settings.OTP_MAX_SENDS_PER_HOUR + 2):
            try:
                cid, _ = await otp_service.issue_otp(pool, uid, otp_service.PURPOSE_LOGIN, user["email"])
                issued += 1
                await pool.execute(
                    "UPDATE auth_otps SET last_sent_at = $1 WHERE challenge_id = $2",
                    datetime.now(timezone.utc) - timedelta(seconds=300), cid,
                )
            except otp_service.OtpRateLimited:
                break
        r.check(issued == settings.OTP_MAX_SENDS_PER_HOUR,
                f"hourly cap enforced at {settings.OTP_MAX_SENDS_PER_HOUR} (issued {issued})")

        print("\n-- Masking --")
        r.check(otp_service.mask_email("john.smith@company.com") == "jo********@company.com",
                f"email masked as {otp_service.mask_email('john.smith@company.com')}")
        r.check("@" in otp_service.mask_email("ab@x.com"), "short local parts still masked")

    finally:
        removed = await cleanup_all(pool)
        print(f"\nCleanup: removed {removed} test account(s)")
        await close_db()

    return r.report()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
