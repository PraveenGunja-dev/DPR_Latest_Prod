"""
Prove the OTP email is actually produced and delivered, by reading the real
code out of the rendered message rather than out of the database.

Uses the dev outbox, so this exercises the exact same render + deliver path the
corporate SMTP server would receive.
"""
import asyncio
import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import httpx
from conftest import BASE_URL, PASSWORD_A, Results, cleanup_all, close_db, create_test_user, db

# Must match SMTP_DEV_OUTBOX in the environment the server was started with.
OUTBOX = os.getenv("SMTP_DEV_OUTBOX", os.path.join(os.path.dirname(os.path.abspath(__file__)), "outbox"))


def newest_email():
    files = sorted(glob.glob(os.path.join(OUTBOX, "*.html")), key=os.path.getmtime)
    if not files:
        return None, None
    with open(files[-1], encoding="utf-8") as fh:
        return files[-1], fh.read()


def extract_code(html):
    """Pull the 6-digit code out of the rendered email exactly as a human would read it."""
    m = re.search(r'letter-spacing:0\.35em;">(\d{6})</p>', html)
    return m.group(1) if m else None


async def run():
    r = Results("OTP email delivery")
    pool = await db()
    client = httpx.AsyncClient(base_url=BASE_URL, timeout=30.0)
    try:
        user = await create_test_user(pool, "deliver", password=PASSWORD_A)

        # The outbox has to be enabled on the SERVER, not just here - the mail
        # is rendered and written inside the request handler.
        probe = await client.post("/api/auth/email/login",
                                  json={"email": user["email"], "password": PASSWORD_A})
        if probe.status_code == 503:
            print("\n  SKIPPED: the server was started without the dev outbox, and")
            print("  smtp.adani.com is unreachable from this machine, so no mail can")
            print("  be produced. Restart the server with:")
            print("    SMTP_DEV_OUTBOX_ENABLE=true SMTP_DEV_OUTBOX=tests/outbox python run.py")
            return 0
        # Consume the probe challenge so the counting below starts clean.
        await pool.execute("UPDATE auth_otps SET consumed_at = NOW() WHERE user_id = $1",
                           user["user_id"])

        before = len(glob.glob(os.path.join(OUTBOX, "*.html")))
        resp = await client.post("/api/auth/email/login",
                                 json={"email": user["email"], "password": PASSWORD_A})
        body = resp.json()
        r.check(body.get("status") == "OTP_REQUIRED", f"login issued an OTP challenge ({body.get('status')})")

        path, html = newest_email()
        after = len(glob.glob(os.path.join(OUTBOX, "*.html")))
        r.check(after == before + 1, f"exactly one email was produced (outbox {before} -> {after})")
        r.check(html is not None and "Verification Code" in html, "the email is the OTP template")
        r.check(user["email"] in html.split("\n")[0], f"addressed to the user ({os.path.basename(path or '')})")

        code = extract_code(html)
        r.check(code is not None and len(code) == 6 and code.isdigit(),
                f"a readable 6-digit code is present in the email body ({code})")
        r.check("expires in <b>5 minutes</b>" in html, "the email states the 5-minute expiry")

        # The code from the *email* must open the session - proving the whole
        # generate -> hash -> render -> deliver chain lines up.
        verified = await client.post("/api/auth/email/login/verify",
                                     json={"challengeId": body["challengeId"], "otp": code})
        r.check(verified.status_code == 200 and verified.json().get("accessToken"),
                "the code read from the email logs the user in",
                f"got {verified.status_code} {verified.text[:120]}")

        # Resend produces a different code, and the old one stops working.
        login2 = await client.post("/api/auth/email/login",
                                   json={"email": user["email"], "password": PASSWORD_A})
        cid2 = login2.json()["challengeId"]
        _, html2 = newest_email()
        code2 = extract_code(html2)
        r.check(code2 != code, f"a new login produces a different code ({code} -> {code2})")

        stale = await client.post("/api/auth/email/login/verify",
                                  json={"challengeId": body["challengeId"], "otp": code})
        r.check(stale.status_code == 400, "the previous code no longer works")

        ok = await client.post("/api/auth/email/login/verify",
                               json={"challengeId": cid2, "otp": code2})
        r.check(ok.status_code == 200, "the newest code works")

        # Account setup notification must carry no credentials.
        from app.services.email_service import send_account_setup_email
        await send_account_setup_email(user["email"], "Test User", "Supervisor")
        _, setup_html = newest_email()
        r.check("Account created" in setup_html or "account is ready" in setup_html.lower(),
                "the setup notification renders")
        r.check(PASSWORD_A not in setup_html, "the setup notification contains no password")
        r.check("never sent by email" in setup_html,
                "the setup notification explains that passwords are never emailed")

    finally:
        await client.aclose()
        removed = await cleanup_all(pool)
        print(f"\nCleanup: removed {removed} test account(s)")
        await close_db()
    return r.report()


raise SystemExit(asyncio.run(run()))
