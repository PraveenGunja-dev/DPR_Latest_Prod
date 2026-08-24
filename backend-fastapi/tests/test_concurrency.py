# tests/test_concurrency.py
"""
Concurrency correctness: many users signing in at the same moment.

The question this answers is whether simultaneous logins can cross wires -
one user receiving another's code, a challenge being satisfied by the wrong
code, a session issued to the wrong account, or the attempt limit being
slipped by parallel guesses.

Start the server first:
    ./venv/Scripts/python.exe run.py
"""

import asyncio
import os
import sys
import time

import httpx

from conftest import (  # noqa: E402
    BASE_URL, PASSWORD_A, Results, cleanup_all, close_db, create_test_user, db,
)

from app.auth.password import hash_password  # noqa: E402
from app.config import settings  # noqa: E402

USER_COUNT = 10


async def plant_code(pool, user_id: int, purpose: str, code: str) -> str:
    """
    Give one user's live challenge a known, unique code.

    Each user gets a *different* code, which is what makes the cross-wiring
    checks meaningful - identical codes would pass by accident.
    """
    row = await pool.fetchrow(
        """SELECT challenge_id FROM auth_otps
           WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
           ORDER BY id DESC LIMIT 1""",
        user_id, purpose,
    )
    if not row:
        raise AssertionError(f"No live {purpose} challenge for user {user_id}")
    await pool.execute("UPDATE auth_otps SET otp_hash = $1 WHERE challenge_id = $2",
                       hash_password(code), row["challenge_id"])
    return row["challenge_id"]


