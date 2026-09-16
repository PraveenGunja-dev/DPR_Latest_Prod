# app/seed_users.py
"""
Startup seeding of the EPC/vendor accounts that cannot be provisioned in Entra ID.

Every person listed here works for a contractor - HILD, Enrich Energy, Bondada,
L&T ECC, KP Group, Amara Raja, Sterling & Wilson - on that contractor's own mail
domain. None of them can be created as an Azure AD account in the Adani tenant,
so they need EMAIL-authentication accounts written straight into the DPR
database. That is the only reason this module exists; ordinary Adani staff still
arrive through SSO and must never be listed here.

Keyed on the email address, and case-insensitively: the `users.email` UNIQUE
constraint is case-sensitive but every login lookup is not, so matching on
LOWER(email) is what stops a second row for the same person. An address that is
already present is left completely untouched - name, role, password, status and
project assignments included - so this can run on every startup without ever
overwriting an administrator's later edits. Only missing addresses are inserted.

    Consequence worth knowing: hard-deleting a seeded user brings them back on
    the next restart. To remove someone for good, either deactivate them from
    the Super Admin screen (which this never reverses, because it only ever
    INSERTs) or delete the row AND their entry from SEED_USERS below.

Set SEED_VENDOR_USERS=false to skip the whole pass.
"""

import logging
import os

from app.auth.password import hash_password

logger = logging.getLogger("adani-flow.seed_users")

# Temporary credential handed to every seeded account.
#
# It deliberately does NOT satisfy app/auth/password_policy.py: "digitalized" is
# one of the CONTEXT_WORDS, so assert_password_allowed would reject it. That is
# not a contradiction - the policy governs a password a *user chooses*, and this
# one is never allowed to survive. Each account is created with
# must_change_password + is_first_login, and access_block_reason() checks those
# before anything else, so the first sign-in is forced down the
# PASSWORD_SETUP_REQUIRED path and the replacement password *is* policy-checked.
#
# Override with SEED_USER_TEMP_PASSWORD if a different hand-out is preferred.
DEFAULT_TEMP_PASSWORD = "Digitalized@123"

# (display name, login email, DPR role)
#
# The DPR role is not the same thing as the person's job title. Only
# Supervisor / Site PM / PMAG / Super Admin / External pass users_role_check, so
# the titles supplied by each vendor are mapped as:
#   Plot Head, Project Manager, Project Control Manager, Deputy Manager -> Site PM
#   Planning, Planning - site, Planning - Scheduler, site planner, planner -> Supervisor
# The vendor's own title is kept in the trailing comment so the mapping stays
# auditable against the original list.
SEED_USERS: list[tuple[str, str, str]] = [
    # -- HILD Projects --------------------------------------------
    ("Suraj Sheik Ali", "Shaikalibaba.h@hildprojects.com", "Site PM"),       # Project Manager
    ("Avinash", "planningagel.500mw@hildproject.com", "Supervisor"),         # Site planner

    # -- Enrich Energy --------------------------------------------
    ("Pushpendra Mishra", "pushpendra.mishra@enrichenergy.com", "Site PM"),  # Project Manager
    ("Neeraj Saini", "neeraj.saini@enrichenergy.com", "Supervisor"),         # Site planner

    # -- Bondada --------------------------------------------------
    ("Sridhar Emmadi", "sridhar.emmadi@bondada.net", "Site PM"),             # Plot Head
    ("Nilesh Patil", "nilesh.chhaganpatil@bondada.net", "Supervisor"),       # Planning
    ("Sahil Lokhande", "civil.adani650mw@bondada.net", "Supervisor"),        # Supervisor
    ("Ramiz Nagori", "adani.quality@bondada.net", "Supervisor"),             # Supervisor
    ("Shiyaram Potliya", "shiyaram.potliya@bondada.net", "Supervisor"),      # Supervisor

    # -- L&T ECC --------------------------------------------------
    ("Narayana Panigrahy", "narayanp@lntecc.com", "Site PM"),                # Project Manager
    ("Ashwani Kumar Mishra", "ashwani.mishra@lntecc.com", "Site PM"),        # Project Control Manager
    ("Yaswanth R S N Gandi", "gandi.narayana@lntecc.com", "Supervisor"),     # Planning - Scheduler
    ("Arjun A R", "arjun.r3@lntecc.com", "Supervisor"),                      # Planning
    ("Satyajit Nahak", "satyajitnahak@lntecc.com", "Supervisor"),            # Planning - site
    ("Adarsh Gaur", "adarsh.gaur@lntecc.com", "Supervisor"),                 # Planning - site

    # -- KP Green Energy / KP Group -------------------------------
    ("Manoj Saini", "manoj.saini@kpgreenenergy.com", "Site PM"),             # Plot Head
    # Prince Kumar Singh appears twice in the supplied list, on one shared
    # address with two different phone numbers. An email is one account, so
    # this is the single row for it.
    ("Prince Kumar Singh", "agels6a.project@kpgroup.com", "Supervisor"),     # Site planner

    # -- Amara Raja -----------------------------------------------
    ("Subham Das", "sd22@amararaja.com", "Supervisor"),                      # Planner
    ("Sreekanth Reddy", "dsr4@amararaja.com", "Supervisor"),                 # Site planner
    # Domain is 'amaraja.com' as supplied, not the 'amararaja.com' used by the
    # two rows above. Seeded verbatim on instruction; if that turns out to be a
    # typo the account cannot receive its OTP, and it must then be corrected
    # here and in the database together.
    ("Nawaz Sheikh", "sna1@amaraja.com", "Site PM"),                         # Deputy Manager

    # -- Sterling & Wilson ----------------------------------------
    ("Suprith S S", "suprithss@sterlingwilson.com", "Supervisor"),           # Planning
    ("Vinay Kamat", "vinaykamat@sterlingwilson.com", "Site PM"),             # Plot Head
    ("Vijay Kumar Joshi", "planning.adanisite@sterlingwilson.com", "Supervisor"),      # Planning
    ("Rajagopal Venkataraju", "rajagopal.venkataraju@sterlingwilson.com", "Site PM"),  # Plot Head
    ("Arunendra", "planning.adani400mw@sterlingwilson.com", "Supervisor"),   # Planning
]