async def run() -> int:
    r = Results("Concurrency")
    pool = await db()
    client = httpx.AsyncClient(base_url=BASE_URL, timeout=60.0)

    try:
        users = []
        for i in range(USER_COUNT):
            users.append(await create_test_user(pool, f"conc{i}", password=PASSWORD_A))

        # ── 1. Ten simultaneous logins ──────────────────────────
        print(f"\n-- {USER_COUNT} simultaneous logins --")
        started = time.perf_counter()
        responses = await asyncio.gather(*[
            client.post("/api/auth/email/login", json={"email": u["email"], "password": PASSWORD_A})
            for u in users
        ])
        elapsed = time.perf_counter() - started

        r.check(all(x.status_code == 200 for x in responses),
                f"all {USER_COUNT} logins answered 200",
                f"statuses {[x.status_code for x in responses]}")
        bodies = [x.json() for x in responses]
        r.check(all(b.get("status") == "OTP_REQUIRED" for b in bodies),
                "every login produced an OTP challenge")

        challenge_ids = [b["challengeId"] for b in bodies]
        r.check(len(set(challenge_ids)) == USER_COUNT,
                f"every challenge id is unique ({len(set(challenge_ids))}/{USER_COUNT})")
        print(f"     ({elapsed:.2f}s wall clock for {USER_COUNT} concurrent logins)")

        # Each challenge belongs to exactly one user, and to the right one.
        owners = {}
        for u, cid in zip(users, challenge_ids):
            owner = await pool.fetchval(
                "SELECT user_id FROM auth_otps WHERE challenge_id = $1", cid)
            owners[u["user_id"]] = owner
        r.check(all(k == v for k, v in owners.items()),
                "each challenge is bound to the user who requested it")

        # And each code was addressed to that user's own mailbox.
        destinations = {}
        for u, cid in zip(users, challenge_ids):
            destinations[u["email"]] = await pool.fetchval(
                "SELECT destination FROM auth_otps WHERE challenge_id = $1", cid)
        r.check(all(k == v for k, v in destinations.items()),
                "each code was addressed to its own user, with no cross-delivery")

        # ── 2. Codes are independent ────────────────────────────
        print("\n-- Independent codes --")
        codes = {}
        for i, u in enumerate(users):
            code = f"{100000 + i * 11111}"[:6]
            await plant_code(pool, u["user_id"], "LOGIN", code)
            codes[u["user_id"]] = code

        hashes = await pool.fetch(
            "SELECT otp_hash FROM auth_otps WHERE challenge_id = ANY($1)", challenge_ids)
        r.check(len({h["otp_hash"] for h in hashes}) == USER_COUNT,
                "each stored hash is distinct (bcrypt salts differ even for equal codes)")

        # ── 3. Cross-user codes are rejected ────────────────────
        print("\n-- Cross-user verification --")
        crossed = await asyncio.gather(*[
            client.post("/api/auth/email/login/verify", json={
                # Deliberately pair each challenge with the NEXT user's code.
                "challengeId": challenge_ids[i],
                "otp": codes[users[(i + 1) % USER_COUNT]["user_id"]],
            })
            for i in range(USER_COUNT)
        ])
        r.check(all(x.status_code == 400 for x in crossed),
                f"all {USER_COUNT} cross-user attempts rejected",
                f"statuses {[x.status_code for x in crossed]}")
        r.check(not any("accessToken" in x.text for x in crossed),
                "no session leaked from a mismatched code")

        # ── 4. Correct codes, all at once ───────────────────────
        print("\n-- Simultaneous correct verification --")
        started = time.perf_counter()
        verified = await asyncio.gather(*[
            client.post("/api/auth/email/login/verify", json={
                "challengeId": challenge_ids[i], "otp": codes[users[i]["user_id"]],
            })
            for i in range(USER_COUNT)
        ])
        elapsed = time.perf_counter() - started

        r.check(all(x.status_code == 200 for x in verified),
                f"all {USER_COUNT} correct verifications succeeded",
                f"statuses {[x.status_code for x in verified]}")
        print(f"     ({elapsed:.2f}s wall clock for {USER_COUNT} concurrent verifications)")

        # The critical check: every session belongs to the right person.
        issued = [x.json()["user"]["Email"] for x in verified]
        expected = [u["email"] for u in users]
        r.check(issued == expected,
                "every session was issued to the correct user, in the right order",
                f"got {issued}")

        tokens = [x.json()["accessToken"] for x in verified]
        r.check(len(set(tokens)) == USER_COUNT, "every access token is distinct")

        # Confirm identity again through an authenticated call per user.
        profiles = await asyncio.gather(*[
            client.get("/api/auth/profile", headers={"Authorization": f"Bearer {t}"})
            for t in tokens
        ])
        profile_emails = [p.json()["user"]["Email"] for p in profiles]
        r.check(profile_emails == expected,
                "each token resolves back to its own user under concurrent load")

        # Refresh tokens are per user, one each.
        for u in users:
            count = await pool.fetchval(
                "SELECT COUNT(*) FROM refresh_tokens WHERE user_id = $1", u["user_id"])
            if count != 1:
                r.check(False, f"user {u['email']} has exactly one session", f"got {count}")
                break
        else:
            r.check(True, "each user ended with exactly one session")

        # ── 5. Replay of a consumed challenge under load ────────
        print("\n-- Concurrent replay of a consumed challenge --")
        replays = await asyncio.gather(*[
            client.post("/api/auth/email/login/verify", json={
                "challengeId": challenge_ids[0], "otp": codes[users[0]["user_id"]],
            })
            for _ in range(5)
        ])
        r.check(all(x.status_code == 400 for x in replays),
                "a consumed challenge is refused even when replayed in parallel",
                f"statuses {[x.status_code for x in replays]}")

        # ── 6. Parallel guessing cannot exceed the attempt limit ─
        print("\n-- Parallel brute-force against one challenge --")
        target = users[0]
        login = await client.post("/api/auth/email/login",
                                  json={"email": target["email"], "password": PASSWORD_A})
        cid = login.json()["challengeId"]
        real_code = "654321"
        await plant_code(pool, target["user_id"], "LOGIN", real_code)

        # Fire twice the allowed attempts simultaneously.
        guesses = await asyncio.gather(*[
            client.post("/api/auth/email/login/verify",
                        json={"challengeId": cid, "otp": f"{i:06d}"})
            for i in range(settings.OTP_MAX_ATTEMPTS * 2)
        ])
        r.check(all(x.status_code in (400, 429) for x in guesses),
                "every wrong parallel guess is rejected")

        final_attempts = await pool.fetchrow(
            "SELECT attempts, consumed_at FROM auth_otps WHERE challenge_id = $1", cid)
        r.check(final_attempts["consumed_at"] is not None,
                f"the challenge was burned by parallel guessing "
                f"(attempts recorded: {final_attempts['attempts']})")

        after = await client.post("/api/auth/email/login/verify",
                                  json={"challengeId": cid, "otp": real_code})
        r.check(after.status_code == 400,
                "the real code no longer works after the guessing burst",
                f"got {after.status_code}")

        # ── 7. Per-user rate limits stay per-user ───────────────
        print("\n-- Rate limits are per user, not global --")
        # One user burns their hourly cap; the others must be unaffected.
        busy = users[1]
        for _ in range(settings.OTP_MAX_SENDS_PER_HOUR + 2):
            resp = await client.post("/api/auth/email/login",
                                     json={"email": busy["email"], "password": PASSWORD_A})
            if resp.status_code == 429:
                break
        r.check(resp.status_code == 429,
                f"the heavy user hits their own cap at {settings.OTP_MAX_SENDS_PER_HOUR}/hour")

        others = await asyncio.gather(*[
            client.post("/api/auth/email/login", json={"email": u["email"], "password": PASSWORD_A})
            for u in users[2:6]
        ])
        r.check(all(x.status_code == 200 for x in others),
                "other users are unaffected by one user exhausting their cap",
                f"statuses {[x.status_code for x in others]}")

    finally:
        await client.aclose()
        removed = await cleanup_all(pool)
        print(f"\nCleanup: removed {removed} test account(s)")
        await close_db()

    return r.report()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