def _seeding_enabled() -> bool:
    raw = (os.getenv("SEED_VENDOR_USERS") or "true").strip().lower()
    return raw not in ("false", "0", "no", "off")


def _temp_password() -> str:
    return os.getenv("SEED_USER_TEMP_PASSWORD") or DEFAULT_TEMP_PASSWORD


async def seed_vendor_users(pool):
    """
    Insert every SEED_USERS entry whose email is not already in the users table.

    Never raises - a failure here must not stop the application from starting -
    and never updates a row that already exists.
    """
    if not _seeding_enabled():
        logger.info("Vendor user seeding skipped (SEED_VENDOR_USERS is off)")
        return

    try:
        wanted = [email.lower() for _, email, _ in SEED_USERS]

        rows = await pool.fetch(
            "SELECT LOWER(email) AS email FROM users WHERE LOWER(email) = ANY($1)",
            wanted,
        )
        existing = {row["email"] for row in rows}

        missing = [entry for entry in SEED_USERS if entry[1].lower() not in existing]
        if not missing:
            logger.info(f"Vendor users: all {len(SEED_USERS)} accounts already present")
            return

        # bcrypt at 12 rounds costs about a quarter of a second, so it is paid
        # once for the whole batch, and only when there is something to insert.
        hashed = hash_password(_temp_password())

        created = raced = failed = 0
        for name, email, role in missing:
            try:
                row = await pool.fetchrow(
                    """
                    INSERT INTO users (name, email, password, role, authentication_type,
                                       is_active, is_first_login, must_change_password,
                                       account_status)
                    VALUES ($1, $2, $3, $4, 'EMAIL', TRUE, TRUE, TRUE, 'PENDING_SETUP')
                    ON CONFLICT (email) DO NOTHING
                    RETURNING user_id
                    """,
                    name, email, hashed, role,
                )
                if row:
                    created += 1
                    logger.info(f"Vendor user created: {name} <{email}> as {role}")
                else:
                    # Lost a race with another worker starting at the same time.
                    raced += 1
            except Exception as insert_error:
                failed += 1
                logger.warning(f"Vendor user seed failed for {email}: {insert_error}")

        logger.info(
            f"OK Vendor user seeding complete: created={created} "
            f"already_present={len(existing)} raced={raced} failed={failed}"
        )

    except Exception as e:
        logger.error(f"Vendor user seeding error (non-fatal): {e}")
